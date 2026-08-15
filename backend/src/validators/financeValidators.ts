import { z } from "zod";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");
const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "time must be HH:mm");

export const createAccountSchema = z.object({
  name: z.string().trim().min(1, "Account name is required").max(80),
  description: z.string().max(300).optional().default(""),
  type: z
    .enum(["home", "office", "personal", "travel", "business", "education", "savings", "custom"])
    .optional()
    .default("custom"),
});

export const updateAccountSchema = createAccountSchema.partial().extend({
  archived: z.boolean().optional(),
});

export const createTransactionSchema = z.object({
  accountId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid account id"),
  type: z.enum(["IN", "OUT"]),
  amount: z.number().positive("Amount must be positive"),
  category: z.string().trim().max(60).optional().default("General"),
  description: z.string().max(300).optional().default(""),
  date: dateStr,
  time: timeStr,
  notes: z.string().max(2000).optional().default(""),
  idempotencyKey: z.string().min(1).max(100).optional(),
});

export const updateTransactionSchema = createTransactionSchema.partial();

export const listTransactionsQuerySchema = z.object({
  accountId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  type: z.enum(["IN", "OUT"]).optional(),
  from: dateStr.optional(),
  to: dateStr.optional(),
  category: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export const summaryQuerySchema = z.object({
  from: dateStr.optional(),
  to: dateStr.optional(),
  accountId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
});

export const idParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid id"),
});

export const monthlyTrendQuerySchema = z.object({
  accountId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  months: z.coerce.number().int().min(1).max(24).optional(),
});
