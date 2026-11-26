"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AudioChapter } from "@/lib/m4b-chapters";
import type { Audiobook } from "./use-audiobook";
import type { EpubReader } from "./use-epub-reader";

/**
 * Relates audiobook time to a position in the text. Known pairs ("sync points") come from
 * chapters whose titles match, plus any the reader links by hand; between them the narrator is
 * assumed to read at an even pace.
 */

type Link = { cfi: string; time: number };
type Point = { t: number; f: number }; // audio seconds ↔ fraction of the text

const linksKey = (id: string) => `loam:sync:${id}`;
const loadLinks = (id: string): Link[] => {
  try {
    return JSON.parse(localStorage.getItem(linksKey(id)) ?? "[]");
  } catch {
    return [];
  }
};
const FOLLOW_KEY = "loam:follow-audio";

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^(chapter|part|section|book)\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function sameTitle(a: string, b: string) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.length > 3 && y.length > 3 && (x.includes(y) || y.includes(x))) return true;
  const n = (s: string) => /^(\d+)\b/.exec(s)?.[1];
  return !!n(x) && n(x) === n(y);
}

/** Pairs each audio chapter with the next matching contents entry, keeping both in order. */
function matchChapters(audio: AudioChapter[], labels: string[]): [number, number][] {
  const pairs: [number, number][] = [];
  let from = 0;
  for (let j = 0; j < audio.length; j++) {
    for (let i = from; i < Math.min(labels.length, from + 12); i++) {
      if (sameTitle(audio[j].title, labels[i])) {
        pairs.push([j, i]);
        from = i + 1;
        break;
      }
    }
  }
  return pairs;
}

/** Keep points that move forward in both time and text; hand-made links win over guesses. */
function consistent(manual: Point[], auto: Point[], duration: number): Point[] {
  const fits = (p: Point, ref: Point[]) => ref.every((m) => (p.t - m.t) * (p.f - m.f) > 0);
  const all = [...manual, ...auto.filter((p) => fits(p, manual))].sort((a, b) => a.t - b.t);
  const out: Point[] = [{ t: 0, f: 0 }];
  for (const p of all) if (p.t > out.at(-1)!.t && p.f > out.at(-1)!.f) out.push(p);
  if (duration > out.at(-1)!.t) out.push({ t: duration, f: 1 });
  return out;
}

function interp(points: Point[], x: number, from: "t" | "f", to: "t" | "f") {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (x <= b[from] || i === points.length - 1) {
      const span = b[from] - a[from] || 1;
      return a[to] + ((x - a[from]) / span) * (b[to] - a[to]);
    }
  }
  return 0;
}

export function useSync(bookId: string, reader: EpubReader, audio: Audiobook) {
  const { located, toc, fractionOf, cfiAt, pageRange, entryStarts, goTo, compareCfi } = reader;
  const { chapters, duration, file, playing, time, seek } = audio;
  const [links, setLinks] = useState<Link[]>(() => loadLinks(bookId));
  const [entryCfis, setEntryCfis] = useState<(string | null)[]>([]);
  const [follow, setFollowState] = useState(() => typeof window !== "undefined" && localStorage.getItem(FOLLOW_KEY) === "1");

  useEffect(() => {
    if (!located || !file) return;
    let live = true;
    entryStarts().then((c) => live && setEntryCfis(c));
    return () => {
      live = false;
    };
  }, [located, file, toc, entryStarts]);

  const points = useMemo(() => {
    if (!located || !duration) return null;
    const manual = links.flatMap((l) => {
      const f = fractionOf(l.cfi);
      return f == null ? [] : [{ t: l.time, f }];
    });
    const auto = matchChapters(
      chapters,
      toc.map((e) => e.label),
    ).flatMap(([j, i]) => {
      const f = entryCfis[i] ? fractionOf(entryCfis[i]!) : null;
      return f == null ? [] : [{ t: chapters[j].start, f }];
    });
    return { list: consistent(manual, auto, duration), matched: auto.length };
  }, [located, duration, links, chapters, toc, entryCfis, fractionOf]);

  const ready = !!points && !!file;

  /** Turn to the page the narrator is reading. */
  const showInBook = useCallback(() => {
    if (!points) return;
    const cfi = cfiAt(interp(points.list, time, "t", "f"));
    if (cfi) goTo(cfi);
  }, [points, time, cfiAt, goTo]);

  /** Start the audio at the top of the page on screen. */
  const listenFromPage = useCallback(() => {
    const range = pageRange();
    const f = range && fractionOf(range.start);
    if (!points || f == null) return;
    seek(interp(points.list, f, "f", "t"));
  }, [points, pageRange, fractionOf, seek]);

  /** "The narrator is at the top of this page right now." */
  const link = useCallback(() => {
    const range = pageRange();
    if (!range) return;
    setLinks((cur) => {
      const next = [...cur.filter((l) => Math.abs(l.time - time) > 5), { cfi: range.start, time }];
      localStorage.setItem(linksKey(bookId), JSON.stringify(next));
      return next;
    });
  }, [pageRange, time, bookId]);
  const clearLinks = useCallback(() => {
    localStorage.removeItem(linksKey(bookId));
    setLinks([]);
  }, [bookId]);

  const setFollow = useCallback(
    (on: boolean) => {
      localStorage.setItem(FOLLOW_KEY, on ? "1" : "0");
      setFollowState(on);
      if (on) showInBook(); // go to the narrator right away, even while paused
    },
    [showInBook],
  );

  // Follow along: when the narrator moves past the page on screen, turn to theirs.
  const lastCheck = useRef(0);
  useEffect(() => {
    if (!follow || !playing || !points || Math.abs(time - lastCheck.current) < 2) return;
    lastCheck.current = time;
    const target = cfiAt(interp(points.list, time, "t", "f"));
    const range = pageRange();
    if (!target || !range) return;
    if (compareCfi(target, range.start) < 0 || compareCfi(target, range.end) > 0) goTo(target);
  }, [follow, playing, points, time, cfiAt, pageRange, compareCfi, goTo]);

  return {
    ready,
    matched: points?.matched ?? 0,
    links: links.length,
    follow,
    setFollow,
    showInBook,
    listenFromPage,
    link,
    clearLinks,
  };
}

export type Sync = ReturnType<typeof useSync>;
