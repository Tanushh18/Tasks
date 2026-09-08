import { apiClient } from "./client";

export interface UserSearchResult {
  id: string;
  name: string;
  /** Last sign-in, when the server knows it — used for "last seen" on the Family screen. */
  lastActiveAt?: string | null;
}

export async function searchUsers(query: string): Promise<UserSearchResult[]> {
  const { data } = await apiClient.get<{ users: UserSearchResult[] }>("/users", { params: { query } });
  return data.users;
}

/** Everyone else on this family's account — the roster, not a search. */
export async function listFamilyMembers(): Promise<UserSearchResult[]> {
  const { data } = await apiClient.get<{ users: UserSearchResult[] }>("/users");
  return data.users;
}
