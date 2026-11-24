"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, List, Minus, Moon, Plus, Sun, X } from "lucide-react";
import type { Book as EpubBook, Contents, Location, NavItem, Rendition } from "epubjs";
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
  type ReaderPrefs,
} from "@/lib/library";
import { cn } from "@/lib/utils";

const INK = { light: "#3a2e24", dark: "#e6dccb" } as const;
const FONT_STEPS = [85, 95, 105, 115, 125, 140, 160];
const LINE_STEPS = [1.4, 1.55, 1.65, 1.8, 2];
const IDLE_MS = 2200;

type Flat = { label: string; href: string; depth: number };
function flatten(items: NavItem[], depth = 0): Flat[] {
  return items.flatMap((i) => [{ label: i.label.trim(), href: i.href, depth }, ...flatten(i.subitems ?? [], depth + 1)]);
}
const stripHash = (h: string) => h.split("#")[0];

function step<T>(arr: readonly T[], cur: T, dir: 1 | -1): T {
  const i = arr.indexOf(cur);
  const base = i === -1 ? arr.findIndex((v) => v > cur) : i;
  return arr[Math.max(0, Math.min(arr.length - 1, (base === -1 ? arr.length - 1 : base) + dir))];
}

export function Reader() {
  const { id } = useParams<{ id: string }>();
  const viewRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<EpubBook | null>(null);
  const rendRef = useRef<Rendition | null>(null);
  const spineLabels = useRef<Map<number, string>>(new Map());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [meta, setMeta] = useState<Book | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [toc, setToc] = useState<Flat[]>([]);
  const [chapter, setChapter] = useState<string | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [prefs, setPrefs] = useState<ReaderPrefs>(loadPrefs);
  const [panel, setPanel] = useState<"toc" | "type" | null>(null);
  const [chrome, setChrome] = useState(true);

  const prefsRef = useRef(prefs);
  const panelRef = useRef(panel);
  useEffect(() => {
    prefsRef.current = prefs;
    panelRef.current = panel;
  }, [prefs, panel]);

  // ---- chrome visibility -------------------------------------------------
  const poke = useCallback(() => {
    setChrome(true);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      if (!panelRef.current) setChrome(false);
    }, IDLE_MS);
  }, []);

  // ---- navigation --------------------------------------------------------
  const next = useCallback(() => void rendRef.current?.next(), []);
  const prev = useCallback(() => void rendRef.current?.prev(), []);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || (e.key === " " && !e.shiftKey)) {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp" || (e.key === " " && e.shiftKey)) {
        e.preventDefault();
        prev();
      } else if (e.key === "Escape") {
        setPanel(null);
      }
    },
    [next, prev],
  );

  // ---- apply typography + theme into the iframe --------------------------
  const applyPrefs = useCallback((r: Rendition, p: ReaderPrefs) => {
    r.themes.fontSize(`${p.fontSize}%`);
    r.themes.override("line-height", String(p.lineHeight), true);
    r.themes.override("color", INK[p.theme], true);
  }, []);

  // ---- load book ---------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    let cleanupKeys: (() => void) | undefined;

    (async () => {
      const [record, file] = await Promise.all([getBook(id), getBookFile(id)]);
      if (cancelled) return;
      if (!record || !file) return setStatus("missing");
      setMeta(record);

      const { default: ePub } = await import("epubjs");
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

      rendition.hooks.content.register((contents: Contents) => {
        contents.addStylesheet(`${window.location.origin}/fonts/literata.css`);
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
      if (cancelled) return;
      const flat = flatten(nav.toc);
      setToc(flat);
      await book.ready;
      for (const item of flat) {
        const s = book.spine.get(stripHash(item.href));
        if (s && !spineLabels.current.has(s.index)) spineLabels.current.set(s.index, item.label);
      }

      const labelFor = (href: string) => {
        const s = book.spine.get(stripHash(href));
        if (!s) return null;
        for (let i = s.index; i >= 0; i--) {
          const l = spineLabels.current.get(i);
          if (l) return l;
        }
        return null;
      };

      rendition.on("relocated", (loc: Location) => {
        const cfi = loc.start.cfi;
        const pct = book.locations.length() ? book.locations.percentageFromCfi(cfi) : null;
        const ch = labelFor(loc.start.href);
        setChapter(ch);
        setPercent(pct);
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => void saveProgress(id, { cfi, percent: pct, chapter: ch }), 400);
      });

      // events from inside the iframe
      rendition.on("keydown", onKey);
      rendition.on("mousemove", poke);
      let touchX: number | null = null;
      rendition.on("touchstart", (e: TouchEvent) => (touchX = e.changedTouches[0]?.screenX ?? null));
      rendition.on("touchend", (e: TouchEvent) => {
        if (touchX === null) return;
        const dx = (e.changedTouches[0]?.screenX ?? touchX) - touchX;
        touchX = null;
        if (Math.abs(dx) > 40) (dx < 0 ? next : prev)();
      });

      window.addEventListener("keydown", onKey);
      cleanupKeys = () => window.removeEventListener("keydown", onKey);

      await rendition.display(record.progress?.cfi || undefined);
      if (cancelled) return;
      setStatus("ready");
      poke();

      // Percentages need a location index; cache it so it's computed once per book.
      const cached = await getLocations(id);
      if (cached) book.locations.load(cached);
      else {
        await book.locations.generate(1600);
        void saveLocations(id, book.locations.save());
      }
      if (cancelled) return;
      const cur = rendition.location?.start?.cfi;
      if (cur) setPercent(book.locations.percentageFromCfi(cur));
    })().catch((err) => {
      console.error("[reader]", err);
      if (!cancelled) setStatus("error");
    });

    return () => {
      cancelled = true;
      cleanupKeys?.();
      clearTimeout(saveTimer.current);
      clearTimeout(idleTimer.current);
      rendRef.current?.destroy();
      bookRef.current?.destroy();
      rendRef.current = null;
      bookRef.current = null;
    };
  }, [id, applyPrefs, onKey, poke, next, prev]);

  // ---- prefs changes -----------------------------------------------------
  const updatePrefs = useCallback(
    (patch: Partial<ReaderPrefs>) => {
      const p = { ...prefsRef.current, ...patch };
      setPrefs(p);
      savePrefs(p);
      const r = rendRef.current;
      if (!r) return;
      const cfi = r.location?.start?.cfi;
      applyPrefs(r, p);
      if (cfi && (patch.fontSize || patch.lineHeight)) void r.display(cfi);
    },
    [applyPrefs],
  );

  useEffect(() => {
    window.addEventListener("mousemove", poke);
    return () => window.removeEventListener("mousemove", poke);
  }, [poke]);

  const showChrome = chrome || panel !== null || status !== "ready";

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
        <Button variant="ghost" size="sm" className="text-muted-foreground" nativeButton={false} render={<Link href="/" />}>
          <ArrowLeft /> Shelf
        </Button>
        <p className="hidden max-w-[50%] truncate font-serif text-sm text-muted-foreground italic sm:block">{meta?.title}</p>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Contents"
            className={cn("text-muted-foreground", panel === "toc" && "bg-muted text-foreground")}
            onClick={() => setPanel((p) => (p === "toc" ? null : "toc"))}
          >
            <List />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Text settings"
            className={cn("font-serif text-base text-muted-foreground", panel === "type" && "bg-muted text-foreground")}
            onClick={() => setPanel((p) => (p === "type" ? null : "type"))}
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
      <footer
        className={cn(
          "absolute inset-x-0 bottom-0 z-20 px-[max(1.5rem,6vw)] pb-4 transition-opacity duration-500",
          status === "ready" ? "opacity-100" : "opacity-0",
        )}
      >
        <div className={cn("mb-2 flex justify-between text-[11px] text-muted-foreground transition-opacity duration-500", showChrome ? "opacity-100" : "opacity-0")}>
          <span className="truncate pr-4">{chapter}</span>
          <span className="font-mono tabular-nums">{percent != null ? `${Math.round(percent * 100)}%` : ""}</span>
        </div>
        <div className="h-px bg-border">
          <div className="h-px bg-primary/70 transition-[width] duration-300" style={{ width: `${(percent ?? 0) * 100}%` }} />
        </div>
      </footer>

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
                  onClick={() => {
                    void rendRef.current?.display(t.href);
                    setPanel(null);
                  }}
                  style={{ paddingLeft: `${0.75 + t.depth * 1}rem` }}
                  className={cn(
                    "block w-full rounded-lg py-2 pr-3 text-left text-sm transition-colors hover:bg-muted",
                    t.label === chapter ? "font-medium text-primary" : "text-foreground/80",
                  )}
                >
                  {t.label}
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
          </div>
        </>
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
