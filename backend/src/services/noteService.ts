import { Note, type NoteDocument } from "../models/Note";
import { ApiError } from "../utils/ApiError";

interface NoteItemInput {
  text: string;
  done?: boolean;
}

interface NoteInput {
  title?: string;
  type?: "text" | "checklist";
  body?: string;
  items?: NoteItemInput[];
  color?: string;
  pinned?: boolean;
  sharedWith?: string[];
}

function scopedQuery(userId: string) {
  return { $or: [{ ownerId: userId }, { sharedWith: userId }] };
}

export async function listNotes(userId: string): Promise<NoteDocument[]> {
  return Note.find(scopedQuery(userId))
    .populate("ownerId", "name")
    .populate("sharedWith", "name")
    .sort({ pinned: -1, updatedAt: -1 });
}

export async function getNote(userId: string, noteId: string): Promise<NoteDocument> {
  const note = await Note.findOne({ _id: noteId, ...scopedQuery(userId) })
    .populate("ownerId", "name")
    .populate("sharedWith", "name");
  if (!note) throw ApiError.notFound("Note not found");
  return note;
}

export async function createNote(userId: string, input: NoteInput): Promise<NoteDocument> {
  const note = await Note.create({
    title: input.title ?? "",
    type: input.type ?? "text",
    body: input.body ?? "",
    items: input.items ?? [],
    color: input.color ?? "default",
    pinned: input.pinned ?? false,
    ownerId: userId,
    sharedWith: input.sharedWith ?? [],
  });
  return note.populate([
    { path: "ownerId", select: "name" },
    { path: "sharedWith", select: "name" },
  ]);
}

async function getOwnedNote(userId: string, noteId: string): Promise<NoteDocument> {
  const note = await Note.findById(noteId);
  if (!note) throw ApiError.notFound("Note not found");
  if (String(note.ownerId) !== String(userId)) {
    throw ApiError.forbidden("Only the note's owner can make this change");
  }
  return note;
}

export async function updateNote(
  userId: string,
  noteId: string,
  input: Partial<NoteInput>
): Promise<NoteDocument> {
  const note = await getOwnedNote(userId, noteId);

  if (input.title !== undefined) note.title = input.title;
  if (input.type !== undefined) note.type = input.type;
  if (input.body !== undefined) note.body = input.body;
  if (input.items !== undefined) {
    note.items = input.items as unknown as NoteDocument["items"];
  }
  if (input.color !== undefined) note.color = input.color;
  if (input.pinned !== undefined) note.pinned = input.pinned;
  if (input.sharedWith !== undefined) {
    note.sharedWith = input.sharedWith as unknown as NoteDocument["sharedWith"];
  }

  await note.save();
  return note.populate([
    { path: "ownerId", select: "name" },
    { path: "sharedWith", select: "name" },
  ]);
}

export async function deleteNote(userId: string, noteId: string): Promise<void> {
  const note = await getOwnedNote(userId, noteId);
  await Note.deleteOne({ _id: note._id });
}
