import { z } from "zod";

export const pingSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().optional(),
});

export const startSharingSchema = z.object({
  toUserId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid user id"),
});

export const toUserIdParamSchema = z.object({
  toUserId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid user id"),
});
