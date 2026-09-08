import { z } from "zod";

const objectId = (message: string) => z.string().regex(/^[0-9a-fA-F]{24}$/, message);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

export const idParamSchema = z.object({
  id: objectId("Invalid id"),
});

export const groupIdParamSchema = z.object({
  groupId: objectId("Invalid group id"),
});

export const createGroupSchema = z.object({
  name: z.string().trim().min(1, "Group name is required").max(80),
  memberIds: z.array(objectId("Invalid user id")).max(50, "Too many members").optional().default([]),
});

export const updateGroupSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  memberIds: z.array(objectId("Invalid user id")).max(50, "Too many members").optional(),
  archived: z.boolean().optional(),
});

const splitInputSchema = z.object({
  userId: objectId("Invalid user id"),
  amount: z.number().positive("Split amount must be positive"),
});

export const createExpenseSchema = z.object({
  paidBy: objectId("Invalid user id"),
  amount: z.number().positive("Amount must be positive"),
  description: z.string().max(300).optional().default(""),
  category: z.string().trim().max(60).optional().default("General"),
  date: dateStr,
  // "equal" divides `amount` across every current group member server-side;
  // "custom" requires the caller to supply splits that sum to `amount`.
  splitType: z.enum(["equal", "custom"]).optional().default("equal"),
  splits: z.array(splitInputSchema).optional(),
});

export const updateExpenseSchema = createExpenseSchema.partial();

export const createSettlementSchema = z.object({
  fromUser: objectId("Invalid user id"),
  toUser: objectId("Invalid user id"),
  amount: z.number().positive("Amount must be positive"),
  date: dateStr,
  note: z.string().max(300).optional().default(""),
});
