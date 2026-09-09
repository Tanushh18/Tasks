import { z } from "zod";

const objectId = (message: string) => z.string().regex(/^[0-9a-fA-F]{24}$/, message);

export const listIdParamSchema = z.object({
  listId: objectId("Invalid list id"),
});

export const itemIdParamSchema = z.object({
  itemId: objectId("Invalid item id"),
});

export const createListSchema = z.object({
  name: z.string().trim().min(1, "List name is required").max(80),
  sharedWithIds: z.array(objectId("Invalid user id")).max(50, "Too many people").optional().default([]),
});

export const updateListSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  sharedWithIds: z.array(objectId("Invalid user id")).max(50, "Too many people").optional(),
});

export const addItemSchema = z.object({
  text: z.string().trim().min(1, "Item text is required").max(200),
});

export const setItemCheckedSchema = z.object({
  checked: z.boolean(),
});
