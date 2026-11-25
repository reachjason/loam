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
};

export const DEFAULT_PREFS: ReaderPrefs = { fontSize: 105, lineHeight: 1.65, theme: "light", showProgress: true };

interface LoamDB extends DBSchema {
  books: { key: string; value: Book; indexes: { openedAt: number } };
  files: { key: string; value: Blob };
  locations: { key: string; value: string }; // epub.js locations JSON, cached per book
}

let dbPromise: Promise<IDBPDatabase<LoamDB>> | null = null;

function db() {
  dbPromise ??= openDB<LoamDB>("loam", 1, {
    upgrade(d) {
      d.createObjectStore("books", { keyPath: "id" }).createIndex("openedAt", "openedAt");
      d.createObjectStore("files");
      d.createObjectStore("locations");
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
  const tx = d.transaction(["books", "files", "locations"], "readwrite");
  await Promise.all([
    tx.objectStore("books").delete(id),
    tx.objectStore("files").delete(id),
    tx.objectStore("locations").delete(id),
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
