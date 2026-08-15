import { apiClient } from "./client";

export interface SearchTaskResult {
  id: string;
  title: string;
  date: string;
  time: string;
  completed: boolean;
}

export interface SearchTransactionResult {
  id: string;
  accountId: string;
  type: "IN" | "OUT";
  amount: number;
  category: string;
  description: string;
  date: string;
}

export interface SearchAccountResult {
  id: string;
  name: string;
  type: string;
}

export interface SearchResults {
  tasks: SearchTaskResult[];
  transactions: SearchTransactionResult[];
  accounts: SearchAccountResult[];
}

export async function globalSearch(query: string): Promise<SearchResults> {
  const { data } = await apiClient.get<{ results: SearchResults }>("/search", { params: { q: query } });
  return data.results;
}
