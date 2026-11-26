"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Entry } from "./config";
import type { EpubReader } from "./use-epub-reader";

export type SearchResult = { cfi: string; chapter: string | null; before: string; match: string; after: string };

/** One section's text, normalized for matching, with a map back to the DOM for each character. */
type Indexed = { text: string; shown: string; node: number[]; offset: number[]; nodes: Text[]; doc: Document; toCfi: (r: Range) => string; index: number };

const MAX_RESULTS = 500;
const CONTEXT = 48;
const BLOCK = "p,div,h1,h2,h3,h4,h5,h6,li,blockquote,section,article,td,th,dd,dt,pre,figcaption,aside";
const SAME: Record<string, string> = { "’": "'", "‘": "'", "‛": "'", "“": '"', "”": '"', "„": '"', "–": "-", "—": "-", " ": " " };

/** Lowercase, drop accents, straighten quotes: "It’s Café" → "it's cafe". */
const fold = (c: string) => (SAME[c] ?? c).normalize("NFKD").replace(/[̀-ͯ]/g, "");
export const normalizeQuery = (q: string) => [...q].map((c) => fold(c).toLowerCase()).join("").replace(/\s+/g, " ").trim();

function indexSection(doc: Document, index: number, toCfi: (r: Range) => string): Indexed {
  const out: Indexed = { text: "", shown: "", node: [], offset: [], nodes: [], doc, toCfi, index };
  const walker = doc.createTreeWalker(doc.body ?? doc.documentElement, NodeFilter.SHOW_TEXT);
  let text = "";
  let shown = "";
  let lastBlock: Element | null = null;
  const push = (t: string, s: string, n: number, o: number) => {
    text += t;
    shown += s;
    out.node.push(n);
    out.offset.push(o);
  };
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (n.parentElement?.closest("script,style,head")) continue;
    const ni = out.nodes.push(n) - 1;
    const block = n.parentElement?.closest(BLOCK) ?? null;
    // Separate paragraphs so a phrase can't match across them.
    if (lastBlock && block !== lastBlock && !text.endsWith(" ")) push(" ", " ", ni, 0);
    lastBlock = block;
    const data = n.data;
    for (let i = 0; i < data.length; i++) {
      if (/\s/.test(data[i])) {
        if (!text.endsWith(" ") && text.length) push(" ", " ", ni, i);
        continue;
      }
      for (const c of fold(data[i])) push(c.toLowerCase()[0], c, ni, i);
    }
  }
  out.text = text;
  out.shown = shown;
  return out;
}

/** Search the whole book in the browser; sections are read once, then kept for instant searches. */
export function useBookSearch(reader: EpubReader) {
  const { status, loadSections, toc } = reader;
  const index = useRef<Promise<Indexed[]> | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [truncated, setTruncated] = useState(false);

  const getIndex = useCallback(() => {
    index.current ??= loadSections().then((secs) =>
      secs.flatMap((s) => (s.doc ? [indexSection(s.doc, s.index, s.cfiFromRange)] : [])),
    );
    return index.current;
  }, [loadSections]);

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
          const end = at + q.length - 1;
          const range = s.doc.createRange();
          range.setStart(s.nodes[s.node[at]], s.offset[at]);
          range.setEnd(s.nodes[s.node[end]], s.offset[end] + 1);
          let cfi: string;
          try {
            cfi = s.toCfi(range);
          } catch {
            continue;
          }
          found.push({
            cfi,
            chapter: chapterFor(toc, s.index),
            before: s.shown.slice(Math.max(0, at - CONTEXT), at),
            match: s.shown.slice(at, end + 1),
            after: s.shown.slice(end + 1, end + 1 + CONTEXT),
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
  }, [query, status, getIndex, toc]);

  return { query, setQuery, results, busy, truncated };
}

function chapterFor(toc: Entry[], spine: number) {
  let label: string | null = null;
  for (const e of toc) {
    if (e.spine > spine) break;
    label = e.label;
  }
  return label;
}

export type BookSearch = ReturnType<typeof useBookSearch>;
