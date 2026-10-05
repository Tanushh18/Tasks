import {
  VehicleDocument,
  type VehicleDocumentDocument,
  type VehicleDocumentType,
} from "../models/VehicleDocument";
import { Vehicle } from "../models/Vehicle";
import { ApiError } from "../utils/ApiError";
import { isDataUrl, removeFile, storeFile } from "./cloudinaryService";
import { VEHICLE_POOL_QUERY } from "./vehicleService";

export interface VehicleDocumentInput {
  type?: VehicleDocumentType;
  customLabel?: string;
  expiresAt?: string | null;
  reminderEnabled?: boolean;
  /** A new data URL replaces the file; null/"" removes it. */
  fileData?: string | null;
  fileName?: string | null;
  notes?: string;
}

// Vehicles and their documents are a shared pool: any signed-in user can view, add, edit and delete
// documents on any vehicle. Only renaming/deleting the vehicle itself is restricted (vehicleService).
async function getVisibleVehicle(_userId: string, vehicleId: string) {
  const vehicle = await Vehicle.findOne({ _id: vehicleId, ...VEHICLE_POOL_QUERY });
  if (!vehicle) throw ApiError.notFound("Vehicle not found");
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
  const vehicle = await getVisibleVehicle(userId, vehicleId);
  const stored = input.fileData && isDataUrl(input.fileData) ? await storeFile(input.fileData, "vehicles") : null;
  return VehicleDocument.create({
    vehicleId: vehicle._id,
    type: input.type ?? "other",
    customLabel: input.customLabel,
    expiresAt: input.expiresAt ?? null,
    reminderEnabled: input.reminderEnabled ?? true,
    fileData: stored?.url ?? input.fileData ?? undefined,
    filePublicId: stored?.publicId ?? null,
    fileResourceType: stored?.resourceType ?? null,
    fileName: input.fileName ?? undefined,
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
  await getVisibleVehicle(userId, vehicleId);
  const doc = await VehicleDocument.findOne({ _id: id, vehicleId });
  if (!doc) throw ApiError.notFound("Document not found");
  if (input.type !== undefined) doc.type = input.type;
  if (input.customLabel !== undefined) doc.customLabel = input.customLabel;
  if (input.expiresAt !== undefined) doc.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (input.reminderEnabled !== undefined) doc.reminderEnabled = input.reminderEnabled;
  if (input.fileData !== undefined && isDataUrl(input.fileData)) {
    const stored = await storeFile(input.fileData, "vehicles");
    await removeFile(doc.filePublicId, doc.fileResourceType);
    doc.fileData = stored.url;
    doc.filePublicId = stored.publicId;
    doc.fileResourceType = stored.resourceType;
  }
  if (input.fileData === null || input.fileData === "") {
    await removeFile(doc.filePublicId, doc.fileResourceType);
    doc.fileData = undefined;
    doc.filePublicId = null;
    doc.fileResourceType = null;
    doc.fileName = undefined;
  } else if (input.fileName !== undefined) {
    doc.fileName = input.fileName ?? undefined;
  }
  if (input.notes !== undefined) doc.notes = input.notes;
  await doc.save();
  return doc;
}

export async function deleteDocument(userId: string, vehicleId: string, id: string): Promise<void> {
  await getVisibleVehicle(userId, vehicleId);
  const doc = await VehicleDocument.findOne({ _id: id, vehicleId });
  if (!doc) throw ApiError.notFound("Document not found");
  await VehicleDocument.deleteOne({ _id: doc._id });
  await removeFile(doc.filePublicId, doc.fileResourceType);
}
