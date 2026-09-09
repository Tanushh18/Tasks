import { z } from "zod";
import { INVENTORY_ITEM_CATEGORIES } from "../models/InventoryItem";

const objectId = (message: string) => z.string().regex(/^[0-9a-fA-F]{24}$/, message);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

export const idParamSchema = z.object({
  id: objectId("Invalid id"),
});

export const createInventoryItemSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  category: z.enum(INVENTORY_ITEM_CATEGORIES).optional().default("other"),
  purchaseDate: dateStr.optional().nullable(),
  price: z.number().nonnegative().optional().nullable(),
  warrantyExpiresAt: z.string().datetime().optional().nullable(),
  serialNumber: z.string().max(120).optional().default(""),
  notes: z.string().max(1000).optional().default(""),
  sharedWith: z.array(objectId("Invalid user id")).max(50).optional().default([]),
});

export const updateInventoryItemSchema = createInventoryItemSchema.partial();
