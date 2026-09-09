import { z } from "zod";

const objectId = (message: string) => z.string().regex(/^[0-9a-fA-F]{24}$/, message);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

export const idParamSchema = z.object({
  id: objectId("Invalid id"),
});

export const goalIdParamSchema = z.object({
  goalId: objectId("Invalid goal id"),
});

export const createGoalSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  targetAmount: z.number().positive("Target amount must be positive"),
  sharedWith: z.array(objectId("Invalid user id")).max(50).optional().default([]),
  deadline: dateStr.nullable().optional(),
});

export const updateGoalSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  targetAmount: z.number().positive().optional(),
  sharedWith: z.array(objectId("Invalid user id")).max(50).optional(),
  deadline: dateStr.nullable().optional(),
  archived: z.boolean().optional(),
});

export const createContributionSchema = z.object({
  amount: z.number().positive("Amount must be positive"),
  date: dateStr,
  note: z.string().max(300).optional().default(""),
});
