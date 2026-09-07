import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as noteService from "../services/noteService";

type PopulatedRef = { _id: unknown; name: string } | null | undefined;

function serializeRef(ref: PopulatedRef) {
  if (!ref || typeof ref !== "object" || !("name" in ref)) return null;
  return { id: String(ref._id), name: ref.name };
}

function serializeNote(note: Awaited<ReturnType<typeof noteService.getNote>>) {
  const sharedWith = (note.sharedWith as unknown as PopulatedRef[]) ?? [];
  return {
    id: String(note._id),
    title: note.title,
    type: note.type,
    body: note.body,
    items: note.items,
    color: note.color,
    pinned: note.pinned,
    ownerId: serializeRef(note.ownerId as unknown as PopulatedRef),
    sharedWith: sharedWith.map(serializeRef).filter((r): r is { id: string; name: string } => r !== null),
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

export const listNotes = asyncHandler(async (req: Request, res: Response) => {
  const notes = await noteService.listNotes(req.userId!);
  res.json({ notes: notes.map(serializeNote) });
});

export const createNote = asyncHandler(async (req: Request, res: Response) => {
  const note = await noteService.createNote(req.userId!, req.body);
  res.status(201).json({ note: serializeNote(note) });
});

export const getNote = asyncHandler(async (req: Request, res: Response) => {
  const note = await noteService.getNote(req.userId!, req.params.id);
  res.json({ note: serializeNote(note) });
});

export const updateNote = asyncHandler(async (req: Request, res: Response) => {
  const note = await noteService.updateNote(req.userId!, req.params.id, req.body);
  res.json({ note: serializeNote(note) });
});

export const deleteNote = asyncHandler(async (req: Request, res: Response) => {
  await noteService.deleteNote(req.userId!, req.params.id);
  res.status(204).send();
});
