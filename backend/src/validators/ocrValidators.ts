import { z } from "zod";

export const scanImageSchema = z.object({
  image: z.string().min(1).max(7_000_000),
  target: z.enum(["contact", "receipt"]),
});
