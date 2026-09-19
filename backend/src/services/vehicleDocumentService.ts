import {
  VehicleDocument,
  type VehicleDocumentDocument,
  type VehicleDocumentType,
} from "../models/VehicleDocument";
import { Vehicle } from "../models/Vehicle";
import { ApiError } from "../utils/ApiError";
import { scopedQuery } from "./vehicleService";

export interface VehicleDocumentInput {
  type?: VehicleDocumentType;
  customLabel?: string;
  expiresAt?: string | null;
  reminderEnabled?: boolean;
  fileData?: string;
  fileName?: string;
  notes?: string;
}

async function getVisibleVehicle(userId: string, vehicleId: string) {
  const vehicle = await Vehicle.findOne({ _id: vehicleId, ...scopedQuery(userId) });
  if (!vehicle) throw ApiError.notFound("Vehicle not found");
  return vehicle;
}

async function getOwnedVehicle(userId: string, vehicleId: string) {
  const vehicle = await Vehicle.findById(vehicleId);
  if (!vehicle) throw ApiError.notFound("Vehicle not found");
  if (String(vehicle.ownerId) !== String(userId)) {
    throw ApiError.forbidden("Only the vehicle's owner can make this change");
  }
  return vehicle;
}

export async function listDocuments(userId: string, vehicleId: string): Promise<VehicleDocumentDocument[]> {
  await getVisibleVehicle(userId, vehicleId);
  return VehicleDocument.find({ vehicleId }).sort("-createdAt");
}

export async function getDocument(userId: string, vehicleId: string, id: string): Promise<VehicleDocumentDocument> {
  await getVisibleVehicle(userId, vehicleId);
  const doc = await VehicleDocument.findOne({ _id: id, vehicleId });
  if (!doc) throw ApiError.notFound("Document not found");
  return doc;
}

export async function createDocument(
  userId: string,
  vehicleId: string,
  input: VehicleDocumentInput
): Promise<VehicleDocumentDocument> {
  const vehicle = await getOwnedVehicle(userId, vehicleId);
  return VehicleDocument.create({
    vehicleId: vehicle._id,
    type: input.type ?? "other",
    customLabel: input.customLabel,
    expiresAt: input.expiresAt ?? null,
    reminderEnabled: input.reminderEnabled ?? true,
    fileData: input.fileData,
    fileName: input.fileName,
    notes: input.notes ?? "",
    ownerId: userId,
  });
}

export async function updateDocument(
  userId: string,
  vehicleId: string,
  id: string,
  input: Partial<VehicleDocumentInput>
): Promise<VehicleDocumentDocument> {
  await getOwnedVehicle(userId, vehicleId);
  const doc = await VehicleDocument.findOne({ _id: id, vehicleId });
  if (!doc) throw ApiError.notFound("Document not found");
  if (input.type !== undefined) doc.type = input.type;
  if (input.customLabel !== undefined) doc.customLabel = input.customLabel;
  if (input.expiresAt !== undefined) doc.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (input.reminderEnabled !== undefined) doc.reminderEnabled = input.reminderEnabled;
  if (input.fileData !== undefined) doc.fileData = input.fileData;
  if (input.fileName !== undefined) doc.fileName = input.fileName;
  if (input.notes !== undefined) doc.notes = input.notes;
  await doc.save();
  return doc;
}

export async function deleteDocument(userId: string, vehicleId: string, id: string): Promise<void> {
  await getOwnedVehicle(userId, vehicleId);
  const doc = await VehicleDocument.findOne({ _id: id, vehicleId });
  if (!doc) throw ApiError.notFound("Document not found");
  await VehicleDocument.deleteOne({ _id: doc._id });
}
