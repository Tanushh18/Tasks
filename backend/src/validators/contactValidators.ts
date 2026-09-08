import { z } from "zod";

export const createContactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  number: z.string().trim().min(1, "Number is required").max(30),
  description: z.string().max(500).optional().default(""),
  sharedWith: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid user id")).optional().default([]),
});

export const updateContactSchema = createContactSchema.partial();

export const bulkCreateContactsSchema = z.object({
  contacts: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Name is required").max(120),
        number: z.string().trim().min(1, "Number is required").max(30),
        description: z.string().max(500).optional().default(""),
      })
    )
    .min(1, "At least one contact is required")
    .max(500, "Too many contacts in a single import"),
});

export const idParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid contact id"),
});
