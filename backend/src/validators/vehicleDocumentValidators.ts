import { z } from "zod";
import { VEHICLE_DOCUMENT_TYPES_LIST } from "../models/VehicleDocument";

const objectId = (message: string) => z.string().regex(/^[0-9a-fA-F]{24}$/, message);

export const vehicleIdParamSchema = z.object({
  vehicleId: objectId("Invalid vehicle id"),
});

export const idParamSchema = z.object({
  vehicleId: objectId("Invalid vehicle id"),
  id: objectId("Invalid id"),
});

export const createVehicleDocumentSchema = z.object({
  type: z.enum(VEHICLE_DOCUMENT_TYPES_LIST).optional().default("other"),
  customLabel: z.string().trim().max(60).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
  reminderEnabled: z.boolean().optional().default(true),
  fileData: z.string().optional(),
  fileName: z.string().optional(),
  notes: z.string().max(1000).optional().default(""),
});

export const updateVehicleDocumentSchema = createVehicleDocumentSchema.partial();
