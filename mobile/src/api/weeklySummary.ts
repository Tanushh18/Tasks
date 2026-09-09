import { apiClient } from "./client";

export interface WeeklySummary {
  rangeStart: string;
  rangeEnd: string;
  tasksCompleted: number;
  totalExpenses: number;
  upcomingReminders: number;
  groupExpensesTotal: number | null;
  unreadMessages: number | null;
  /** One computed (not AI-generated) line, e.g. the top spending category. */
  insight: string | null;
}

export async function getWeeklySummary(): Promise<WeeklySummary> {
  const { data } = await apiClient.get<WeeklySummary>("/weekly-summary");
  return data;
}
