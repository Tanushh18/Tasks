import { FamilyGoal, type FamilyGoalDocument } from "../models/FamilyGoal";
import { GoalContribution, type GoalContributionDocument } from "../models/GoalContribution";
import { ApiError } from "../utils/ApiError";

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function scopedQuery(userId: string) {
  return { $or: [{ createdBy: userId }, { sharedWith: userId }] };
}

async function getScopedGoal(userId: string, id: string): Promise<FamilyGoalDocument> {
  const goal = await FamilyGoal.findOne({ _id: id, ...scopedQuery(userId) });
  if (!goal) throw ApiError.notFound("Goal not found");
  return goal;
}

async function getOwnedGoal(userId: string, id: string): Promise<FamilyGoalDocument> {
  const goal = await FamilyGoal.findById(id);
  if (!goal) throw ApiError.notFound("Goal not found");
  if (String(goal.createdBy) !== String(userId)) {
    throw ApiError.forbidden("Only the goal's creator can make this change");
  }
  return goal;
}

export interface GoalInput {
  name: string;
  targetAmount: number;
  sharedWith?: string[];
  deadline?: string | null;
}

export interface GoalWithProgress {
  goal: FamilyGoalDocument;
  savedAmount: number;
  progress: number;
}

// Sum contributions at read time rather than storing a running total, so a
// deleted or edited contribution can never leave the goal's numbers stale.
async function withProgress(goal: FamilyGoalDocument): Promise<GoalWithProgress> {
  const contributions = await GoalContribution.find({ goalId: goal._id });
  const savedAmount = round2(contributions.reduce((sum, c) => sum + c.amount, 0));
  const progress = goal.targetAmount > 0 ? round2(savedAmount / goal.targetAmount) : 0;
  return { goal, savedAmount, progress };
}

export async function listGoals(userId: string): Promise<GoalWithProgress[]> {
  const goals = await FamilyGoal.find(scopedQuery(userId))
    .populate("createdBy", "name")
    .populate("sharedWith", "name")
    .sort("-createdAt");
  return Promise.all(goals.map(withProgress));
}

export async function getGoal(userId: string, id: string): Promise<GoalWithProgress> {
  const goal = await getScopedGoal(userId, id);
  await goal.populate([
    { path: "createdBy", select: "name" },
    { path: "sharedWith", select: "name" },
  ]);
  return withProgress(goal);
}

export async function createGoal(userId: string, input: GoalInput): Promise<GoalWithProgress> {
  const goal = await FamilyGoal.create({
    name: input.name,
    targetAmount: input.targetAmount,
    createdBy: userId,
    sharedWith: input.sharedWith ?? [],
    deadline: input.deadline ?? null,
  });
  await goal.populate([
    { path: "createdBy", select: "name" },
    { path: "sharedWith", select: "name" },
  ]);
  return withProgress(goal);
}

export async function updateGoal(
  userId: string,
  id: string,
  input: Partial<GoalInput> & { archived?: boolean }
): Promise<GoalWithProgress> {
  const goal = await getOwnedGoal(userId, id);
  if (input.name !== undefined) goal.name = input.name;
  if (input.targetAmount !== undefined) goal.targetAmount = input.targetAmount;
  if (input.sharedWith !== undefined) {
    goal.sharedWith = input.sharedWith as unknown as FamilyGoalDocument["sharedWith"];
  }
  if (input.deadline !== undefined) goal.deadline = input.deadline;
  if (input.archived !== undefined) goal.archived = input.archived;
  await goal.save();
  await goal.populate([
    { path: "createdBy", select: "name" },
    { path: "sharedWith", select: "name" },
  ]);
  return withProgress(goal);
}

export async function deleteGoal(userId: string, id: string): Promise<void> {
  const goal = await getOwnedGoal(userId, id);
  await Promise.all([
    GoalContribution.deleteMany({ goalId: goal._id }),
    FamilyGoal.deleteOne({ _id: goal._id }),
  ]);
}

export interface ContributionInput {
  amount: number;
  date: string;
  note?: string;
}

export async function listContributions(userId: string, goalId: string): Promise<GoalContributionDocument[]> {
  await getScopedGoal(userId, goalId);
  return GoalContribution.find({ goalId }).populate("contributedBy", "name").sort("-date -createdAt");
}

export async function addContribution(
  userId: string,
  goalId: string,
  input: ContributionInput
): Promise<GoalContributionDocument> {
  await getScopedGoal(userId, goalId);
  const contribution = await GoalContribution.create({
    goalId,
    contributedBy: userId,
    amount: round2(input.amount),
    date: input.date,
    note: input.note ?? "",
  });
  return contribution.populate({ path: "contributedBy", select: "name" });
}
