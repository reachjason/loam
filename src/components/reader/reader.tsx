"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Keyboard, List, Minus, Moon, Plus, Sun, X } from "lucide-react";
import type { Book as EpubBook, Contents, EpubCFI, Location, NavItem, Rendition } from "epubjs";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

const INK = { light: "#3a2e24", dark: "#e6dccb" } as const;
const FONT_STEPS = [85, 95, 105, 115, 125, 140, 160];
const LINE_STEPS = [1.4, 1.55, 1.65, 1.8, 2];
const IDLE_MS = 2200;

const SHORTCUTS: [string, string][] = [
  ["← →  or  Space ⇧Space", "Previous / next page"],
  ["[  ]", "Previous / next chapter"],
  ["C", "Contents"],
  ["P", "Show / hide progress"],
  ["−  =", "Smaller / larger text"],
  ["N", "Parchment / night"],
  ["Esc", "Close panel"],
  ["?", "Shortcuts"],
];

type Entry = { label: string; href: string; depth: number; spine: number; hash: string | null };

function flatten(items: NavItem[], depth = 0): { label: string; href: string; depth: number }[] {
  return items.flatMap((i) => [{ label: i.label.trim(), href: i.href, depth }, ...flatten(i.subitems ?? [], depth + 1)]);
}

function step<T>(arr: readonly T[], cur: T, dir: 1 | -1): T {
  const i = arr.indexOf(cur);
  const base = i === -1 ? arr.findIndex((v) => v > cur) : i;
  return arr[Math.max(0, Math.min(arr.length - 1, (base === -1 ? arr.length - 1 : base) + dir))];
}

export function Reader() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const viewRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<EpubBook | null>(null);
  const rendRef = useRef<Rendition | null>(null);
  const entriesRef = useRef<Entry[]>([]);
  const lastProgress = useRef<Progress | null>(null);
  /** The reading spot. Changes only when the reader moves, never because of re-layout. */
  const anchorRef = useRef<string | null>(null);
  const movedRef = useRef(false);
  const pendingChapter = useRef<number | null>(null);
  const stickyChapter = useRef<{ idx: number; anchor: string | null } | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [meta, setMeta] = useState<Book | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [toc, setToc] = useState<Entry[]>([]);
  const [chapterIdx, setChapterIdx] = useState(-1);
  const [pagesLeft, setPagesLeft] = useState<number | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [prefs, setPrefs] = useState<ReaderPrefs>(loadPrefs);
  const [panel, setPanel] = useState<"toc" | "type" | "keys" | null>(null);
  const [chrome, setChrome] = useState(true);

  const prefsRef = useRef(prefs);
  const panelRef = useRef(panel);
  const chapterRef = useRef(chapterIdx);
  useEffect(() => {
    prefsRef.current = prefs;
    panelRef.current = panel;
    chapterRef.current = chapterIdx;
  }, [prefs, panel, chapterIdx]);

  // ---- chrome visibility -------------------------------------------------
  const poke = useCallback(() => {
    setChrome(true);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      if (!panelRef.current) setChrome(false);
    }, IDLE_MS);
  }, []);

  // ---- saving ------------------------------------------------------------
  const flush = useCallback(() => {
    if (lastProgress.current) void saveProgress(id, lastProgress.current);
  }, [id]);

  // ---- typography + theme inside the iframe ------------------------------
  const applyPrefs = useCallback((r: Rendition, p: ReaderPrefs) => {
    r.themes.fontSize(`${p.fontSize}%`);
    r.themes.override("line-height", String(p.lineHeight), true);
    r.themes.override("color", INK[p.theme], true);
  }, []);

  const updatePrefs = useCallback(
    (patch: Partial<ReaderPrefs>) => {
      const p = { ...prefsRef.current, ...patch };
      prefsRef.current = p;
      setPrefs(p);
      savePrefs(p);
      const r = rendRef.current;
      if (!r) return;
      const cfi = anchorRef.current ?? r.location?.start?.cfi;
      applyPrefs(r, p);
      if (cfi && (patch.fontSize || patch.lineHeight)) void r.display(cfi);
    },
    [applyPrefs],
  );

  // ---- navigation --------------------------------------------------------
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

  const togglePanel = useCallback((p: "toc" | "type" | "keys") => setPanel((cur) => (cur === p ? null : p)), []);

  const onKey = useCallback(
    (e: KeyboardEvent, fromBook = false) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") return setPanel(null);
      const p = prefsRef.current;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const actions: Record<string, () => void> = {
        ArrowRight: next,
        PageDown: next,
        ArrowLeft: prev,
        PageUp: prev,
        " ": e.shiftKey ? prev : next,
        "]": () => goChapter(1),
        "[": () => goChapter(-1),
        c: () => togglePanel("toc"),
        p: () => updatePrefs({ showProgress: !p.showProgress }),
        "=": () => updatePrefs({ fontSize: step(FONT_STEPS, p.fontSize, 1) }),
        "+": () => updatePrefs({ fontSize: step(FONT_STEPS, p.fontSize, 1) }),
        "-": () => updatePrefs({ fontSize: step(FONT_STEPS, p.fontSize, -1) }),
        n: () => updatePrefs({ theme: p.theme === "light" ? "dark" : "light" }),
        "?": () => togglePanel("keys"),
      };
      const action = actions[k];
      if (!action) return;
      if (!fromBook) e.preventDefault(); // listeners inside the book frame are passive
      action();
    },
    [next, prev, goChapter, togglePanel, updatePrefs],
  );

  // Latest key handler, readable from the iframe listener registered once at load.
  const onKeyRef = useRef(onKey);
  useEffect(() => {
    onKeyRef.current = onKey;
  }, [onKey]);

  // ---- load book ---------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    let locating: Promise<unknown> | null = null;

    (async () => {
      const [record, file] = await Promise.all([getBook(id), getBookFile(id)]);
      if (cancelled) return;
      if (!record || !file) return setStatus("missing");
      setMeta(record);

      const mod = await import("epubjs");
      const ePub = mod.default;
      const cfiTool: EpubCFI = new mod.EpubCFI();
      const book = ePub(await file.arrayBuffer());
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
        await doc.fonts.ready;
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
              const anchor = contents!.cfiFromNode(el);
              if (cfiTool.compare(anchor, loc.end.cfi) <= 0) best = i;
            }
          } else break;
        }
        return best;
      };

      rendition.on("relocated", (loc: Location) => {
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

      // events from inside the iframe
      rendition.on("keydown", (e: KeyboardEvent) => onKeyRef.current(e, true));
      rendition.on("mousemove", poke);
      let touchX: number | null = null;
      rendition.on("touchstart", (e: TouchEvent) => (touchX = e.changedTouches[0]?.screenX ?? null));
      rendition.on("touchend", (e: TouchEvent) => {
        if (touchX === null) return;
        const dx = (e.changedTouches[0]?.screenX ?? touchX) - touchX;
        touchX = null;
        if (Math.abs(dx) > 40) (dx < 0 ? next : prev)();
      });

      anchorRef.current = record.progress?.cfi || null;
      await rendition.display(anchorRef.current || undefined);
      if (cancelled) return;
      setStatus("ready");
      poke();

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
      clearTimeout(idleTimer.current);
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
  }, [id, applyPrefs, poke, next, prev, flush]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => onKeyRef.current(e);
    const hidden = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("keydown", key);
    window.addEventListener("mousemove", poke);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("mousemove", poke);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [poke, flush]);

  const showChrome = chrome || panel !== null || status !== "ready";
  const chapter = toc[chapterIdx]?.label ?? null;
  const leftLabel =
    pagesLeft === null ? null : pagesLeft === 0 ? "Last page in chapter" : `${pagesLeft} ${pagesLeft === 1 ? "page" : "pages"} left in chapter`;

  return (
    <div
      data-reader-theme={prefs.theme}
      className="reader-surface fixed inset-0 z-10 flex flex-col bg-background text-foreground transition-colors"
    >
      {/* top bar */}
      <header
        className={cn(
          "absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 py-3 transition-opacity duration-500 sm:px-6",
          showChrome ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => {
            flush();
            router.push("/");
          }}
        >
          <ArrowLeft /> Shelf
        </Button>
        <p className="hidden max-w-[50%] truncate font-serif text-sm text-muted-foreground italic sm:block">{meta?.title}</p>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Keyboard shortcuts"
            className={cn("text-muted-foreground", panel === "keys" && "bg-muted text-foreground")}
            onClick={() => togglePanel("keys")}
          >
            <Keyboard />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Contents"
            className={cn("text-muted-foreground", panel === "toc" && "bg-muted text-foreground")}
            onClick={() => togglePanel("toc")}
          >
            <List />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Text settings"
            className={cn("font-serif text-base text-muted-foreground", panel === "type" && "bg-muted text-foreground")}
            onClick={() => togglePanel("type")}
          >
            Aa
          </Button>
        </div>
      </header>

      {/* page */}
      <div className="relative flex-1 px-[max(1.5rem,6vw)] pt-16 pb-14">
        <button
          type="button"
          aria-label="Previous page"
          onClick={prev}
          className="group absolute inset-y-0 left-0 z-10 flex w-[max(1.5rem,6vw)] items-center justify-center"
        >
          <ChevronLeft className="size-5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-60" />
        </button>
        <div ref={viewRef} className="h-full w-full" />
        <button
          type="button"
          aria-label="Next page"
          onClick={next}
          className="group absolute inset-y-0 right-0 z-10 flex w-[max(1.5rem,6vw)] items-center justify-center"
        >
          <ChevronRight className="size-5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-60" />
        </button>

        {status !== "ready" && (
          <div className="absolute inset-0 flex items-center justify-center">
            {status === "loading" && <p className="font-serif text-muted-foreground italic">Opening…</p>}
            {status === "missing" && (
              <p className="text-center text-sm text-muted-foreground">
                This book isn&apos;t on your shelf anymore.{" "}
                <Link href="/" className="text-primary underline underline-offset-4">
                  Back to shelf
                </Link>
              </p>
            )}
            {status === "error" && <p className="text-sm text-destructive">Couldn&apos;t open this book.</p>}
          </div>
        )}
      </div>

      {/* progress */}
      {prefs.showProgress && status === "ready" && (
        <footer className="absolute inset-x-0 bottom-0 z-20 px-[max(1.5rem,6vw)] pb-4" aria-label="Reading progress">
          <div className="mb-2 flex items-baseline justify-between gap-4 text-[11px] text-muted-foreground">
            <span className="truncate font-serif text-xs italic" data-testid="chapter">
              {chapter}
            </span>
            <span className="shrink-0 tabular-nums">
              {leftLabel}
              {leftLabel && percent != null && <span className="mx-2 opacity-50">·</span>}
              {percent != null && <span className="font-mono">{Math.round(percent * 100)}%</span>}
            </span>
          </div>
          <div className="h-px bg-border">
            <div className="h-px bg-primary/70 transition-[width] duration-300" style={{ width: `${(percent ?? 0) * 100}%` }} />
          </div>
        </footer>
      )}

      {/* contents panel */}
      {panel === "toc" && (
        <>
          <div className="absolute inset-0 z-30 bg-foreground/5" onClick={() => setPanel(null)} />
          <aside className="absolute top-0 right-0 bottom-0 z-40 flex w-full max-w-sm flex-col border-l border-border bg-card shadow-xl">
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="font-serif text-lg">Contents</h2>
              <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={() => setPanel(null)}>
                <X />
              </Button>
            </div>
            <nav className="flex-1 overflow-y-auto px-2 pb-6">
              {toc.map((t, i) => (
                <button
                  key={`${t.href}-${i}`}
                  type="button"
                  aria-current={i === chapterIdx ? "true" : undefined}
                  ref={i === chapterIdx ? (el) => el?.scrollIntoView({ block: "center" }) : undefined}
                  onClick={() => {
                    jumpTo(i);
                    setPanel(null);
                  }}
                  style={{ paddingLeft: `${0.75 + t.depth * 1}rem` }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg py-2 pr-3 text-left text-sm transition-colors hover:bg-muted",
                    i === chapterIdx ? "bg-secondary font-medium text-primary" : "text-foreground/80",
                  )}
                >
                  <span className="flex-1">{t.label}</span>
                  {i === chapterIdx && <span className="text-[10px] font-normal tracking-wide text-muted-foreground uppercase">Reading</span>}
                </button>
              ))}
            </nav>
          </aside>
        </>
      )}

      {/* typography panel */}
      {panel === "type" && (
        <>
          <div className="absolute inset-0 z-30" onClick={() => setPanel(null)} />
          <div className="absolute top-14 right-4 z-40 w-64 space-y-4 rounded-2xl border border-border bg-card p-4 shadow-xl sm:right-6">
            <Row label="Size">
              <Button variant="ghost" size="icon-sm" aria-label="Smaller text" onClick={() => updatePrefs({ fontSize: step(FONT_STEPS, prefs.fontSize, -1) })}>
                <Minus />
              </Button>
              <span className="w-10 text-center font-mono text-xs tabular-nums">{prefs.fontSize}%</span>
              <Button variant="ghost" size="icon-sm" aria-label="Larger text" onClick={() => updatePrefs({ fontSize: step(FONT_STEPS, prefs.fontSize, 1) })}>
                <Plus />
              </Button>
            </Row>
            <Row label="Spacing">
              <Button variant="ghost" size="icon-sm" aria-label="Tighter lines" onClick={() => updatePrefs({ lineHeight: step(LINE_STEPS, prefs.lineHeight, -1) })}>
                <Minus />
              </Button>
              <span className="w-10 text-center font-mono text-xs tabular-nums">{prefs.lineHeight.toFixed(2)}</span>
              <Button variant="ghost" size="icon-sm" aria-label="Looser lines" onClick={() => updatePrefs({ lineHeight: step(LINE_STEPS, prefs.lineHeight, 1) })}>
                <Plus />
              </Button>
            </Row>
            <Row label="Theme">
              <div className="flex rounded-full bg-secondary p-0.5">
                {(["light", "dark"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={prefs.theme === t}
                    aria-label={t === "light" ? "Parchment" : "Night"}
                    onClick={() => updatePrefs({ theme: t })}
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full transition-colors",
                      prefs.theme === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                    )}
                  >
                    {t === "light" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
                  </button>
                ))}
              </div>
            </Row>
            <Row label="Progress">
              <button
                type="button"
                role="switch"
                aria-checked={prefs.showProgress}
                aria-label="Show progress"
                onClick={() => updatePrefs({ showProgress: !prefs.showProgress })}
                className={cn(
                  "relative h-5 w-9 rounded-full transition-colors",
                  prefs.showProgress ? "bg-primary" : "bg-muted-foreground/30",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 left-0.5 size-4 rounded-full bg-card shadow transition-transform",
                    prefs.showProgress && "translate-x-4",
                  )}
                />
              </button>
            </Row>
          </div>
        </>
      )}

      {/* shortcuts */}
      {panel === "keys" && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-foreground/10" onClick={() => setPanel(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 font-serif text-lg">Shortcuts</h2>
            <dl className="space-y-2.5 text-sm">
              {SHORTCUTS.map(([k, d]) => (
                <div key={k} className="flex items-center justify-between gap-6">
                  <dt className="text-muted-foreground">{d}</dt>
                  <dd>
                    <kbd className="rounded-md border border-border bg-secondary px-2 py-0.5 font-mono text-xs whitespace-pre">{k}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}
