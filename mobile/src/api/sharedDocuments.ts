import { apiClient } from "./client";

export interface SharedDocument {
  id: string;
  title: string;
  kind: "file" | "link";
  url: string;
  fileName: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export async function listSharedDocuments(): Promise<SharedDocument[]> {
  const { data } = await apiClient.get<{ documents: SharedDocument[] }>("/shared-documents", { _noCache: true } as object);
  return data.documents;
}

export async function addSharedDocument(input: { title: string; fileData?: string; fileName?: string; link?: string }): Promise<SharedDocument> {
  const { data } = await apiClient.post<{ document: SharedDocument }>("/shared-documents", input, { timeout: 90_000 });
  return data.document;
}

export async function deleteSharedDocument(id: string): Promise<void> {
  await apiClient.delete(`/shared-documents/${id}`);
}
