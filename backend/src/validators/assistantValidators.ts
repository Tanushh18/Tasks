import { z } from "zod";

export const assistantMessageSchema = z.object({
  message: z.string().trim().min(1, "Message is required").max(2000),
  previousInteractionId: z.string().optional(),
});

export const assistantConfirmSchema = z.object({
  interactionId: z.string().min(1),
  callId: z.string().min(1),
  name: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()),
  confirmed: z.boolean(),
});
