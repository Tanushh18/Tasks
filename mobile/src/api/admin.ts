import { apiClient } from "./client";

export interface AdminUser {
  id: string;
  name: string;
  mobileNumber: string;
  blocked: boolean;
  isAdmin: boolean;
  createdAt: string;
}

export async function listUsers(): Promise<AdminUser[]> {
  const { data } = await apiClient.get<{ users: AdminUser[] }>("/admin/users");
  return data.users;
}

export async function blockUser(id: string): Promise<AdminUser> {
  const { data } = await apiClient.post<{ user: AdminUser }>(`/admin/users/${id}/block`);
  return data.user;
}

export async function unblockUser(id: string): Promise<AdminUser> {
  const { data } = await apiClient.post<{ user: AdminUser }>(`/admin/users/${id}/unblock`);
  return data.user;
}

export async function resetMpin(id: string): Promise<{ mpin: string; user: AdminUser }> {
  const { data } = await apiClient.post<{ mpin: string; user: AdminUser }>(`/admin/users/${id}/reset-mpin`);
  return data;
}
