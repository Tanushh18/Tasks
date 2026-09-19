import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as vehicleService from "../services/vehicleService";
import type { VehicleRecord } from "../models/Vehicle";

function serialize(vehicle: VehicleRecord) {
  return {
    id: String(vehicle._id),
    name: vehicle.name,
    ownerId: String(vehicle.ownerId),
    sharedWith: (vehicle.sharedWith as unknown as unknown[]).map(String),
    createdAt: vehicle.createdAt,
    updatedAt: vehicle.updatedAt,
  };
}

export const listVehicles = asyncHandler(async (req: Request, res: Response) => {
  const vehicles = await vehicleService.listVehicles(req.userId!);
  res.json({ vehicles: vehicles.map(serialize) });
});

export const getVehicle = asyncHandler(async (req: Request, res: Response) => {
  const vehicle = await vehicleService.getVehicle(req.userId!, req.params.id);
  res.json({ vehicle: serialize(vehicle) });
});

export const createVehicle = asyncHandler(async (req: Request, res: Response) => {
  const vehicle = await vehicleService.createVehicle(req.userId!, req.body);
  res.status(201).json({ vehicle: serialize(vehicle) });
});

export const updateVehicle = asyncHandler(async (req: Request, res: Response) => {
  const vehicle = await vehicleService.updateVehicle(req.userId!, req.params.id, req.body);
  res.json({ vehicle: serialize(vehicle) });
});

export const deleteVehicle = asyncHandler(async (req: Request, res: Response) => {
  await vehicleService.deleteVehicle(req.userId!, req.params.id);
  res.status(204).send();
});
