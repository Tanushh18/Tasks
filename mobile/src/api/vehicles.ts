import { apiClient } from "./client";

export interface Vehicle {
  id: string;
  name: string;
  ownerId: string;
  sharedWith: string[];
  createdAt: string;
  updatedAt: string;
}

export interface VehicleInput {
  name: string;
  sharedWith?: string[];
}

export async function listVehicles(): Promise<Vehicle[]> {
  const { data } = await apiClient.get<{ vehicles: Vehicle[] }>("/vehicles");
  return data.vehicles;
}

export async function getVehicle(id: string): Promise<Vehicle> {
  const { data } = await apiClient.get<{ vehicle: Vehicle }>(`/vehicles/${id}`);
  return data.vehicle;
}

export async function createVehicle(input: VehicleInput): Promise<Vehicle> {
  const { data } = await apiClient.post<{ vehicle: Vehicle }>("/vehicles", input);
  return data.vehicle;
}

export async function updateVehicle(id: string, input: Partial<VehicleInput>): Promise<Vehicle> {
  const { data } = await apiClient.put<{ vehicle: Vehicle }>(`/vehicles/${id}`, input);
  return data.vehicle;
}

export async function deleteVehicle(id: string): Promise<void> {
  await apiClient.delete(`/vehicles/${id}`);
}
