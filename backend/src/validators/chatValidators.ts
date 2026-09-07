import { z } from "zod";

export const withUserIdParamSchema = z.object({
  withUserId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid user id"),
});

export const listMessagesQuerySchema = z.object({
  after: z.string().datetime().optional(),
});

export const sendMessageSchema = z.object({
  text: z.string().trim().min(1, "Message can't be empty").max(2000),
});
