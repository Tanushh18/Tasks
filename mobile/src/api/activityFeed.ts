import { apiClient } from "./client";

export type ActivityKind = "task" | "expense" | "contact" | "group-expense" | "note";

export interface ActivityEntry {
  id: string;
  kind: ActivityKind;
  actorName: string;
  text: string;
  amount: number | null;
  at: string;
}

export async function getActivityFeed(): Promise<ActivityEntry[]> {
  const { data } = await apiClient.get<{ entries: ActivityEntry[] }>("/activity-feed");
  return data.entries;
}
