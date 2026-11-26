"use client";

import { db } from "./library";

const key = (bookId: string) => `${bookId}:audio`;

/** The audiobook attached to a book, stored next to its EPUB. */
export async function getAudio(bookId: string): Promise<File | null> {
  const blob = await (await db()).get("files", key(bookId));
  return blob instanceof File ? blob : null;
}

export async function saveAudio(bookId: string, file: File): Promise<File> {
  // Pickers often report .m4b as "" or "audio/x-m4b", which Safari won't play; it is plain MP4 audio.
  const typed = /\.(m4b|m4a)$/i.test(file.name) || !file.type ? new File([file], file.name, { type: "audio/mp4" }) : file;
  await (await db()).put("files", typed, key(bookId));
  return typed;
}

export async function removeAudio(bookId: string) {
  await (await db()).delete("files", key(bookId));
  localStorage.removeItem(posKey(bookId));
}

const posKey = (bookId: string) => `loam:audio-pos:${bookId}`;
export const loadPosition = (bookId: string) => Number(localStorage.getItem(posKey(bookId))) || 0;
export const savePosition = (bookId: string, t: number) => localStorage.setItem(posKey(bookId), String(Math.floor(t)));

export const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5];
const RATE_KEY = "loam:audio-rate";
export const loadRate = () => Number(localStorage.getItem(RATE_KEY)) || 1;
export const saveRate = (r: number) => localStorage.setItem(RATE_KEY, String(r));
