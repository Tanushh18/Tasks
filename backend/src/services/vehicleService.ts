import { User } from "../models/User";
import { Vehicle, type VehicleRecord } from "../models/Vehicle";
import { VehicleDocument } from "../models/VehicleDocument";
import { ApiError } from "../utils/ApiError";
import { removeFile } from "./cloudinaryService";

/**
 * Vehicles are a SHARED pool (like Leads): every signed-in user sees every vehicle and its documents.
 * Edit rights:
 *  - any signed-in user may add vehicles and add / edit / delete documents on any vehicle;
 *  - only the vehicle's owner or an admin may rename or delete the vehicle itself.
 * `sharedWith` is kept on the model/API for compatibility but no longer gates visibility.
 */
export const VEHICLE_POOL_QUERY = {};

export interface VehicleInput {
  name: string;
  sharedWith?: string[];
}

export async function listVehicles(_userId: string): Promise<VehicleRecord[]> {
  return Vehicle.find(VEHICLE_POOL_QUERY).sort("-createdAt");
}

/** Maps owner ids to display names with a single query (for "Added by <name>"). */
export async function ownerNames(ownerIds: unknown[]): Promise<Map<string, string>> {
  const ids = [...new Set(ownerIds.map(String))];
  const users = await User.find({ _id: { $in: ids } }).select("name");
  return new Map(users.map((u) => [String(u._id), u.name]));
}

export async function getVehicle(_userId: string, id: string): Promise<VehicleRecord> {
  const vehicle = await Vehicle.findById(id);
  if (!vehicle) throw ApiError.notFound("Vehicle not found");
  return vehicle;
}

export async function createVehicle(userId: string, input: VehicleInput): Promise<VehicleRecord> {
  return Vehicle.create({
    name: input.name,
    ownerId: userId,
    sharedWith: input.sharedWith ?? [],
  });
}

export async function getOwnedVehicle(userId: string, id: string, isAdmin = false): Promise<VehicleRecord> {
  const vehicle = await Vehicle.findById(id);
  if (!vehicle) throw ApiError.notFound("Vehicle not found");
  if (!isAdmin && String(vehicle.ownerId) !== String(userId)) {
    throw ApiError.forbidden("Only the vehicle's owner or an admin can make this change");
  }
  return vehicle;
}

export async function updateVehicle(
  userId: string,
  id: string,
  input: Partial<VehicleInput>,
  isAdmin = false
): Promise<VehicleRecord> {
  const vehicle = await getOwnedVehicle(userId, id, isAdmin);
  if (input.name !== undefined) vehicle.name = input.name;
  if (input.sharedWith !== undefined) vehicle.sharedWith = input.sharedWith as unknown as VehicleRecord["sharedWith"];
  await vehicle.save();
  return vehicle;
}

export async function deleteVehicle(userId: string, id: string, isAdmin = false): Promise<void> {
  const vehicle = await getOwnedVehicle(userId, id, isAdmin);
  const documents = await VehicleDocument.find({ vehicleId: vehicle._id });
  await VehicleDocument.deleteMany({ vehicleId: vehicle._id });
  await Promise.all(documents.map((doc) => removeFile(doc.filePublicId, doc.fileResourceType)));
  await Vehicle.deleteOne({ _id: vehicle._id });
}
