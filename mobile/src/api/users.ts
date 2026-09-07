import { apiClient } from "./client";

export interface UserSearchResult {
  id: string;
  name: string;
}

export async function searchUsers(query: string): Promise<UserSearchResult[]> {
  const { data } = await apiClient.get<{ users: UserSearchResult[] }>("/users", { params: { query } });
  return data.users;
}
