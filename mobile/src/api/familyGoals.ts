import { apiClient } from "./client";

export interface GoalMember {
  id: string;
  name: string;
}

export interface FamilyGoal {
  id: string;
  name: string;
  targetAmount: number;
  createdBy: GoalMember | null;
  sharedWith: GoalMember[];
  deadline: string | null;
  archived: boolean;
  savedAmount: number;
  progress: number;
  createdAt: string;
  updatedAt: string;
}

export interface GoalInput {
  name: string;
  targetAmount: number;
  sharedWith?: string[];
  deadline?: string | null;
}

export interface GoalContribution {
  id: string;
  goalId: string;
  contributedBy: GoalMember | null;
  amount: number;
  date: string;
  note: string;
  createdAt: string;
}

export interface ContributionInput {
  amount: number;
  date: string;
  note?: string;
}

export async function listGoals(): Promise<FamilyGoal[]> {
  const { data } = await apiClient.get<{ goals: FamilyGoal[] }>("/family-goals");
  return data.goals;
}

export async function getGoal(id: string): Promise<FamilyGoal> {
  const { data } = await apiClient.get<{ goal: FamilyGoal }>(`/family-goals/${id}`);
  return data.goal;
}

export async function createGoal(input: GoalInput): Promise<FamilyGoal> {
  const { data } = await apiClient.post<{ goal: FamilyGoal }>("/family-goals", input);
  return data.goal;
}

export async function updateGoal(
  id: string,
  input: Partial<GoalInput> & { archived?: boolean }
): Promise<FamilyGoal> {
  const { data } = await apiClient.put<{ goal: FamilyGoal }>(`/family-goals/${id}`, input);
  return data.goal;
}

export async function deleteGoal(id: string): Promise<void> {
  await apiClient.delete(`/family-goals/${id}`);
}

export async function listContributions(goalId: string): Promise<GoalContribution[]> {
  const { data } = await apiClient.get<{ contributions: GoalContribution[] }>(
    `/family-goals/${goalId}/contributions`
  );
  return data.contributions;
}

export async function addContribution(goalId: string, input: ContributionInput): Promise<GoalContribution> {
  const { data } = await apiClient.post<{ contribution: GoalContribution }>(
    `/family-goals/${goalId}/contributions`,
    input
  );
  return data.contribution;
}
