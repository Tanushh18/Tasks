import { Contact, type ContactDocument } from "../models/Contact";
import { ApiError } from "../utils/ApiError";

interface ContactInput {
  name: string;
  number: string;
  description?: string;
  sharedWith?: string[];
}

function scopedQuery(userId: string) {
  return { $or: [{ addedBy: userId }, { sharedWith: userId }] };
}

export async function listContacts(userId: string): Promise<ContactDocument[]> {
  return Contact.find(scopedQuery(userId))
    .populate("addedBy", "name")
    .populate("sharedWith", "name")
    .sort("-createdAt");
}

export async function getContact(userId: string, contactId: string): Promise<ContactDocument> {
  const contact = await Contact.findOne({ _id: contactId, ...scopedQuery(userId) })
    .populate("addedBy", "name")
    .populate("sharedWith", "name");
  if (!contact) throw ApiError.notFound("Contact not found");
  return contact;
}

export async function createContact(userId: string, input: ContactInput): Promise<ContactDocument> {
  const contact = await Contact.create({
    name: input.name,
    number: input.number,
    description: input.description ?? "",
    addedBy: userId,
    sharedWith: input.sharedWith ?? [],
  });
  return contact.populate([
    { path: "addedBy", select: "name" },
    { path: "sharedWith", select: "name" },
  ]);
}

export interface BulkImportResult {
  imported: ContactDocument[];
  skipped: { name: string; number: string; reason: "duplicate" }[];
}

/**
 * Imports many device contacts at once, deduping against contacts this user
 * already added (by exact number match) so re-running "sync all" doesn't
 * pile up copies every time.
 */
export async function bulkCreateContacts(userId: string, inputs: ContactInput[]): Promise<BulkImportResult> {
  const existing = await Contact.find({ addedBy: userId }, "number").lean();
  const existingNumbers = new Set(existing.map((c) => c.number));

  const toCreate: ContactInput[] = [];
  const skipped: BulkImportResult["skipped"] = [];
  const seenInBatch = new Set<string>();

  for (const input of inputs) {
    if (existingNumbers.has(input.number) || seenInBatch.has(input.number)) {
      skipped.push({ name: input.name, number: input.number, reason: "duplicate" });
      continue;
    }
    seenInBatch.add(input.number);
    toCreate.push(input);
  }

  if (toCreate.length === 0) {
    return { imported: [], skipped };
  }

  const created = await Contact.insertMany(
    toCreate.map((input) => ({
      name: input.name,
      number: input.number,
      description: input.description ?? "",
      addedBy: userId,
      sharedWith: [],
    }))
  );

  const populated = await Contact.find({ _id: { $in: created.map((c) => c._id) } })
    .populate("addedBy", "name")
    .populate("sharedWith", "name");

  return { imported: populated, skipped };
}

async function getOwnedContact(userId: string, contactId: string): Promise<ContactDocument> {
  const contact = await Contact.findById(contactId);
  if (!contact) throw ApiError.notFound("Contact not found");
  if (String(contact.addedBy) !== String(userId)) {
    throw ApiError.forbidden("Only the contact's owner can make this change");
  }
  return contact;
}

export async function updateContact(
  userId: string,
  contactId: string,
  input: Partial<ContactInput>
): Promise<ContactDocument> {
  const contact = await getOwnedContact(userId, contactId);

  if (input.name !== undefined) contact.name = input.name;
  if (input.number !== undefined) contact.number = input.number;
  if (input.description !== undefined) contact.description = input.description;
  if (input.sharedWith !== undefined) {
    contact.sharedWith = input.sharedWith as unknown as ContactDocument["sharedWith"];
  }

  await contact.save();
  return contact.populate([
    { path: "addedBy", select: "name" },
    { path: "sharedWith", select: "name" },
  ]);
}

export async function deleteContact(userId: string, contactId: string): Promise<void> {
  const contact = await getOwnedContact(userId, contactId);
  await Contact.deleteOne({ _id: contact._id });
}
