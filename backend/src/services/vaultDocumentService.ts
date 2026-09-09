import { VaultDocument, type VaultDocumentDocument, type VaultDocumentCategory } from "../models/VaultDocument";
import { ApiError } from "../utils/ApiError";

function scopedQuery(userId: string) {
  return { $or: [{ ownerId: userId }, { sharedWith: userId }] };
}

export interface VaultDocumentInput {
  title: string;
  category?: VaultDocumentCategory;
  fileData: string;
  expiresAt?: string | null;
  notes?: string;
  sharedWith?: string[];
}

export async function listDocuments(userId: string): Promise<VaultDocumentDocument[]> {
  return VaultDocument.find(scopedQuery(userId)).sort("-createdAt");
}

export async function getDocument(userId: string, id: string): Promise<VaultDocumentDocument> {
  const doc = await VaultDocument.findOne({ _id: id, ...scopedQuery(userId) });
  if (!doc) throw ApiError.notFound("Document not found");
  return doc;
}

export async function createDocument(userId: string, input: VaultDocumentInput): Promise<VaultDocumentDocument> {
  return VaultDocument.create({
    title: input.title,
    category: input.category ?? "other",
    fileData: input.fileData,
    expiresAt: input.expiresAt ?? null,
    notes: input.notes ?? "",
    ownerId: userId,
    sharedWith: input.sharedWith ?? [],
  });
}

async function getOwnedDocument(userId: string, id: string): Promise<VaultDocumentDocument> {
  const doc = await VaultDocument.findById(id);
  if (!doc) throw ApiError.notFound("Document not found");
  if (String(doc.ownerId) !== String(userId)) {
    throw ApiError.forbidden("Only the document's owner can make this change");
  }
  return doc;
}

export async function updateDocument(
  userId: string,
  id: string,
  input: Partial<VaultDocumentInput>
): Promise<VaultDocumentDocument> {
  const doc = await getOwnedDocument(userId, id);
  if (input.title !== undefined) doc.title = input.title;
  if (input.category !== undefined) doc.category = input.category;
  if (input.fileData !== undefined) doc.fileData = input.fileData;
  if (input.expiresAt !== undefined) doc.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (input.notes !== undefined) doc.notes = input.notes;
  if (input.sharedWith !== undefined) doc.sharedWith = input.sharedWith as unknown as VaultDocumentDocument["sharedWith"];
  await doc.save();
  return doc;
}

export async function deleteDocument(userId: string, id: string): Promise<void> {
  const doc = await getOwnedDocument(userId, id);
  await VaultDocument.deleteOne({ _id: doc._id });
}
