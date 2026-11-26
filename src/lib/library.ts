"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export type Progress = {
  cfi: string;
  percent: number | null; // 0..1, null until locations are generated
  chapter: string | null;
};

export type Book = {
  id: string;
  title: string;
  author: string;
  cover: Blob | null;
  addedAt: number;
  openedAt: number | null;
  progress: Progress | null;
};

export type ReaderPrefs = {
  fontSize: number; // percent
  lineHeight: number;
  theme: "light" | "dark";
  showProgress: boolean;
  /** Pause the audiobook while writing a note, resume on save. */
  pauseForNotes: boolean;
};

export const DEFAULT_PREFS: ReaderPrefs = { fontSize: 105, lineHeight: 1.65, theme: "light", showProgress: true, pauseForNotes: true };

interface LoamDB extends DBSchema {
  books: { key: string; value: Book; indexes: { openedAt: number } };
  files: { key: string; value: Blob };
  locations: { key: string; value: string }; // epub.js locations JSON, cached per book
  notes: { key: string; value: Note; indexes: { bookId: string } };
}

export type Note = {
  id: string;
  bookId: string;
  /** Where the note was written: a range CFI when it quotes a passage, otherwise the page's start. */
  cfi: string;
  chapter: string | null;
  quote: string | null;
  text: string;
  createdAt: number;
  updatedAt: number;
};

let dbPromise: Promise<IDBPDatabase<LoamDB>> | null = null;

export function db() {
  dbPromise ??= openDB<LoamDB>("loam", 2, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) {
        d.createObjectStore("books", { keyPath: "id" }).createIndex("openedAt", "openedAt");
        d.createObjectStore("files");
        d.createObjectStore("locations");
      }
      if (oldVersion < 2) d.createObjectStore("notes", { keyPath: "id" }).createIndex("bookId", "bookId");
    },
  });
  return dbPromise;
}

/** Ask the browser not to evict the library under storage pressure. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    /* best effort */
  }
}

export async function listBooks(): Promise<Book[]> {
  const all = await (await db()).getAll("books");
  return all.sort((a, b) => (b.openedAt ?? b.addedAt) - (a.openedAt ?? a.addedAt));
}

export async function getBook(id: string) {
  return (await db()).get("books", id);
}

export async function getBookFile(id: string) {
  return (await db()).get("files", id);
}

export async function addEpub(file: File): Promise<Book> {
  const meta = await readEpubMeta(file);
  const book: Book = {
    id: crypto.randomUUID(),
    title: meta.title || file.name.replace(/\.epub$/i, ""),
    author: meta.author,
    cover: meta.cover,
    addedAt: Date.now(),
    openedAt: null,
    progress: null,
  };
  const d = await db();
  const tx = d.transaction(["books", "files"], "readwrite");
  await Promise.all([tx.objectStore("files").put(file, book.id), tx.objectStore("books").put(book), tx.done]);
  void requestPersistence();
  return book;
}

export async function removeBook(id: string) {
  const d = await db();
  const tx = d.transaction(["books", "files", "locations", "notes"], "readwrite");
  const notes = tx.objectStore("notes");
  const noteIds = await notes.index("bookId").getAllKeys(id);
  await Promise.all([
    tx.objectStore("books").delete(id),
    tx.objectStore("files").delete(id),
    tx.objectStore("files").delete(`${id}:audio`),
    tx.objectStore("locations").delete(id),
    ...noteIds.map((k) => notes.delete(k)),
    tx.done,
  ]);
}

/** Single read-write transaction, so rapid page turns are applied in order. */
export async function saveProgress(id: string, progress: Progress) {
  const tx = (await db()).transaction("books", "readwrite");
  const book = await tx.store.get(id);
  if (book) await tx.store.put({ ...book, progress, openedAt: Date.now() });
  await tx.done;
}

export async function getLocations(id: string) {
  return (await db()).get("locations", id);
}

export async function saveLocations(id: string, json: string) {
  await (await db()).put("locations", json, id);
}

const PREFS_KEY = "loam:reader-prefs";
export function loadPrefs(): ReaderPrefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") };
  } catch {
    return DEFAULT_PREFS;
  }
}
export function savePrefs(p: ReaderPrefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(p));
}

async function readEpubMeta(file: File) {
  const { default: ePub } = await import("epubjs");
  const book = ePub(await file.arrayBuffer());
  try {
    const metadata = await book.loaded.metadata;
    let cover: Blob | null = null;
    try {
      const url = await book.coverUrl();
      if (url) cover = await (await fetch(url)).blob();
    } catch {
      /* no cover */
    }
    return { title: metadata.title?.trim() ?? "", author: metadata.creator?.trim() ?? "", cover };
  } finally {
    // epub.js keeps loading (navigation, display options) after metadata; let it settle first.
    await book.ready.catch(() => {});
    book.destroy();
  }
}

/** What's attached to each book, for the shelf: note counts and whether an audiobook is stored. Reads keys only. */
export async function shelfExtras(): Promise<{ notes: Map<string, number>; audio: Set<string> }> {
  const d = await db();
  const notes = new Map<string, number>();
  let cursor = await d.transaction("notes").store.index("bookId").openKeyCursor();
  while (cursor) {
    const id = cursor.key as string;
    notes.set(id, (notes.get(id) ?? 0) + 1);
    cursor = await cursor.continue();
  }
  const audio = new Set(
    (await d.getAllKeys("files")).flatMap((k) => (typeof k === "string" && k.endsWith(":audio") ? [k.slice(0, -6)] : [])),
  );
  return { notes, audio };
}
