import { z } from "zod";

export const idParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid user id"),
});

export const updateFeatureFlagsSchema = z.object({
  contacts: z.boolean().optional(),
  chat: z.boolean().optional(),
  ocr: z.boolean().optional(),
  location: z.boolean().optional(),
  assistant: z.boolean().optional(),
  notes: z.boolean().optional(),
  groupExpenses: z.boolean().optional(),
  recurringPayments: z.boolean().optional(),
  familyGoals: z.boolean().optional(),
});
