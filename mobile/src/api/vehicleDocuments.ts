import { apiClient } from "./client";

export type VehicleDocumentType = "pollution" | "insurance" | "registration" | "service" | "warranty" | "other";

export interface VehicleDocument {
  id: string;
  vehicleId: string;
  type: VehicleDocumentType;
  customLabel: string | null;
  expiresAt: string | null;
  reminderEnabled: boolean;
  fileData: string | null;
  fileName: string | null;
  notes: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleDocumentInput {
  type?: VehicleDocumentType;
  customLabel?: string;
  expiresAt?: string | null;
  reminderEnabled?: boolean;
  fileData?: string;
  fileName?: string;
  notes?: string;
}

export async function listVehicleDocuments(vehicleId: string): Promise<VehicleDocument[]> {
  const { data } = await apiClient.get<{ documents: VehicleDocument[] }>(`/vehicles/${vehicleId}/documents`);
  return data.documents;
}

export async function getVehicleDocument(vehicleId: string, id: string): Promise<VehicleDocument> {
  const { data } = await apiClient.get<{ document: VehicleDocument }>(`/vehicles/${vehicleId}/documents/${id}`);
  return data.document;
}

export async function createVehicleDocument(vehicleId: string, input: VehicleDocumentInput): Promise<VehicleDocument> {
  const { data } = await apiClient.post<{ document: VehicleDocument }>(`/vehicles/${vehicleId}/documents`, input);
  return data.document;
}

export async function updateVehicleDocument(
  vehicleId: string,
  id: string,
  input: Partial<VehicleDocumentInput>
): Promise<VehicleDocument> {
  const { data } = await apiClient.put<{ document: VehicleDocument }>(`/vehicles/${vehicleId}/documents/${id}`, input);
  return data.document;
}

export async function deleteVehicleDocument(vehicleId: string, id: string): Promise<void> {
  await apiClient.delete(`/vehicles/${vehicleId}/documents/${id}`);
}
