"use client";

import { db, type Note } from "./library";

export type { Note };

export async function listNotes(bookId: string): Promise<Note[]> {
  return (await db()).getAllFromIndex("notes", "bookId", bookId);
}

export async function addNote(note: Omit<Note, "id" | "createdAt" | "updatedAt">): Promise<Note> {
  const now = Date.now();
  const full: Note = { ...note, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
  await (await db()).put("notes", full);
  return full;
}

export async function updateNote(note: Note, text: string): Promise<Note> {
  const next = { ...note, text, updatedAt: Date.now() };
  await (await db()).put("notes", next);
  return next;
}

export async function deleteNote(id: string) {
  await (await db()).delete("notes", id);
}
