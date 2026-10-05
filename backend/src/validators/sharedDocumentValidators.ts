import { z } from "zod";

export const idParamSchema = z.object({ id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid id") });

export const createSharedDocumentSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(120),
    fileData: z.string().min(1).optional(),
    link: z.string().trim().url("Enter a valid link").refine((u) => /^https?:\/\//i.test(u), "Link must start with http(s)").optional(),
    fileName: z.string().max(200).optional(),
  })
  .refine((v) => Boolean(v.fileData) !== Boolean(v.link), "Add either a file or a link");
