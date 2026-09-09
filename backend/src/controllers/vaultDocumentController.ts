import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as vaultDocumentService from "../services/vaultDocumentService";
import type { VaultDocumentDocument } from "../models/VaultDocument";

function serialize(doc: VaultDocumentDocument) {
  return {
    id: String(doc._id),
    title: doc.title,
    category: doc.category,
    fileData: doc.fileData,
    expiresAt: doc.expiresAt,
    notes: doc.notes,
    ownerId: String(doc.ownerId),
    sharedWith: (doc.sharedWith as unknown as unknown[]).map(String),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export const listDocuments = asyncHandler(async (req: Request, res: Response) => {
  const docs = await vaultDocumentService.listDocuments(req.userId!);
  res.json({ documents: docs.map(serialize) });
});

export const getDocument = asyncHandler(async (req: Request, res: Response) => {
  const doc = await vaultDocumentService.getDocument(req.userId!, req.params.id);
  res.json({ document: serialize(doc) });
});

export const createDocument = asyncHandler(async (req: Request, res: Response) => {
  const doc = await vaultDocumentService.createDocument(req.userId!, req.body);
  res.status(201).json({ document: serialize(doc) });
});

export const updateDocument = asyncHandler(async (req: Request, res: Response) => {
  const doc = await vaultDocumentService.updateDocument(req.userId!, req.params.id, req.body);
  res.json({ document: serialize(doc) });
});

export const deleteDocument = asyncHandler(async (req: Request, res: Response) => {
  await vaultDocumentService.deleteDocument(req.userId!, req.params.id);
  res.status(204).send();
});
