"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Entry } from "./config";
import type { EpubReader } from "./use-epub-reader";

export type SearchResult = {
  /** Spine section and character span of the match in that section's searchable text. */
  section: number;
  at: number;
  length: number;
  /** Contents entry the match falls under; -1 for front matter before the first entry. */
  chapterIdx: number;
  chapter: string | null;
  before: string;
  match: string;
  after: string;
  /** Approximate position in the book, 0..1, when known. */
  fraction: number | null;
};

/**
 * The searchable text of one section: plain strings only, no DOM. The way back to the page
 * (a CFI) is worked out only when a result is opened, by re-reading that one section.
 */
type Indexed = { section: number; text: string; shown: string; start: number | null; end: number | null };

const MAX_RESULTS = 500;
const CONTEXT = 70;
/** Drop the searchable text this long after the last search, so it isn't held while reading. */
const IDLE_RELEASE_MS = 5 * 60_000;
const BLOCK = "p,div,h1,h2,h3,h4,h5,h6,li,blockquote,section,article,td,th,dd,dt,pre,figcaption,aside";
const SAME: Record<string, string> = {
  "’": "'",
  "‘": "'",
  "‛": "'",
  "“": '"',
  "”": '"',
  "„": '"',
  "–": "-",
  "—": "-",
  " ": " ",
};

/** Lowercase, drop accents, straighten quotes: "It’s Café" → "it's cafe". */
const fold = (c: string) => (SAME[c] ?? c).normalize("NFKD").replace(/[̀-ͯ]/g, "");
export const normalizeQuery = (q: string) =>
  [...q]
    .map((c) => fold(c).toLowerCase())
    .join("")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Walk a section's text. Calls `emit` once per searchable character with the text node and
 * offset it came from; used both to build the index and, later, to find a match in the DOM.
 */
function walk(doc: Document, emit: (folded: string, shown: string, node: Text, offset: number) => void) {
  const walker = doc.createTreeWalker(doc.body ?? doc.documentElement, NodeFilter.SHOW_TEXT);
  let lastBlock: Element | null = null;
  let lastSpace = true;
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (n.parentElement?.closest("script,style,head")) continue;
    const block = n.parentElement?.closest(BLOCK) ?? null;
    // Separate paragraphs so a phrase can't match across them.
    if (lastBlock && block !== lastBlock && !lastSpace) {
      emit(" ", " ", n, 0);
      lastSpace = true;
    }
    lastBlock = block;
    const data = n.data;
    for (let i = 0; i < data.length; i++) {
      if (/\s/.test(data[i])) {
        if (!lastSpace) emit(" ", " ", n, i);
        lastSpace = true;
        continue;
      }
      for (const c of fold(data[i])) emit(c.toLowerCase()[0], c, n, i);
      lastSpace = false;
    }
  }
}

export function useBookSearch(reader: EpubReader) {
  const { status, toc, sectionList, readSection, fractionOf, located } = reader;
  const index = useRef<Promise<Indexed[]> | null>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [truncated, setTruncated] = useState(false);

  /** Forget the searchable text (results stay; they can still be opened). */
  const release = useCallback(() => {
    clearTimeout(idle.current);
    index.current = null;
  }, []);

  const getIndex = useCallback(() => {
    clearTimeout(idle.current);
    idle.current = setTimeout(release, IDLE_RELEASE_MS);
    index.current ??= (async () => {
      const list = sectionList();
      const starts = list.map((s) => fractionOf(`epubcfi(${s.cfiBase}!/4)`));
      const out: Indexed[] = [];
      // One section at a time: read, keep the text, let the document go.
      for (let k = 0; k < list.length; k++) {
        const entry = await readSection(list[k].index, (doc) => {
          let text = "";
          let shown = "";
          walk(doc, (f, s) => {
            text += f;
            shown += s;
          });
          return { text, shown };
        });
        if (entry) out.push({ section: list[k].index, ...entry, start: starts[k], end: starts[k + 1] ?? (starts[k] == null ? null : 1) });
      }
      return out;
    })();
    return index.current;
  }, [sectionList, readSection, fractionOf, release]);

  useEffect(() => () => clearTimeout(idle.current), []);

  useEffect(() => {
    const q = normalizeQuery(query);
    if (status !== "ready" || q.length < 2) {
      const t = setTimeout(() => {
        setResults([]);
        setTruncated(false);
        setBusy(false);
      }, 0);
      return () => clearTimeout(t);
    }
    let live = true;
    const t = setTimeout(async () => {
      setBusy(true);
      const secs = await getIndex();
      if (!live) return;
      const found: SearchResult[] = [];
      for (const s of secs) {
        for (let at = s.text.indexOf(q); at !== -1 && found.length < MAX_RESULTS; at = s.text.indexOf(q, at + q.length)) {
          const chapterIdx = chapterFor(toc, s.section);
          found.push({
            section: s.section,
            at,
            length: q.length,
            chapterIdx,
            chapter: toc[chapterIdx]?.label ?? null,
            fraction: s.start != null && s.end != null ? s.start + (at / Math.max(1, s.text.length)) * (s.end - s.start) : null,
            before: wordsBefore(s.shown, at),
            match: s.shown.slice(at, at + q.length),
            after: wordsAfter(s.shown, at + q.length),
          });
        }
      }
      setResults(found);
      setTruncated(found.length >= MAX_RESULTS);
      setBusy(false);
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // `located` refreshes position estimates once the location index is ready
  }, [query, status, getIndex, toc, located]);

  /** Where a result is in the book: re-reads just its section to find the exact spot. */
  const locate = useCallback(
    (r: SearchResult) =>
      readSection(r.section, (doc, toCfi) => {
        let i = 0;
        let start: [Text, number] | null = null;
        let end: [Text, number] | null = null;
        const last = r.at + r.length - 1;
        walk(doc, (_f, _s, node, offset) => {
          if (i === r.at) start = [node, offset];
          if (i === last) end = [node, offset + 1];
          i++;
        });
        if (!start || !end) return null;
        const range = doc.createRange();
        range.setStart(...(start as [Text, number]));
        range.setEnd(...(end as [Text, number]));
        return toCfi(range);
      }),
    [readSection],
  );

  return { query, setQuery, results, busy, truncated, locate, release };
}

function chapterFor(toc: Entry[], spine: number) {
  let idx = -1;
  for (let i = 0; i < toc.length && toc[i].spine <= spine; i++) idx = i;
  return idx;
}

/** Context around a match, cut at whole words; "…" marks a cut. */
function wordsBefore(text: string, at: number) {
  const from = Math.max(0, at - CONTEXT);
  let chunk = text.slice(from, at);
  if (from > 0) chunk = "…" + chunk.slice(chunk.indexOf(" ") + 1);
  return chunk;
}
function wordsAfter(text: string, from: number) {
  const to = from + CONTEXT;
  let chunk = text.slice(from, to);
  if (to < text.length) chunk = chunk.slice(0, Math.max(chunk.lastIndexOf(" "), 0)) + "…";
  return chunk;
}

export type BookSearch = ReturnType<typeof useBookSearch>;
