import { ShoppingList, type ShoppingListDocument } from "../models/ShoppingList";
import { ApiError } from "../utils/ApiError";

function scopedQuery(userId: string) {
  return { $or: [{ createdBy: userId }, { sharedWith: userId }] };
}

async function getScopedList(userId: string, listId: string): Promise<ShoppingListDocument> {
  const list = await ShoppingList.findOne({ _id: listId, ...scopedQuery(userId) });
  if (!list) throw ApiError.notFound("Shopping list not found");
  return list;
}

async function getOwnedList(userId: string, listId: string): Promise<ShoppingListDocument> {
  const list = await ShoppingList.findById(listId);
  if (!list) throw ApiError.notFound("Shopping list not found");
  if (String(list.createdBy) !== String(userId)) {
    throw ApiError.forbidden("Only the list's creator can make this change");
  }
  return list;
}

const POPULATE = [
  { path: "createdBy", select: "name" },
  { path: "sharedWith", select: "name" },
  { path: "items.addedBy", select: "name" },
];

export interface ListInput {
  name: string;
  sharedWithIds?: string[];
}

export async function listLists(userId: string): Promise<ShoppingListDocument[]> {
  return ShoppingList.find(scopedQuery(userId)).populate(POPULATE).sort("-createdAt");
}

export async function getList(userId: string, listId: string): Promise<ShoppingListDocument> {
  const list = await getScopedList(userId, listId);
  return list.populate(POPULATE);
}

export async function createList(userId: string, input: ListInput): Promise<ShoppingListDocument> {
  const sharedWith = Array.from(new Set(input.sharedWithIds ?? []));
  const list = await ShoppingList.create({ name: input.name, createdBy: userId, sharedWith, items: [] });
  return list.populate(POPULATE);
}

export async function updateList(
  userId: string,
  listId: string,
  input: Partial<ListInput>
): Promise<ShoppingListDocument> {
  const list = await getOwnedList(userId, listId);
  if (input.name !== undefined) list.name = input.name;
  if (input.sharedWithIds !== undefined) {
    list.sharedWith = Array.from(new Set(input.sharedWithIds)) as unknown as ShoppingListDocument["sharedWith"];
  }
  await list.save();
  return list.populate(POPULATE);
}

export async function deleteList(userId: string, listId: string): Promise<void> {
  await getOwnedList(userId, listId);
  await ShoppingList.deleteOne({ _id: listId });
}

// --- Items --------------------------------------------------------------------

export async function addItem(userId: string, listId: string, text: string): Promise<ShoppingListDocument> {
  const list = await getScopedList(userId, listId);
  list.items.push({ text, checked: false, addedBy: userId } as unknown as ShoppingListDocument["items"][number]);
  await list.save();
  return list.populate(POPULATE);
}

export async function setItemChecked(
  userId: string,
  listId: string,
  itemId: string,
  checked: boolean
): Promise<ShoppingListDocument> {
  const list = await getScopedList(userId, listId);
  const item = (list.items as unknown as { _id: unknown; checked: boolean }[]).find(
    (i) => String(i._id) === itemId
  );
  if (!item) throw ApiError.notFound("Item not found");
  item.checked = checked;
  await list.save();
  return list.populate(POPULATE);
}

export async function removeItem(userId: string, listId: string, itemId: string): Promise<ShoppingListDocument> {
  const list = await getScopedList(userId, listId);
  const before = list.items.length;
  list.items = list.items.filter(
    (i) => String((i as unknown as { _id: unknown })._id) !== itemId
  ) as unknown as ShoppingListDocument["items"];
  if (list.items.length === before) throw ApiError.notFound("Item not found");
  await list.save();
  return list.populate(POPULATE);
}
