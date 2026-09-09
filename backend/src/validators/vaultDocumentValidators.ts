import { z } from "zod";
import { VAULT_DOCUMENT_CATEGORIES } from "../models/VaultDocument";

const objectId = (message: string) => z.string().regex(/^[0-9a-fA-F]{24}$/, message);

export const idParamSchema = z.object({
  id: objectId("Invalid id"),
});

export const createVaultDocumentSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  category: z.enum(VAULT_DOCUMENT_CATEGORIES).optional().default("other"),
  fileData: z.string().min(1, "File data is required"),
  expiresAt: z.string().datetime().optional().nullable(),
  notes: z.string().max(1000).optional().default(""),
  sharedWith: z.array(objectId("Invalid user id")).max(50).optional().default([]),
});

export const updateVaultDocumentSchema = createVaultDocumentSchema.partial();
