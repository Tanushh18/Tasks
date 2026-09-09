import { z } from "zod";

const objectId = (message: string) => z.string().regex(/^[0-9a-fA-F]{24}$/, message);

export const userIdParamSchema = z.object({
  userId: objectId("Invalid user id"),
});

const emergencyContactSchema = z.object({
  name: z.string().trim().min(1, "Contact name is required").max(120),
  phone: z.string().trim().min(1, "Contact phone is required").max(30),
  relation: z.string().max(60).optional().default(""),
});

export const updateEmergencyInfoSchema = z.object({
  emergencyContacts: z.array(emergencyContactSchema).max(50).optional(),
  medicalNotes: z.string().max(2000).optional(),
  homeInfo: z.string().max(1000).optional(),
});
