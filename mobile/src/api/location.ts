import { apiClient } from "./client";

export interface LocationPingInput {
  lat: number;
  lng: number;
  accuracy?: number;
}

export async function pingLocation(input: LocationPingInput): Promise<void> {
  await apiClient.post("/location/ping", input);
}

export interface ShareTarget {
  id: string;
  name: string;
}

export interface SharedWithMeEntry {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  updatedAt: string | null;
}

export interface LocationShares {
  sharingWith: ShareTarget[];
  sharedWithMe: SharedWithMeEntry[];
}

export async function getShares(): Promise<LocationShares> {
  const { data } = await apiClient.get<LocationShares>("/location/shares");
  return data;
}

export async function startSharing(toUserId: string): Promise<void> {
  await apiClient.post("/location/shares", { toUserId });
}

export async function stopSharing(toUserId: string): Promise<void> {
  await apiClient.delete(`/location/shares/${toUserId}`);
}
