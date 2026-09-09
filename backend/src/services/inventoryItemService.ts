import { InventoryItem, type InventoryItemDocument, type InventoryItemCategory } from "../models/InventoryItem";
import { ApiError } from "../utils/ApiError";

function scopedQuery(userId: string) {
  return { $or: [{ ownerId: userId }, { sharedWith: userId }] };
}

export interface InventoryItemInput {
  name: string;
  category?: InventoryItemCategory;
  purchaseDate?: string | null;
  price?: number | null;
  warrantyExpiresAt?: string | null;
  serialNumber?: string;
  notes?: string;
  sharedWith?: string[];
}

export async function listItems(userId: string): Promise<InventoryItemDocument[]> {
  return InventoryItem.find(scopedQuery(userId)).sort("-createdAt");
}

export async function getItem(userId: string, id: string): Promise<InventoryItemDocument> {
  const item = await InventoryItem.findOne({ _id: id, ...scopedQuery(userId) });
  if (!item) throw ApiError.notFound("Item not found");
  return item;
}

export async function createItem(userId: string, input: InventoryItemInput): Promise<InventoryItemDocument> {
  return InventoryItem.create({
    name: input.name,
    category: input.category ?? "other",
    purchaseDate: input.purchaseDate ?? null,
    price: input.price ?? null,
    warrantyExpiresAt: input.warrantyExpiresAt ? new Date(input.warrantyExpiresAt) : null,
    serialNumber: input.serialNumber ?? "",
    notes: input.notes ?? "",
    ownerId: userId,
    sharedWith: input.sharedWith ?? [],
  });
}

async function getOwnedItem(userId: string, id: string): Promise<InventoryItemDocument> {
  const item = await InventoryItem.findById(id);
  if (!item) throw ApiError.notFound("Item not found");
  if (String(item.ownerId) !== String(userId)) {
    throw ApiError.forbidden("Only the item's owner can make this change");
  }
  return item;
}

export async function updateItem(
  userId: string,
  id: string,
  input: Partial<InventoryItemInput>
): Promise<InventoryItemDocument> {
  const item = await getOwnedItem(userId, id);
  if (input.name !== undefined) item.name = input.name;
  if (input.category !== undefined) item.category = input.category;
  if (input.purchaseDate !== undefined) item.purchaseDate = input.purchaseDate;
  if (input.price !== undefined) item.price = input.price;
  if (input.warrantyExpiresAt !== undefined) {
    item.warrantyExpiresAt = input.warrantyExpiresAt ? new Date(input.warrantyExpiresAt) : null;
  }
  if (input.serialNumber !== undefined) item.serialNumber = input.serialNumber;
  if (input.notes !== undefined) item.notes = input.notes;
  if (input.sharedWith !== undefined) item.sharedWith = input.sharedWith as unknown as InventoryItemDocument["sharedWith"];
  await item.save();
  return item;
}

export async function deleteItem(userId: string, id: string): Promise<void> {
  const item = await getOwnedItem(userId, id);
  await InventoryItem.deleteOne({ _id: item._id });
}

export async function listWarrantyExpiring(userId: string): Promise<InventoryItemDocument[]> {
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return InventoryItem.find({
    ...scopedQuery(userId),
    warrantyExpiresAt: { $ne: null, $gte: now, $lte: in30Days },
  }).sort("warrantyExpiresAt");
}
