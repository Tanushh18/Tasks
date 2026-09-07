import { apiClient } from "./client";
import type { Contact } from "../types/models";

export interface ContactInput {
  name: string;
  number: string;
  description?: string;
  sharedWith?: string[];
}

export async function listContacts(): Promise<Contact[]> {
  const { data } = await apiClient.get<{ contacts: Contact[] }>("/contacts");
  return data.contacts;
}

export async function getContact(id: string): Promise<Contact> {
  const { data } = await apiClient.get<{ contact: Contact }>(`/contacts/${id}`);
  return data.contact;
}

export async function createContact(input: ContactInput): Promise<Contact> {
  const { data } = await apiClient.post<{ contact: Contact }>("/contacts", input);
  return data.contact;
}

export async function updateContact(id: string, input: Partial<ContactInput>): Promise<Contact> {
  const { data } = await apiClient.patch<{ contact: Contact }>(`/contacts/${id}`, input);
  return data.contact;
}

export async function deleteContact(id: string): Promise<void> {
  await apiClient.delete(`/contacts/${id}`);
}
