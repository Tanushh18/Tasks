import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as vehicleDocumentService from "../services/vehicleDocumentService";
import type { VehicleDocumentDocument } from "../models/VehicleDocument";

function serialize(doc: VehicleDocumentDocument) {
  return {
    id: String(doc._id),
    vehicleId: String(doc.vehicleId),
    type: doc.type,
    customLabel: doc.customLabel ?? null,
    expiresAt: doc.expiresAt,
    reminderEnabled: doc.reminderEnabled,
    fileData: doc.fileData ?? null,
    fileName: doc.fileName ?? null,
    notes: doc.notes,
    ownerId: String(doc.ownerId),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export const listDocuments = asyncHandler(async (req: Request, res: Response) => {
  const docs = await vehicleDocumentService.listDocuments(req.userId!, req.params.vehicleId);
  res.json({ documents: docs.map(serialize) });
});

export const getDocument = asyncHandler(async (req: Request, res: Response) => {
  const doc = await vehicleDocumentService.getDocument(req.userId!, req.params.vehicleId, req.params.id);
  res.json({ document: serialize(doc) });
});

export const createDocument = asyncHandler(async (req: Request, res: Response) => {
  const doc = await vehicleDocumentService.createDocument(req.userId!, req.params.vehicleId, req.body);
  res.status(201).json({ document: serialize(doc) });
});

export const updateDocument = asyncHandler(async (req: Request, res: Response) => {
  const doc = await vehicleDocumentService.updateDocument(req.userId!, req.params.vehicleId, req.params.id, req.body);
  res.json({ document: serialize(doc) });
});

export const deleteDocument = asyncHandler(async (req: Request, res: Response) => {
  await vehicleDocumentService.deleteDocument(req.userId!, req.params.vehicleId, req.params.id);
  res.status(204).send();
});
