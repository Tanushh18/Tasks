import { apiClient } from "./client";

export type InventoryItemCategory = "appliance" | "electronics" | "furniture" | "vehicle" | "other";

export interface InventoryItem {
  id: string;
  name: string;
  category: InventoryItemCategory;
  purchaseDate: string | null;
  price: number | null;
  warrantyExpiresAt: string | null;
  serialNumber: string;
  notes: string;
  ownerId: string;
  sharedWith: string[];
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItemInput {
  name: string;
  category?: InventoryItemCategory;
  purchaseDate?: string | null;
  price?: number | null;
  warrantyExpiresAt?: string | null;
  serialNumber?: string;
  notes?: string;
  sharedWith?: string[];
}

export async function listInventoryItems(): Promise<InventoryItem[]> {
  const { data } = await apiClient.get<{ items: InventoryItem[] }>("/inventory-items");
  return data.items;
}

export async function listWarrantyExpiring(): Promise<InventoryItem[]> {
  const { data } = await apiClient.get<{ items: InventoryItem[] }>("/inventory-items/warranty-expiring");
  return data.items;
}

export async function getInventoryItem(id: string): Promise<InventoryItem> {
  const { data } = await apiClient.get<{ item: InventoryItem }>(`/inventory-items/${id}`);
  return data.item;
}

export async function createInventoryItem(input: InventoryItemInput): Promise<InventoryItem> {
  const { data } = await apiClient.post<{ item: InventoryItem }>("/inventory-items", input);
  return data.item;
}

export async function updateInventoryItem(id: string, input: Partial<InventoryItemInput>): Promise<InventoryItem> {
  const { data } = await apiClient.put<{ item: InventoryItem }>(`/inventory-items/${id}`, input);
  return data.item;
}

export async function deleteInventoryItem(id: string): Promise<void> {
  await apiClient.delete(`/inventory-items/${id}`);
}
