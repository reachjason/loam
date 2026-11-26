"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addNote, deleteNote, listNotes, updateNote, type Note } from "@/lib/notes";
import type { EpubReader } from "./use-epub-reader";

/** A book's notes, kept in reading order, with quoted passages highlighted in the text. */
export function useNotes(bookId: string, reader: EpubReader, onHighlightClick: (id: string) => void) {
  const { status, highlight, unhighlight, compareCfi } = reader;
  const [notes, setNotes] = useState<Note[]>([]);
  const applied = useRef(new Set<string>());
  const clickRef = useRef(onHighlightClick);
  useEffect(() => {
    clickRef.current = onHighlightClick;
  }, [onHighlightClick]);

  useEffect(() => {
    let live = true;
    listNotes(bookId).then((n) => live && setNotes(n));
    return () => {
      live = false;
    };
  }, [bookId]);

  // Highlights can only be drawn once the book is open.
  useEffect(() => {
    if (status !== "ready") return;
    for (const n of notes) {
      if (!n.quote || applied.current.has(n.id)) continue;
      applied.current.add(n.id);
      highlight(n.cfi, () => clickRef.current(n.id));
    }
  }, [status, notes, highlight]);

  const sorted = useMemo(
    () => (status === "ready" ? [...notes].sort((a, b) => compareCfi(a.cfi, b.cfi) || a.createdAt - b.createdAt) : notes),
    [notes, status, compareCfi],
  );

  const add = useCallback(async (draft: Omit<Note, "id" | "bookId" | "createdAt" | "updatedAt">) => {
    const note = await addNote({ ...draft, bookId });
    setNotes((n) => [...n, note]);
    return note;
  }, [bookId]);

  const edit = useCallback(async (note: Note, text: string) => {
    const next = await updateNote(note, text);
    setNotes((n) => n.map((x) => (x.id === note.id ? next : x)));
  }, []);

  const remove = useCallback(
    async (note: Note) => {
      await deleteNote(note.id);
      if (applied.current.delete(note.id)) unhighlight(note.cfi);
      setNotes((n) => n.filter((x) => x.id !== note.id));
    },
    [unhighlight],
  );

  return { notes: sorted, add, edit, remove };
}
