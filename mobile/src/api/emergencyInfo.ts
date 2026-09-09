import { apiClient } from "./client";

export interface EmergencyContact {
  name: string;
  phone: string;
  relation: string;
}

export interface EmergencyInfo {
  id?: string;
  ownerId: string;
  emergencyContacts: EmergencyContact[];
  medicalNotes: string;
  homeInfo: string;
}

export interface EmergencyInfoInput {
  emergencyContacts?: EmergencyContact[];
  medicalNotes?: string;
  homeInfo?: string;
}

export async function getOwnEmergencyInfo(): Promise<EmergencyInfo> {
  const { data } = await apiClient.get<{ info: EmergencyInfo }>("/emergency-info");
  return data.info;
}

export async function getEmergencyInfoForUser(userId: string): Promise<EmergencyInfo> {
  const { data } = await apiClient.get<{ info: EmergencyInfo }>(`/emergency-info/${userId}`);
  return data.info;
}

export async function updateOwnEmergencyInfo(input: EmergencyInfoInput): Promise<EmergencyInfo> {
  const { data } = await apiClient.put<{ info: EmergencyInfo }>("/emergency-info", input);
  return data.info;
}
