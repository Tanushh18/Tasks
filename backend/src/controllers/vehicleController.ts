import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as vehicleService from "../services/vehicleService";
import type { VehicleRecord } from "../models/Vehicle";

function serialize(vehicle: VehicleRecord, names?: Map<string, string>) {
  return {
    id: String(vehicle._id),
    name: vehicle.name,
    ownerId: String(vehicle.ownerId),
    ownerName: names?.get(String(vehicle.ownerId)) ?? null,
    sharedWith: (vehicle.sharedWith as unknown as unknown[]).map(String),
    createdAt: vehicle.createdAt,
    updatedAt: vehicle.updatedAt,
  };
}

export const listVehicles = asyncHandler(async (req: Request, res: Response) => {
  const vehicles = await vehicleService.listVehicles(req.userId!);
  const names = await vehicleService.ownerNames(vehicles.map((v) => v.ownerId));
  res.json({ vehicles: vehicles.map((v) => serialize(v, names)) });
});

export const getVehicle = asyncHandler(async (req: Request, res: Response) => {
  const vehicle = await vehicleService.getVehicle(req.userId!, req.params.id);
  const names = await vehicleService.ownerNames([vehicle.ownerId]);
  res.json({ vehicle: serialize(vehicle, names) });
});

export const createVehicle = asyncHandler(async (req: Request, res: Response) => {
  const vehicle = await vehicleService.createVehicle(req.userId!, req.body);
  const names = await vehicleService.ownerNames([vehicle.ownerId]);
  res.status(201).json({ vehicle: serialize(vehicle, names) });
});

export const updateVehicle = asyncHandler(async (req: Request, res: Response) => {
  const vehicle = await vehicleService.updateVehicle(req.userId!, req.params.id, req.body, !!req.isAdmin);
  const names = await vehicleService.ownerNames([vehicle.ownerId]);
  res.json({ vehicle: serialize(vehicle, names) });
});

export const deleteVehicle = asyncHandler(async (req: Request, res: Response) => {
  await vehicleService.deleteVehicle(req.userId!, req.params.id, !!req.isAdmin);
  res.status(204).send();
});
