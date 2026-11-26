"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet } from "./sheet";
import { normalizeQuery, type BookSearch, type SearchResult } from "./use-book-search";

type Group = { chapterIdx: number; chapter: string; items: { r: SearchResult; i: number }[] };

export function SearchPanel({
  search,
  onOpen,
  onOpenChapter,
  onClose,
}: {
  search: BookSearch;
  /** Show a result in the book. */
  onOpen: (r: SearchResult) => void;
  /** Go to the start of a chapter. */
  onOpenChapter: (idx: number) => void;
  onClose: () => void;
}) {
  const { query, setQuery, results, busy, truncated } = search;
  const [active, setActive] = useState(-1);
  const searching = normalizeQuery(query).length >= 2;

  const groups: Group[] = [];
  results.forEach((r, i) => {
    const last = groups.at(-1);
    if (last && last.chapterIdx === r.chapterIdx) last.items.push({ r, i });
    else groups.push({ chapterIdx: r.chapterIdx, chapter: r.chapter ?? "Front matter", items: [{ r, i }] });
  });

  const move = (d: 1 | -1) => {
    if (!results.length) return;
    setActive((a) => (a < 0 ? (d === 1 ? 0 : results.length - 1) : (a + d + results.length) % results.length));
  };
  const open = (i: number) => {
    const r = results[i];
    if (!r) return;
    setActive(i);
    onOpen(r);
  };

  const summary = !searching
    ? null
    : busy
      ? "Searching…"
      : results.length === 0
        ? "No matches"
        : `${results.length}${truncated ? "+" : ""} ${results.length === 1 ? "match" : "matches"} in ${groups.length} ${
            groups.length === 1 ? "chapter" : "chapters"
          }`;

  return (
    <Sheet title="Search" variant="side" onClose={onClose}>
      <div className="border-b border-border px-5 pb-3">
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
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                move(e.key === "ArrowDown" ? 1 : -1);
              } else if (e.key === "Enter") {
                e.preventDefault();
                open(Math.max(0, active));
              } else if (e.key === "Escape") {
                e.preventDefault(); // keep the query; the reader handles Esc (back to where you were)
              }
            }}
            placeholder="Find a word or phrase"
            aria-label="Search this book"
            className="h-10 w-full bg-transparent font-serif text-[15px] outline-none placeholder:text-muted-foreground/70 [&::-webkit-search-cancel-button]:hidden pointer-coarse:h-11"
          />
        </div>
        <div className="mt-2 flex h-4 items-center justify-between gap-2 text-[11px] text-muted-foreground" aria-live="polite">
          <span>{summary}</span>
          {searching && results.length > 0 && <span className="pointer-coarse:hidden">↑↓ to browse · Enter to open</span>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain pb-4">
        {groups.map((g) => (
          <section key={`${g.chapterIdx}-${g.items[0].i}`}>
            <button
              type="button"
              disabled={g.chapterIdx < 0}
              onClick={() => onOpenChapter(g.chapterIdx)}
              title={g.chapterIdx >= 0 ? "Go to the start of this chapter" : undefined}
              className="sticky top-0 z-10 flex w-full items-baseline justify-between gap-3 border-b border-border/60 bg-card/95 px-5 pt-4 pb-2 text-left backdrop-blur enabled:hover:text-primary"
            >
              <span className="truncate font-serif text-[15px] font-medium">{g.chapter}</span>
              <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px] text-muted-foreground tabular-nums">
                {g.items.length}
              </span>
            </button>
            <ul className="py-1">
              {g.items.map(({ r, i }) => (
                <li key={i}>
                  <button
                    type="button"
                    aria-current={i === active ? "true" : undefined}
                    ref={i === active ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                    onClick={() => open(i)}
                    className={cn(
                      "flex w-full gap-3 border-l-2 py-2.5 pr-5 pl-[1.125rem] text-left transition-colors hover:bg-muted/60 pointer-coarse:py-3",
                      i === active ? "border-primary bg-secondary/70" : "border-transparent",
                    )}
                  >
                    <span className="flex-1 font-serif text-sm leading-relaxed text-foreground/70">
                      {r.before}
                      <mark className="bg-transparent font-semibold text-primary underline decoration-primary/40 underline-offset-[3px]">
                        {r.match}
                      </mark>
                      {r.after}
                    </span>
                    {r.fraction != null && (
                      <span className="shrink-0 pt-0.5 font-mono text-[10px] text-muted-foreground tabular-nums">
                        {Math.round(r.fraction * 100)}%
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Sheet>
  );
}
