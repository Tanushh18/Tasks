import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as inventoryItemService from "../services/inventoryItemService";
import type { InventoryItemDocument } from "../models/InventoryItem";

function serialize(item: InventoryItemDocument) {
  return {
    id: String(item._id),
    name: item.name,
    category: item.category,
    purchaseDate: item.purchaseDate,
    price: item.price,
    warrantyExpiresAt: item.warrantyExpiresAt,
    serialNumber: item.serialNumber,
    notes: item.notes,
    ownerId: String(item.ownerId),
    sharedWith: (item.sharedWith as unknown as unknown[]).map(String),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export const listItems = asyncHandler(async (req: Request, res: Response) => {
  const items = await inventoryItemService.listItems(req.userId!);
  res.json({ items: items.map(serialize) });
});

export const listWarrantyExpiring = asyncHandler(async (req: Request, res: Response) => {
  const items = await inventoryItemService.listWarrantyExpiring(req.userId!);
  res.json({ items: items.map(serialize) });
});

export const getItem = asyncHandler(async (req: Request, res: Response) => {
  const item = await inventoryItemService.getItem(req.userId!, req.params.id);
  res.json({ item: serialize(item) });
});

export const createItem = asyncHandler(async (req: Request, res: Response) => {
  const item = await inventoryItemService.createItem(req.userId!, req.body);
  res.status(201).json({ item: serialize(item) });
});

export const updateItem = asyncHandler(async (req: Request, res: Response) => {
  const item = await inventoryItemService.updateItem(req.userId!, req.params.id, req.body);
  res.json({ item: serialize(item) });
});

export const deleteItem = asyncHandler(async (req: Request, res: Response) => {
  await inventoryItemService.deleteItem(req.userId!, req.params.id);
  res.status(204).send();
});
