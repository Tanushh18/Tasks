import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as shoppingListService from "../services/shoppingListService";

type PopulatedRef = { _id: unknown; name: string } | null | undefined;

function serializeRef(ref: PopulatedRef) {
  if (!ref || typeof ref !== "object" || !("name" in ref)) return null;
  return { id: String(ref._id), name: ref.name };
}

function serializeList(list: Awaited<ReturnType<typeof shoppingListService.createList>>) {
  const sharedWith = (list.sharedWith as unknown as PopulatedRef[]) ?? [];
  const items = (list.items as unknown as { _id: unknown; text: string; checked: boolean; addedBy: PopulatedRef }[]) ?? [];
  return {
    id: String(list._id),
    name: list.name,
    createdBy: serializeRef(list.createdBy as unknown as PopulatedRef),
    sharedWith: sharedWith.map(serializeRef).filter((r): r is { id: string; name: string } => r !== null),
    items: items.map((item) => ({
      id: String(item._id),
      text: item.text,
      checked: item.checked,
      addedBy: serializeRef(item.addedBy),
    })),
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
  };
}

export const listLists = asyncHandler(async (req: Request, res: Response) => {
  const lists = await shoppingListService.listLists(req.userId!);
  res.json({ lists: lists.map(serializeList) });
});

export const getList = asyncHandler(async (req: Request, res: Response) => {
  const list = await shoppingListService.getList(req.userId!, req.params.listId);
  res.json({ list: serializeList(list) });
});

export const createList = asyncHandler(async (req: Request, res: Response) => {
  const list = await shoppingListService.createList(req.userId!, req.body);
  res.status(201).json({ list: serializeList(list) });
});

export const updateList = asyncHandler(async (req: Request, res: Response) => {
  const list = await shoppingListService.updateList(req.userId!, req.params.listId, req.body);
  res.json({ list: serializeList(list) });
});

export const deleteList = asyncHandler(async (req: Request, res: Response) => {
  await shoppingListService.deleteList(req.userId!, req.params.listId);
  res.status(204).send();
});

export const addItem = asyncHandler(async (req: Request, res: Response) => {
  const list = await shoppingListService.addItem(req.userId!, req.params.listId, req.body.text);
  res.status(201).json({ list: serializeList(list) });
});

export const setItemChecked = asyncHandler(async (req: Request, res: Response) => {
  const list = await shoppingListService.setItemChecked(
    req.userId!,
    req.params.listId,
    req.params.itemId,
    req.body.checked
  );
  res.json({ list: serializeList(list) });
});

export const removeItem = asyncHandler(async (req: Request, res: Response) => {
  const list = await shoppingListService.removeItem(req.userId!, req.params.listId, req.params.itemId);
  res.json({ list: serializeList(list) });
});
