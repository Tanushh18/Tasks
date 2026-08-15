import { z } from "zod";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");
const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "time must be HH:mm");

const recurrenceInput = z
  .object({
    type: z.enum(["none", "daily", "weekly", "monthly", "custom"]).default("none"),
    interval: z.number().int().min(1).max(365).default(1),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
    endDate: dateStr.nullable().optional(),
  })
  .partial({ interval: true })
  .optional();

const reminderInput = z
  .object({
    enabled: z.boolean().default(false),
    alarmEnabled: z.boolean().default(false),
  })
  .optional();

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().max(2000).optional().default(""),
  date: dateStr,
  time: timeStr,
  timezone: z.string().optional().default("Asia/Kolkata"),
  priority: z.enum(["low", "medium", "high"]).optional().default("medium"),
  category: z.string().trim().max(60).optional().default("General"),
  reminder: reminderInput,
  recurrence: recurrenceInput,
  notes: z.string().max(2000).optional().default(""),
  idempotencyKey: z.string().min(1).max(100).optional(),
});

export const updateTaskSchema = createTaskSchema.partial();

export const listTasksQuerySchema = z.object({
  status: z.enum(["all", "pending", "completed", "overdue"]).optional().default("all"),
  date: dateStr.optional(),
  from: dateStr.optional(),
  to: dateStr.optional(),
  category: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  search: z.string().optional(),
  sort: z.enum(["date_asc", "date_desc", "priority", "created_desc"]).optional().default("date_asc"),
});

export const taskIdParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid task id"),
});
