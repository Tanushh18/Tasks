import { z } from "zod";

const objectId = (message: string) => z.string().regex(/^[0-9a-fA-F]{24}$/, message);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");
const timeStr = z.string().regex(/^\d{2}:\d{2}$/, "time must be HH:mm");

export const idParamSchema = z.object({
  id: objectId("Invalid event id"),
});

const eventType = z.enum(["birthday", "anniversary", "appointment", "trip", "dinner", "custom"]);

export const createEventSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  type: eventType.optional().default("custom"),
  date: dateStr,
  time: timeStr.optional().nullable(),
  attendeeIds: z.array(objectId("Invalid user id")).max(50, "Too many attendees").optional().default([]),
  reminderEnabled: z.boolean().optional().default(true),
  notes: z.string().max(1000).optional().default(""),
});

export const updateEventSchema = createEventSchema.partial();

export const listEventsQuerySchema = z.object({
  when: z.enum(["upcoming", "past"]).optional(),
  from: dateStr.optional(),
  to: dateStr.optional(),
});
