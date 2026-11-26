"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet } from "./sheet";
import { normalizeQuery, type BookSearch, type SearchResult } from "./use-book-search";

export function SearchPanel({
  search,
  onJump,
  onClose,
}: {
  search: BookSearch;
  onJump: (r: SearchResult) => void;
  onClose: () => void;
}) {
  const { query, setQuery, results, busy, truncated } = search;
  const [active, setActive] = useState(-1);
  const searching = normalizeQuery(query).length >= 2;

  const go = (i: number) => {
    if (!results.length) return;
    const n = (i + results.length) % results.length;
    setActive(n);
    onJump(results[n]);
  };

  // Group consecutive results under their chapter.
  const groups: { chapter: string | null; items: { r: SearchResult; i: number }[] }[] = [];
  results.forEach((r, i) => {
    const last = groups.at(-1);
    if (last && last.chapter === r.chapter) last.items.push({ r, i });
    else groups.push({ chapter: r.chapter, items: [{ r, i }] });
  });

  return (
    <Sheet title="Search" variant="side" onClose={onClose}>
      <div className="border-b border-border px-5 pb-4">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background/60 px-3 focus-within:border-primary/50">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(-1);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                go(e.shiftKey ? active - 1 : active + 1);
              }
            }}
            placeholder="Find a word or phrase"
            aria-label="Search this book"
            className="h-10 w-full bg-transparent font-serif text-[15px] outline-none placeholder:text-muted-foreground/70 pointer-coarse:h-11"
          />
        </div>
        <p className="mt-2 h-4 text-[11px] text-muted-foreground" aria-live="polite">
          {!searching
            ? null
            : busy
              ? "Searching…"
              : results.length === 0
                ? "No matches"
                : `${active >= 0 ? `${active + 1} of ` : ""}${results.length}${truncated ? "+" : ""} ${results.length === 1 ? "match" : "matches"}`}
          {searching && results.length > 1 && (
            <span className="pointer-coarse:hidden"> · Enter for next, Shift+Enter for previous</span>
          )}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-2 py-2">
        {groups.map((g, gi) => (
          <section key={gi} className="mb-2">
            {g.chapter && (
              <h3 className="sticky top-0 bg-card px-3 py-1.5 text-[10px] tracking-wide text-muted-foreground uppercase">{g.chapter}</h3>
            )}
            {g.items.map(({ r, i }) => (
              <button
                key={i}
                type="button"
                aria-current={i === active ? "true" : undefined}
                ref={i === active ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                onClick={() => go(i)}
                className={cn(
                  "block w-full rounded-lg px-3 py-2 text-left font-serif text-sm leading-relaxed transition-colors hover:bg-muted pointer-coarse:py-3",
                  i === active ? "bg-secondary" : "text-foreground/80",
                )}
              >
                {r.before.length >= 48 && "…"}
                {r.before}
                <mark className="rounded-sm bg-primary/20 px-0.5 font-semibold text-foreground">{r.match}</mark>
                {r.after}
                {r.after.length >= 48 && "…"}
              </button>
            ))}
          </section>
        ))}
      </div>
    </Sheet>
  );
}
