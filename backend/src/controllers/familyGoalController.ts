import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as familyGoalService from "../services/familyGoalService";

type PopulatedRef = { _id: unknown; name: string } | null | undefined;

function serializeRef(ref: PopulatedRef) {
  if (!ref || typeof ref !== "object" || !("name" in ref)) return null;
  return { id: String(ref._id), name: ref.name };
}

function serializeGoal(entry: Awaited<ReturnType<typeof familyGoalService.createGoal>>) {
  const { goal, savedAmount, progress } = entry;
  const sharedWith = (goal.sharedWith as unknown as PopulatedRef[]) ?? [];
  return {
    id: String(goal._id),
    name: goal.name,
    targetAmount: goal.targetAmount,
    createdBy: serializeRef(goal.createdBy as unknown as PopulatedRef),
    sharedWith: sharedWith.map(serializeRef).filter((r): r is { id: string; name: string } => r !== null),
    deadline: goal.deadline,
    archived: goal.archived,
    savedAmount,
    progress,
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt,
  };
}

function serializeContribution(
  contribution: Awaited<ReturnType<typeof familyGoalService.addContribution>>
) {
  return {
    id: String(contribution._id),
    goalId: String(contribution.goalId),
    contributedBy: serializeRef(contribution.contributedBy as unknown as PopulatedRef),
    amount: contribution.amount,
    date: contribution.date,
    note: contribution.note,
    createdAt: contribution.createdAt,
  };
}

export const listGoals = asyncHandler(async (req: Request, res: Response) => {
  const goals = await familyGoalService.listGoals(req.userId!);
  res.json({ goals: goals.map(serializeGoal) });
});

export const getGoal = asyncHandler(async (req: Request, res: Response) => {
  const goal = await familyGoalService.getGoal(req.userId!, req.params.id);
  res.json({ goal: serializeGoal(goal) });
});

export const createGoal = asyncHandler(async (req: Request, res: Response) => {
  const goal = await familyGoalService.createGoal(req.userId!, req.body);
  res.status(201).json({ goal: serializeGoal(goal) });
});

export const updateGoal = asyncHandler(async (req: Request, res: Response) => {
  const goal = await familyGoalService.updateGoal(req.userId!, req.params.id, req.body);
  res.json({ goal: serializeGoal(goal) });
});

export const deleteGoal = asyncHandler(async (req: Request, res: Response) => {
  await familyGoalService.deleteGoal(req.userId!, req.params.id);
  res.status(204).send();
});

export const listContributions = asyncHandler(async (req: Request, res: Response) => {
  const contributions = await familyGoalService.listContributions(req.userId!, req.params.goalId);
  res.json({ contributions: contributions.map(serializeContribution) });
});

export const addContribution = asyncHandler(async (req: Request, res: Response) => {
  const contribution = await familyGoalService.addContribution(req.userId!, req.params.goalId, req.body);
  res.status(201).json({ contribution: serializeContribution(contribution) });
});
