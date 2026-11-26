"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { Book as EpubBook, Contents, EpubCFI, Location, Rendition } from "epubjs";
import {
  getBook,
  getBookFile,
  getLocations,
  loadPrefs,
  saveLocations,
  savePrefs,
  saveProgress,
  type Book,
  type Progress,
  type ReaderPrefs,
} from "@/lib/library";
import { INK, flatten, type Entry } from "./config";

/** Events coming from inside the book's iframe. Read through a ref so the latest handlers are used. */
export type FrameEvents = {
  key: (e: KeyboardEvent) => void;
  /** A tap, with its horizontal position as a fraction of the screen width (0 = left edge). */
  tap: (x: number) => void;
  activity: () => void;
};

const SWIPE_PX = 40;
const TAP_PX = 10;
const TAP_MS = 350;

/**
 * epub.js positions highlights once and only redraws them when the page frame resizes, so they
 * drift when text re-flows inside it (fonts loading, text settings). Redraw after layout settles.
 */
function redrawMarks(r: Rendition) {
  requestAnimationFrame(() => {
    const views = r.views() as unknown as { all?: () => { pane?: { render: () => void } }[] };
    for (const v of views.all?.() ?? []) v.pane?.render();
  });
}

function applyPrefs(r: Rendition, p: ReaderPrefs) {
  r.themes.fontSize(`${p.fontSize}%`);
  r.themes.override("line-height", String(p.lineHeight), true);
  r.themes.override("color", INK[p.theme], true);
}

/**
 * Loads a book from the shelf into `viewRef`, and owns everything about the reading position:
 * the saved spot, the current chapter, progress, and text settings.
 */
export function useEpubReader(id: string, viewRef: RefObject<HTMLDivElement | null>, events: RefObject<FrameEvents>) {
  const bookRef = useRef<EpubBook | null>(null);
  const rendRef = useRef<Rendition | null>(null);
  const entriesRef = useRef<Entry[]>([]);
  const lastProgress = useRef<Progress | null>(null);
  /** The reading spot. Changes only when the reader moves, never because of re-layout. */
  const anchorRef = useRef<string | null>(null);
  const movedRef = useRef(false);
  const pendingChapter = useRef<number | null>(null);
  const stickyChapter = useRef<{ idx: number; anchor: string | null } | null>(null);
  const cfiRef = useRef<EpubCFI | null>(null);

  const [meta, setMeta] = useState<Book | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [toc, setToc] = useState<Entry[]>([]);
  const [chapterIdx, setChapterIdx] = useState(-1);
  const [pagesLeft, setPagesLeft] = useState<number | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [prefs, setPrefs] = useState<ReaderPrefs>(loadPrefs);
  /** The location index is built; positions can be turned into fractions of the book and back. */
  const [located, setLocated] = useState(false);

  const prefsRef = useRef(prefs);
  const chapterRef = useRef(chapterIdx);
  useEffect(() => {
    prefsRef.current = prefs;
    chapterRef.current = chapterIdx;
  }, [prefs, chapterIdx]);

  const flush = useCallback(() => {
    if (lastProgress.current) void saveProgress(id, lastProgress.current);
  }, [id]);

  const updatePrefs = useCallback((patch: Partial<ReaderPrefs>) => {
    const p = { ...prefsRef.current, ...patch };
    prefsRef.current = p;
    setPrefs(p);
    savePrefs(p);
    const r = rendRef.current;
    if (!r) return;
    const cfi = anchorRef.current ?? r.location?.start?.cfi;
    applyPrefs(r, p);
    if (cfi && (patch.fontSize || patch.lineHeight)) void r.display(cfi).then(() => redrawMarks(r));
    else redrawMarks(r);
  }, []);

  const next = useCallback(() => {
    movedRef.current = true;
    void rendRef.current?.next();
  }, []);
  const prev = useCallback(() => {
    movedRef.current = true;
    void rendRef.current?.prev();
  }, []);
  const jumpTo = useCallback((i: number) => {
    const target = entriesRef.current[i];
    if (!target) return;
    movedRef.current = true;
    pendingChapter.current = i;
    void rendRef.current?.display(target.href);
  }, []);
  const goChapter = useCallback((dir: 1 | -1) => jumpTo(chapterRef.current + dir), [jumpTo]);
  const goTo = useCallback((cfi: string) => {
    movedRef.current = true;
    stickyChapter.current = null;
    void rendRef.current?.display(cfi);
  }, []);

  /** Where a note written now belongs: the selected passage if there is one, otherwise the current page. */
  const capture = useCallback((): { cfi: string; quote: string | null; chapter: string | null } | null => {
    const r = rendRef.current;
    const cfi = anchorRef.current ?? r?.location?.start?.cfi;
    if (!r || !cfi) return null;
    const chapter = entriesRef.current[chapterRef.current]?.label ?? null;
    for (const c of r.getContents() as unknown as Contents[]) {
      const sel = c.window.getSelection();
      const text = sel?.toString().replace(/\s+/g, " ").trim();
      if (sel && text && sel.rangeCount) {
        const range = c.cfiFromRange(sel.getRangeAt(0));
        sel.removeAllRanges();
        return { cfi: range, quote: text, chapter };
      }
    }
    return { cfi, quote: null, chapter };
  }, []);

  const highlight = useCallback((cfi: string, onClick: () => void, className = "loam-hl") => {
    // Colors live in globals.css so they follow the reader's theme.
    rendRef.current?.annotations.highlight(cfi, {}, onClick, className, {});
  }, []);
  /** Every section of the book, loaded (for searching). */
  const loadSections = useCallback(async () => {
    const b = bookRef.current;
    if (!b) return [];
    const items: { index: number; load: (r: unknown) => Promise<unknown>; cfiFromRange: (r: Range) => string; linear?: boolean | string }[] = [];
    b.spine.each((s: (typeof items)[number]) => items.push(s));
    return Promise.all(
      items.map(async (s) => ({
        index: s.index,
        doc: ((await s.load(b.load.bind(b)).catch(() => null)) as Element | null)?.ownerDocument ?? null,
        cfiFromRange: (r: Range) => s.cfiFromRange(r),
      })),
    );
  }, []);
  const unhighlight = useCallback((cfi: string) => rendRef.current?.annotations.remove(cfi, "highlight"), []);
  /** Position as a fraction of the whole text (0..1), or null until locations are ready. */
  const fractionOf = useCallback((cfi: string) => {
    const b = bookRef.current;
    return b?.locations.length() ? b.locations.percentageFromCfi(cfi) : null;
  }, []);
  const cfiAt = useCallback((f: number) => {
    const b = bookRef.current;
    return b?.locations.length() ? b.locations.cfiFromPercentage(Math.max(0, Math.min(1, f))) : null;
  }, []);
  /** First and last position on the page(s) on screen. */
  const pageRange = useCallback(() => {
    const loc = rendRef.current?.location;
    return loc ? { start: anchorRef.current ?? loc.start.cfi, end: loc.end.cfi } : null;
  }, []);
  /** Where each contents entry starts, as a CFI (loads sections whose entries point at #anchors). */
  const entryStarts = useCallback(async (): Promise<(string | null)[]> => {
    const b = bookRef.current;
    if (!b) return [];
    return Promise.all(
      entriesRef.current.map(async (e) => {
        const section = b.spine.get(e.spine);
        if (!section) return null;
        if (!e.hash) return `epubcfi(${section.cfiBase}!/4)`;
        try {
          // load() resolves to the section's root element
          const root = (await section.load(b.load.bind(b))) as unknown as Element;
          const el = root.ownerDocument.getElementById(e.hash);
          return el ? section.cfiFromElement(el) : `epubcfi(${section.cfiBase}!/4)`;
        } catch {
          return `epubcfi(${section.cfiBase}!/4)`;
        }
      }),
    );
  }, []);

  /** Reading order of two CFIs (negative when `a` comes first). */
  const compareCfi = useCallback((a: string, b: string) => cfiRef.current?.compare(a, b) ?? 0, []);

  useEffect(() => {
    let cancelled = false;
    let locating: Promise<unknown> | null = null;

    (async () => {
      const [record, file] = await Promise.all([getBook(id), getBookFile(id)]);
      if (cancelled) return;
      if (!record || !file) return setStatus("missing");
      setMeta(record);

      const mod = await import("epubjs");
      const cfiTool: EpubCFI = new mod.EpubCFI();
      cfiRef.current = cfiTool;
      const book = mod.default(await file.arrayBuffer());
      bookRef.current = book;

      const rendition = book.renderTo(viewRef.current!, {
        width: "100%",
        height: "100%",
        flow: "paginated",
        spread: "auto",
        minSpreadWidth: 1100,
        allowScriptedContent: false,
      });
      rendRef.current = rendition;

      // Once a page's fonts finish loading the text re-flows; put the reader back on their spot.
      rendition.hooks.content.register(async (contents: Contents) => {
        await contents.addStylesheet(`${window.location.origin}/fonts/literata.css`);
        const doc = contents.document;
        await Promise.all([doc.fonts.load('1em "Literata"'), doc.fonts.load('italic 1em "Literata"')]).catch(() => {});
        // Images load after the text and push it around; redraw highlights once each settles.
        for (const img of doc.images) if (!img.complete) img.addEventListener("load", () => redrawMarks(rendition), { once: true });
        await doc.fonts.ready;
        redrawMarks(rendition);
        const anchor = anchorRef.current;
        if (cancelled || !anchor || movedRef.current) return;
        if (new mod.EpubCFI(anchor).spinePos === contents.sectionIndex) void rendition.display(anchor);
      });
      rendition.themes.default({
        body: {
          "font-family": '"Literata", Georgia, serif !important',
          background: "transparent !important",
          "text-rendering": "optimizeLegibility",
          "-webkit-font-smoothing": "antialiased",
          "hanging-punctuation": "first",
          "-webkit-tap-highlight-color": "transparent",
        },
        "p, li, blockquote, div, span": {
          "font-family": "inherit !important",
          "line-height": "inherit !important",
          color: "inherit !important",
        },
        a: { color: "inherit !important", "text-decoration-color": "rgba(120,100,70,.4) !important" },
        "::selection": { background: "rgba(122,140,80,.28)" },
        img: { "max-width": "100% !important", "max-height": "90vh !important", "object-fit": "contain" },
      });
      applyPrefs(rendition, prefsRef.current);

      const nav = await book.loaded.navigation;
      await book.ready;
      if (cancelled) return;
      const entries: Entry[] = flatten(nav.toc).flatMap((t) => {
        const [path, hash] = t.href.split("#");
        const s = book.spine.get(path);
        return s ? [{ ...t, spine: s.index, hash: hash || null }] : [];
      });
      entriesRef.current = entries;
      setToc(entries);

      /**
       * Current chapter = last TOC entry that starts at or before the end of the visible page.
       * Handles EPUBs where several chapters share one file (entries with #anchors).
       */
      const findChapter = (loc: Location): number => {
        const section = loc.start.index;
        const contents = (rendition.getContents() as unknown as Contents[]).find((c) => c.sectionIndex === section);
        let best = -1;
        for (let i = 0; i < entries.length; i++) {
          const e = entries[i];
          if (e.spine < section) best = i;
          else if (e.spine === section) {
            if (!e.hash) best = i;
            else {
              const el = contents?.document.getElementById(e.hash);
              if (!el) continue;
              if (cfiTool.compare(contents!.cfiFromNode(el), loc.end.cfi) <= 0) best = i;
            }
          } else break;
        }
        return best;
      };

      rendition.on("relocated", (loc: Location) => {
        redrawMarks(rendition);
        if (movedRef.current || !anchorRef.current) {
          anchorRef.current = loc.start.cfi;
          movedRef.current = false;
        }
        const cfi = anchorRef.current;
        if (pendingChapter.current !== null) {
          stickyChapter.current = { idx: pendingChapter.current, anchor: cfi };
          pendingChapter.current = null;
        }
        const sticky = stickyChapter.current;
        const pct = book.locations.length() ? book.locations.percentageFromCfi(cfi) : null;
        const ci = sticky && sticky.anchor === cfi ? sticky.idx : findChapter(loc);
        const nextEntry = entries[ci + 1];
        // "pages left" is only meaningful when the next chapter starts in a different file
        const left =
          !nextEntry || nextEntry.spine !== loc.end.index || !nextEntry.hash
            ? Math.max(0, loc.end.displayed.total - loc.end.displayed.page)
            : null;
        setChapterIdx(ci);
        setPercent(pct);
        setPagesLeft(left);
        lastProgress.current = { cfi, percent: pct, chapter: entries[ci]?.label ?? null };
        void saveProgress(id, lastProgress.current);
      });

      // Input from inside the iframe: keys, mouse activity, swipes and taps.
      rendition.on("keydown", (e: KeyboardEvent) => events.current.key(e));
      rendition.on("mousemove", () => events.current.activity());
      let touch: { x: number; y: number; t: number } | null = null;
      rendition.on("touchstart", (e: TouchEvent) => {
        const p = e.changedTouches[0];
        touch = p ? { x: p.screenX, y: p.screenY, t: Date.now() } : null;
      });
      rendition.on("touchend", (e: TouchEvent) => {
        const p = e.changedTouches[0];
        if (!touch || !p) return;
        const dx = p.screenX - touch.x;
        const dy = p.screenY - touch.y;
        const quick = Date.now() - touch.t < TAP_MS;
        touch = null;
        if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) return (dx < 0 ? next : prev)();
        const selecting = !!e.view?.getSelection()?.toString();
        if (quick && Math.abs(dx) < TAP_PX && Math.abs(dy) < TAP_PX && !selecting) {
          events.current.tap(p.screenX / window.screen.width);
        }
      });

      anchorRef.current = record.progress?.cfi || null;
      await rendition.display(anchorRef.current || undefined);
      if (cancelled) return;
      setStatus("ready");

      // Percentages need a location index; cache it so it's computed once per book.
      const cached = await getLocations(id);
      if (cached) book.locations.load(cached);
      else {
        locating = book.locations.generate(1600);
        await locating;
        if (cancelled) return;
        void saveLocations(id, book.locations.save());
      }
      if (cancelled) return;
      setLocated(true);
      const cur = anchorRef.current;
      if (cur) {
        const pct = book.locations.percentageFromCfi(cur);
        setPercent(pct);
        if (lastProgress.current) {
          lastProgress.current = { ...lastProgress.current, percent: pct };
          void saveProgress(id, lastProgress.current);
        }
      }
    })().catch((err) => {
      console.error("[reader]", err);
      if (!cancelled) setStatus("error");
    });

    return () => {
      cancelled = true;
      flush();
      const book = bookRef.current;
      const rendition = rendRef.current;
      // epub.js keeps working after open (rendering start, location scan); tear down once it settles.
      void Promise.allSettled([book?.opened, locating]).then(() =>
        setTimeout(() => {
          rendition?.destroy();
          book?.destroy();
        }, 0),
      );
      rendRef.current = null;
      bookRef.current = null;
      anchorRef.current = null;
    };
  }, [id, viewRef, events, next, prev, flush]);

  // Save the spot when the tab is hidden or closed (mobile browsers often skip unload).
  useEffect(() => {
    const hidden = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [flush]);

  return {
    meta,
    status,
    toc,
    chapterIdx,
    pagesLeft,
    percent,
    prefs,
    updatePrefs,
    next,
    prev,
    jumpTo,
    goChapter,
    goTo,
    capture,
    located,
    fractionOf,
    cfiAt,
    pageRange,
    entryStarts,
    loadSections,
    highlight,
    unhighlight,
    compareCfi,
    flush,
  };
}

export type EpubReader = ReturnType<typeof useEpubReader>;
