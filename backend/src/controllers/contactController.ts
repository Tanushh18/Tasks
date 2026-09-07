import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as contactService from "../services/contactService";

type PopulatedRef = { _id: unknown; name: string } | null | undefined;

function serializeRef(ref: PopulatedRef) {
  if (!ref || typeof ref !== "object" || !("name" in ref)) return null;
  return { id: String(ref._id), name: ref.name };
}

function serializeContact(contact: Awaited<ReturnType<typeof contactService.getContact>>) {
  const sharedWith = (contact.sharedWith as unknown as PopulatedRef[]) ?? [];
  return {
    id: String(contact._id),
    name: contact.name,
    number: contact.number,
    description: contact.description,
    addedBy: serializeRef(contact.addedBy as unknown as PopulatedRef),
    sharedWith: sharedWith.map(serializeRef).filter((r): r is { id: string; name: string } => r !== null),
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt,
  };
}

export const listContacts = asyncHandler(async (req: Request, res: Response) => {
  const contacts = await contactService.listContacts(req.userId!);
  res.json({ contacts: contacts.map(serializeContact) });
});

export const createContact = asyncHandler(async (req: Request, res: Response) => {
  const contact = await contactService.createContact(req.userId!, req.body);
  res.status(201).json({ contact: serializeContact(contact) });
});

export const getContact = asyncHandler(async (req: Request, res: Response) => {
  const contact = await contactService.getContact(req.userId!, req.params.id);
  res.json({ contact: serializeContact(contact) });
});

export const updateContact = asyncHandler(async (req: Request, res: Response) => {
  const contact = await contactService.updateContact(req.userId!, req.params.id, req.body);
  res.json({ contact: serializeContact(contact) });
});

export const deleteContact = asyncHandler(async (req: Request, res: Response) => {
  await contactService.deleteContact(req.userId!, req.params.id);
  res.status(204).send();
});
