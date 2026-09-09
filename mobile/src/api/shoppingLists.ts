import { apiClient } from "./client";

export interface ListPerson {
  id: string;
  name: string;
}

export interface ShoppingItem {
  id: string;
  text: string;
  checked: boolean;
  addedBy: ListPerson | null;
}

export interface ShoppingList {
  id: string;
  name: string;
  createdBy: ListPerson | null;
  sharedWith: ListPerson[];
  items: ShoppingItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ShoppingListInput {
  name: string;
  sharedWithIds?: string[];
}

export async function listLists(): Promise<ShoppingList[]> {
  const { data } = await apiClient.get<{ lists: ShoppingList[] }>("/shopping-lists");
  return data.lists;
}

export async function getList(listId: string): Promise<ShoppingList> {
  const { data } = await apiClient.get<{ list: ShoppingList }>(`/shopping-lists/${listId}`);
  return data.list;
}

export async function createList(input: ShoppingListInput): Promise<ShoppingList> {
  const { data } = await apiClient.post<{ list: ShoppingList }>("/shopping-lists", input);
  return data.list;
}

export async function updateList(listId: string, input: Partial<ShoppingListInput>): Promise<ShoppingList> {
  const { data } = await apiClient.put<{ list: ShoppingList }>(`/shopping-lists/${listId}`, input);
  return data.list;
}

export async function deleteList(listId: string): Promise<void> {
  await apiClient.delete(`/shopping-lists/${listId}`);
}

export async function addItem(listId: string, text: string): Promise<ShoppingList> {
  const { data } = await apiClient.post<{ list: ShoppingList }>(`/shopping-lists/${listId}/items`, { text });
  return data.list;
}

export async function setItemChecked(listId: string, itemId: string, checked: boolean): Promise<ShoppingList> {
  const { data } = await apiClient.put<{ list: ShoppingList }>(`/shopping-lists/${listId}/items/${itemId}`, {
    checked,
  });
  return data.list;
}

export async function removeItem(listId: string, itemId: string): Promise<ShoppingList> {
  const { data } = await apiClient.delete<{ list: ShoppingList }>(`/shopping-lists/${listId}/items/${itemId}`);
  return data.list;
}
