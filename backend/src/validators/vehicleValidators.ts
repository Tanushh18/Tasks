import { z } from "zod";

const objectId = (message: string) => z.string().regex(/^[0-9a-fA-F]{24}$/, message);

export const idParamSchema = z.object({
  id: objectId("Invalid id"),
});

export const createVehicleSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  sharedWith: z.array(objectId("Invalid user id")).max(50).optional().default([]),
});

export const updateVehicleSchema = createVehicleSchema.partial();
