import { apiClient } from "./client";
import type { User } from "../types/models";

interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export async function register(mobileNumber: string, mpin: string, confirmMpin: string): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>("/auth/register", { mobileNumber, mpin, confirmMpin });
  return data;
}

export async function login(mobileNumber: string, mpin: string): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>("/auth/login", { mobileNumber, mpin });
  return data;
}

export async function logout(): Promise<void> {
  await apiClient.post("/auth/logout");
}

export async function fetchMe(): Promise<User> {
  const { data } = await apiClient.get<{ user: User }>("/auth/me");
  return data.user;
}

export async function changeMpin(currentMpin: string, newMpin: string, confirmNewMpin: string): Promise<void> {
  await apiClient.post("/auth/change-mpin", { currentMpin, newMpin, confirmNewMpin });
}

export async function updateSettings(input: {
  currency?: string;
  timezone?: string;
  notificationsEnabled?: boolean;
  confirmFinancialActions?: boolean;
  speakAssistantReplies?: boolean;
}): Promise<User> {
  const { data } = await apiClient.put<{ user: User }>("/auth/settings", input);
  return data.user;
}

export async function deleteAccount(): Promise<void> {
  await apiClient.delete("/auth/account");
}
