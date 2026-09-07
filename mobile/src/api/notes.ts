import { apiClient } from "./client";
import type { Note, NoteChecklistItem, NoteColor, NoteType } from "../types/models";

export interface NoteInput {
  title?: string;
  type?: NoteType;
  body?: string;
  items?: NoteChecklistItem[];
  color?: NoteColor;
  pinned?: boolean;
  sharedWith?: string[];
}

export async function listNotes(): Promise<Note[]> {
  const { data } = await apiClient.get<{ notes: Note[] }>("/notes");
  return data.notes;
}

export async function getNote(id: string): Promise<Note> {
  const { data } = await apiClient.get<{ note: Note }>(`/notes/${id}`);
  return data.note;
}

export async function createNote(input: NoteInput): Promise<Note> {
  const { data } = await apiClient.post<{ note: Note }>("/notes", input);
  return data.note;
}

export async function updateNote(id: string, input: Partial<NoteInput>): Promise<Note> {
  const { data } = await apiClient.patch<{ note: Note }>(`/notes/${id}`, input);
  return data.note;
}

export async function deleteNote(id: string): Promise<void> {
  await apiClient.delete(`/notes/${id}`);
}
