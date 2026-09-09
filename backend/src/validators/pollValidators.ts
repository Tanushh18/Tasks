import { z } from "zod";

const objectId = (message: string) => z.string().regex(/^[0-9a-fA-F]{24}$/, message);

export const idParamSchema = z.object({
  id: objectId("Invalid poll id"),
});

export const listPollsQuerySchema = z.object({
  status: z.enum(["active", "closed", "all"]).optional().default("active"),
});

export const createPollSchema = z.object({
  question: z.string().trim().min(1, "Question is required").max(300),
  options: z
    .array(z.string().trim().min(1, "Option cannot be empty").max(120))
    .min(2, "At least 2 options are required")
    .max(5, "At most 5 options are allowed"),
  closesAt: z.string().datetime().optional().nullable(),
});

export const voteSchema = z.object({
  optionIndex: z.number().int().min(0),
});
