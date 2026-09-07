import { z } from "zod";

export const NOTE_COLORS = ["default", "peach", "sage", "sky", "lavender", "sand"] as const;

const noteItemSchema = z.object({
  text: z.string().trim().min(1, "Item text is required").max(500),
  done: z.boolean().optional().default(false),
});

export const createNoteSchema = z.object({
  title: z.string().trim().max(200).optional().default(""),
  type: z.enum(["text", "checklist"]).optional().default("text"),
  body: z.string().max(5000).optional().default(""),
  items: z.array(noteItemSchema).optional().default([]),
  color: z.enum(NOTE_COLORS).optional().default("default"),
  pinned: z.boolean().optional().default(false),
  sharedWith: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid user id")).optional().default([]),
});

export const updateNoteSchema = createNoteSchema.partial();

export const idParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid note id"),
});
