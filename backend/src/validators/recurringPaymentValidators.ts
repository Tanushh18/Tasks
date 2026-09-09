import { z } from "zod";

const objectId = (message: string) => z.string().regex(/^[0-9a-fA-F]{24}$/, message);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

export const idParamSchema = z.object({
  id: objectId("Invalid id"),
});

export const createRecurringPaymentSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  amount: z.number().positive("Amount must be positive"),
  category: z.string().trim().max(60).optional().default("General"),
  frequency: z.enum(["weekly", "monthly", "yearly"]),
  nextDueDate: dateStr,
  accountId: objectId("Invalid account id").nullable().optional(),
  sharedWith: z.array(objectId("Invalid user id")).max(50).optional().default([]),
  active: z.boolean().optional().default(true),
});

export const updateRecurringPaymentSchema = createRecurringPaymentSchema.partial();

export const markPaidSchema = z.object({
  date: dateStr,
  amount: z.number().positive("Amount must be positive").optional(),
});
