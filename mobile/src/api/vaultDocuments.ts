import { apiClient } from "./client";

export type VaultDocumentCategory = "insurance" | "warranty" | "vehicle" | "property" | "other";

export interface VaultDocument {
  id: string;
  title: string;
  category: VaultDocumentCategory;
  fileData: string;
  expiresAt: string | null;
  notes: string;
  ownerId: string;
  sharedWith: string[];
  createdAt: string;
  updatedAt: string;
}

export interface VaultDocumentInput {
  title: string;
  category?: VaultDocumentCategory;
  fileData: string;
  expiresAt?: string | null;
  notes?: string;
  sharedWith?: string[];
}

export async function listVaultDocuments(): Promise<VaultDocument[]> {
  const { data } = await apiClient.get<{ documents: VaultDocument[] }>("/vault-documents");
  return data.documents;
}

export async function getVaultDocument(id: string): Promise<VaultDocument> {
  const { data } = await apiClient.get<{ document: VaultDocument }>(`/vault-documents/${id}`);
  return data.document;
}

export async function createVaultDocument(input: VaultDocumentInput): Promise<VaultDocument> {
  const { data } = await apiClient.post<{ document: VaultDocument }>("/vault-documents", input);
  return data.document;
}

export async function updateVaultDocument(id: string, input: Partial<VaultDocumentInput>): Promise<VaultDocument> {
  const { data } = await apiClient.put<{ document: VaultDocument }>(`/vault-documents/${id}`, input);
  return data.document;
}

export async function deleteVaultDocument(id: string): Promise<void> {
  await apiClient.delete(`/vault-documents/${id}`);
}
