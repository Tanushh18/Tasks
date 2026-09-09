import { apiClient } from "./client";

export interface PollCreator {
  id: string;
  name: string;
}

export interface Poll {
  id: string;
  question: string;
  options: string[];
  createdBy: PollCreator | null;
  closesAt: string | null;
  closed: boolean;
  totalVotes: number;
  counts: number[];
  /** Index of the requesting user's own vote, or null if they haven't voted. */
  myVote: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PollInput {
  question: string;
  options: string[];
  closesAt?: string | null;
}

export async function listPolls(status: "active" | "closed" | "all" = "active"): Promise<Poll[]> {
  const { data } = await apiClient.get<{ polls: Poll[] }>("/polls", { params: { status } });
  return data.polls;
}

export async function getPoll(pollId: string): Promise<Poll> {
  const { data } = await apiClient.get<{ poll: Poll }>(`/polls/${pollId}`);
  return data.poll;
}

export async function createPoll(input: PollInput): Promise<Poll> {
  const { data } = await apiClient.post<{ poll: Poll }>("/polls", input);
  return data.poll;
}

export async function votePoll(pollId: string, optionIndex: number): Promise<Poll> {
  const { data } = await apiClient.post<{ poll: Poll }>(`/polls/${pollId}/vote`, { optionIndex });
  return data.poll;
}

export async function closePoll(pollId: string): Promise<Poll> {
  const { data } = await apiClient.post<{ poll: Poll }>(`/polls/${pollId}/close`);
  return data.poll;
}
