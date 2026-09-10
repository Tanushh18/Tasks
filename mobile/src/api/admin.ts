import { apiClient } from "./client";
import type { FeatureFlags } from "./features";

export interface AdminUser {
  id: string;
  name: string;
  mobileNumber: string;
  blocked: boolean;
  isAdmin: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export async function listUsers(): Promise<AdminUser[]> {
  const { data } = await apiClient.get<{ users: AdminUser[] }>("/admin");
  return data.users;
}

export async function blockUser(id: string): Promise<AdminUser> {
  const { data } = await apiClient.post<{ user: AdminUser }>(`/admin/${id}/block`);
  return data.user;
}

export async function unblockUser(id: string): Promise<AdminUser> {
  const { data } = await apiClient.post<{ user: AdminUser }>(`/admin/${id}/unblock`);
  return data.user;
}

export async function resetMpin(id: string): Promise<{ mpin: string; user: AdminUser }> {
  const { data } = await apiClient.post<{ mpin: string; user: AdminUser }>(`/admin/${id}/reset-mpin`);
  return data;
}

export async function getFeatureFlags(): Promise<FeatureFlags> {
  const { data } = await apiClient.get<{ features: FeatureFlags }>("/admin/features");
  return data.features;
}

export async function updateFeatureFlags(patch: Partial<FeatureFlags>): Promise<FeatureFlags> {
  const { data } = await apiClient.patch<{ features: FeatureFlags }>("/admin/features", patch);
  return data.features;
}
