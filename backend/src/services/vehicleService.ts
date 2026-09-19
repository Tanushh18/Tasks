import { Vehicle, type VehicleRecord } from "../models/Vehicle";
import { VehicleDocument } from "../models/VehicleDocument";
import { ApiError } from "../utils/ApiError";

export function scopedQuery(userId: string) {
  return { $or: [{ ownerId: userId }, { sharedWith: userId }] };
}

export interface VehicleInput {
  name: string;
  sharedWith?: string[];
}

export async function listVehicles(userId: string): Promise<VehicleRecord[]> {
  return Vehicle.find(scopedQuery(userId)).sort("-createdAt");
}

export async function getVehicle(userId: string, id: string): Promise<VehicleRecord> {
  const vehicle = await Vehicle.findOne({ _id: id, ...scopedQuery(userId) });
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

export async function getOwnedVehicle(userId: string, id: string): Promise<VehicleRecord> {
  const vehicle = await Vehicle.findById(id);
  if (!vehicle) throw ApiError.notFound("Vehicle not found");
  if (String(vehicle.ownerId) !== String(userId)) {
    throw ApiError.forbidden("Only the vehicle's owner can make this change");
  }
  return vehicle;
}

export async function updateVehicle(
  userId: string,
  id: string,
  input: Partial<VehicleInput>
): Promise<VehicleRecord> {
  const vehicle = await getOwnedVehicle(userId, id);
  if (input.name !== undefined) vehicle.name = input.name;
  if (input.sharedWith !== undefined) vehicle.sharedWith = input.sharedWith as unknown as VehicleRecord["sharedWith"];
  await vehicle.save();
  return vehicle;
}

export async function deleteVehicle(userId: string, id: string): Promise<void> {
  const vehicle = await getOwnedVehicle(userId, id);
  await VehicleDocument.deleteMany({ vehicleId: vehicle._id });
  await Vehicle.deleteOne({ _id: vehicle._id });
}
