"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Headphones, MoreHorizontal, NotebookPen, Plus, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addEpub, listBooks, removeBook, shelfExtras, type Book } from "@/lib/library";
import { cn } from "@/lib/utils";

function Cover({ book, className }: { book: Book; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!book.cover) return;
    const u = URL.createObjectURL(book.cover);
    setUrl(u); // eslint-disable-line react-hooks/set-state-in-effect -- object URL lifecycle
    return () => URL.revokeObjectURL(u);
  }, [book.cover]);
  return (
    <div className={cn("shrink-0 overflow-hidden rounded-[3px] bg-secondary shadow-[0_1px_2px_oklch(0.3_0.04_55/0.25),0_6px_14px_-8px_oklch(0.3_0.04_55/0.4)]", className)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center p-1 text-center font-serif text-[9px] leading-tight text-muted-foreground">
          {book.title}
        </div>
      )}
    </div>
  );
}

export function Shelf() {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extras, setExtras] = useState<Awaited<ReturnType<typeof shelfExtras>>>({ notes: new Map(), audio: new Set() });
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const [b, x] = await Promise.all([listBooks(), shelfExtras()]);
    setBooks(b);
    setExtras(x);
  }, []);
  useEffect(() => {
    let live = true;
    Promise.all([listBooks(), shelfExtras()]).then(([b, x]) => {
      if (!live) return;
      setBooks(b);
      setExtras(x);
    });
    return () => {
      live = false;
    };
  }, []);

  const add = useCallback(
    async (files: FileList | File[]) => {
      const epubs = Array.from(files).filter((f) => /\.epub$/i.test(f.name) || f.type === "application/epub+zip");
      if (!epubs.length) return setError("Loam reads EPUB files for now.");
      setError(null);
      setBusy(true);
      try {
        for (const f of epubs) await addEpub(f);
      } catch (e) {
        console.error(e);
        setError("Couldn't read that file. Is it a valid EPUB?");
      } finally {
        setBusy(false);
        void refresh();
      }
    },
    [refresh],
  );

  useEffect(() => {
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      depth++;
      setDragging(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDragging(false);
      if (e.dataTransfer?.files.length) void add(e.dataTransfer.files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [add]);

  const empty = books !== null && books.length === 0;

  return (
    <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-16">
      <input
        ref={inputRef}
        type="file"
        accept=".epub,application/epub+zip"
        multiple
        className="sr-only"
        onChange={(e) => {
          if (e.target.files) void add(e.target.files);
          e.target.value = "";
        }}
      />

      <div
        className={cn(
          "pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm transition-opacity",
          dragging ? "opacity-100" : "opacity-0",
        )}
      >
        <p className="font-serif text-2xl">Place it on the shelf</p>
      </div>

      <header className="mb-8 flex items-center justify-between sm:mb-14">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Sprout className="size-4" />
          </span>
          <span className="font-serif text-2xl tracking-tight">Loam</span>
        </div>
        <div className="flex items-center gap-1">
          {!empty && books && (
            <Button variant="ghost" size="sm" className="text-muted-foreground pointer-coarse:h-11 pointer-coarse:px-3" onClick={() => inputRef.current?.click()} disabled={busy}>
              <Plus /> Add
            </Button>
          )}
        </div>
      </header>

      <main className="flex-1">
        {empty && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center gap-3 rounded-3xl border border-dashed border-border px-6 py-16 text-center sm:px-8 sm:py-24 transition-colors hover:border-primary/50 hover:bg-card/60"
          >
            <span className="font-serif text-2xl">{busy ? "Shelving…" : "Your shelf is empty"}</span>
            <span className="text-sm text-muted-foreground">
              <span className="pointer-coarse:hidden">Drop an EPUB here, or </span>
              <span className="text-primary underline underline-offset-4">
                <span className="pointer-coarse:hidden">choose one</span>
                <span className="hidden pointer-coarse:inline">Choose an EPUB</span>
              </span>
            </span>
          </button>
        )}

        {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

        {books && books.length > 0 && (
          <ul className="space-y-1">
            {books.map((b, i) => (
              <BookRow
                key={b.id}
                book={b}
                current={i === 0 && !!b.openedAt}
                notes={extras.notes.get(b.id) ?? 0}
                audio={extras.audio.has(b.id)}
                onRemove={async () => {
                  await removeBook(b.id);
                  void refresh();
                }}
              />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

/** "just now", "12m ago", "3h ago", "yesterday", "4 days ago", "Mar 3". */
function since(t: number) {
  const m = Math.round((Date.now() - t) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function BookRow({
  book: b,
  current,
  notes,
  audio,
  onRemove,
}: {
  book: Book;
  current: boolean;
  notes: number;
  audio: boolean;
  onRemove: () => Promise<void>;
}) {
  const [menu, setMenu] = useState<"closed" | "open" | "confirm">("closed");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (menu === "closed") return;
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setMenu("closed");
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu("closed");
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  const pct = b.progress?.percent;
  const details = [
    b.progress?.chapter,
    b.progress ? (pct != null ? `${Math.round(pct * 100)}%` : "Started") : "New",
    b.openedAt ? `read ${since(b.openedAt)}` : null,
  ].filter(Boolean);

  return (
    <li className="group relative">
      <Link
        href={`/read/${b.id}`}
        className="flex items-center gap-4 rounded-2xl py-3 pr-12 pl-2 transition-colors hover:bg-card/70 sm:gap-6 sm:px-3 sm:pr-14"
      >
        <Cover book={b} className="h-24 w-16 sm:h-[104px] sm:w-[70px]" />
        <div className="min-w-0 flex-1">
          {current && <p className="mb-0.5 text-[10px] font-medium tracking-[0.14em] text-primary uppercase">Continue</p>}
          <p className="truncate font-serif text-lg leading-snug">{b.title}</p>
          <p className="truncate text-sm text-muted-foreground">{b.author}</p>
          <div className="mt-2.5 flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span className="min-w-0 truncate">
              {details.map((d, i) => (
                <span key={i}>
                  {i > 0 && <span className="mx-1.5 opacity-50">·</span>}
                  <span className={i === 0 && b.progress?.chapter ? "font-serif italic" : "tabular-nums"}>{d}</span>
                </span>
              ))}
            </span>
            <span className="flex shrink-0 items-center gap-2.5">
              {audio && <Headphones aria-label="Audiobook attached" className="size-3.5" />}
              {notes > 0 && (
                <span className="flex items-center gap-1" aria-label={`${notes} ${notes === 1 ? "note" : "notes"}`}>
                  <NotebookPen className="size-3.5" />
                  <span className="tabular-nums">{notes}</span>
                </span>
              )}
            </span>
          </div>
          <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-border/70">
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(pct ?? 0) * 100}%` }} />
          </div>
        </div>
      </Link>

      <div ref={ref} className="absolute top-3 right-1 sm:right-3">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`More for ${b.title}`}
          aria-expanded={menu !== "closed"}
          onClick={() => setMenu(menu === "closed" ? "open" : "closed")}
          className={cn(
            "text-muted-foreground transition-opacity group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:size-11 pointer-coarse:opacity-70",
            menu === "closed" ? "opacity-0" : "opacity-100",
          )}
        >
          <MoreHorizontal />
        </Button>
        {menu !== "closed" && (
          <div className="absolute top-full right-0 z-20 mt-1 w-48 rounded-xl border border-border bg-card p-1 text-sm shadow-xl">
            {menu === "open" ? (
              <button
                type="button"
                onClick={() => setMenu("confirm")}
                className="w-full rounded-lg px-3 py-2 text-left text-destructive hover:bg-muted pointer-coarse:py-3"
              >
                Remove from shelf…
              </button>
            ) : (
              <div className="p-2">
                <p className="mb-2 text-xs text-muted-foreground">Remove this book with its notes and audiobook?</p>
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setMenu("closed")}>
                    Keep
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => void onRemove()}>
                    Remove
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
