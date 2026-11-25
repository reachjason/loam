"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus, Sprout, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addEpub, listBooks, removeBook, type Book } from "@/lib/library";
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
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => setBooks(await listBooks()), []);
  useEffect(() => {
    let live = true;
    listBooks().then((b) => live && setBooks(b));
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
            {books.map((b) => {
              const pct = b.progress?.percent;
              return (
                <li key={b.id} className="group relative">
                  <Link
                    href={`/read/${b.id}`}
                    className="flex items-center gap-4 rounded-2xl py-3 pr-12 pl-2 transition-colors hover:bg-card/70 sm:gap-5 sm:px-3"
                  >
                    <Cover book={b} className="h-[72px] w-12" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-serif text-lg leading-snug">{b.title}</p>
                      <p className="truncate text-sm text-muted-foreground">{b.author}</p>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="h-px max-w-40 flex-1 bg-border">
                          <div className="h-px bg-primary" style={{ width: `${(pct ?? 0) * 100}%` }} />
                        </div>
                        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                          {b.progress ? (pct != null ? `${Math.round(pct * 100)}%` : "Started") : "New"}
                        </span>
                      </div>
                      {b.progress?.chapter && (
                        <p className="mt-1 truncate font-serif text-xs text-muted-foreground italic">{b.progress.chapter}</p>
                      )}
                    </div>
                  </Link>
                  <div className="absolute top-1/2 right-1 -translate-y-1/2 sm:right-3">
                    {confirmId === b.id ? (
                      <div className="flex items-center gap-1 rounded-full bg-card px-1 py-0.5 text-xs shadow-sm">
                        <span className="px-2 text-muted-foreground">Remove?</span>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={async () => {
                            await removeBook(b.id);
                            setConfirmId(null);
                            void refresh();
                          }}
                        >
                          Remove
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>
                          Keep
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Remove ${b.title}`}
                        onClick={() => setConfirmId(b.id)}
                        className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:size-11 pointer-coarse:opacity-60"
                      >
                        <X />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
