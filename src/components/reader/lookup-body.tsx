"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, NotebookPen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { googleUrl, lookUp, type Lookup } from "@/lib/lookup";

/** The inside of the lookup card: a definition or a Wikipedia summary, with Google as a fallback. */
export function LookupBody({
  query,
  onSaveNote,
  onClose,
  onLinks,
}: {
  query: string;
  onSaveNote: (text: string) => Promise<void>;
  onClose: () => void;
  /** Where the W (Wikipedia/Wiktionary) and G (Google) shortcuts should go. */
  onLinks: (links: { source: string | null; google: string }) => void;
}) {
  const [result, setResult] = useState<Lookup | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    lookUp(query, ctrl.signal)
      .then(setResult)
      .catch(() => !ctrl.signal.aborted && setResult({ kind: "none" }));
    return () => ctrl.abort();
  }, [query]);

  const source = result?.kind === "wiki" || result?.kind === "definition" ? result.url : null;
  useEffect(() => onLinks({ source, google: googleUrl(query) }), [source, query, onLinks]);

  const noteText =
    result?.kind === "wiki"
      ? `${result.title}: ${firstSentences(result.extract, 2)}`
      : result?.kind === "definition"
        ? `${result.word} (${result.senses[0]?.pos}): ${result.senses[0]?.text}`
        : null;

  const link = (href: string, label: string, key: string) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5 text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
    >
      {label}
      <ArrowUpRight className="size-3" />
      <kbd className="ml-1 font-mono text-[10px] opacity-70 pointer-coarse:hidden">{key}</kbd>
    </a>
  );

  return (
    <div className="p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute top-2.5 right-2.5 z-10 rounded-full p-1 text-muted-foreground hover:bg-muted"
      >
        <X className="size-3.5" />
      </button>

      {!result && (
        <div className="space-y-2 py-1 pr-6" aria-busy="true">
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          <div className="h-3 w-full animate-pulse rounded bg-muted" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
        </div>
      )}

      {result?.kind === "wiki" && (
        <div className="flex gap-3">
          <div className="min-w-0 flex-1">
            <p className={cn("font-serif text-lg leading-tight", !result.thumb && "pr-6")}>{result.title}</p>
            {result.description && <p className="mt-0.5 text-xs text-muted-foreground">{result.description}</p>}
            <p className="mt-2 line-clamp-6 font-serif text-sm leading-relaxed text-foreground/85">{result.extract}</p>
          </div>
          {result.thumb && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={result.thumb} alt="" className="mr-6 h-20 w-16 shrink-0 rounded-md object-cover" />
          )}
        </div>
      )}

      {result?.kind === "definition" && (
        <div>
          <p className="pr-6 font-serif text-lg leading-tight">
            {result.word}
            {result.phonetic && <span className="ml-2 font-sans text-xs text-muted-foreground">{result.phonetic}</span>}
          </p>
          <ol className="mt-2 space-y-2">
            {result.senses.map((s, i) => (
              <li key={i} className="font-serif text-sm leading-relaxed text-foreground/85">
                <span className="mr-1.5 font-sans text-[11px] text-muted-foreground italic">{s.pos}</span>
                {s.text}
                {s.example && <span className="mt-0.5 block text-xs text-muted-foreground italic">“{s.example}”</span>}
              </li>
            ))}
          </ol>
        </div>
      )}

      {result?.kind === "none" && <p className="pr-6 font-serif text-sm text-muted-foreground italic">Nothing quick to show for “{query}”.</p>}

      {result && (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
          <span className="flex items-center gap-3">
            {result.kind === "wiki" && link(result.url, "Wikipedia", "W")}
            {result.kind === "definition" && link(result.url, "Wiktionary", "W")}
            {link(googleUrl(query), "Google", "G")}
          </span>
          {noteText && (
            <Button
              size="sm"
              variant="ghost"
              disabled={saved}
              onClick={async () => {
                await onSaveNote(noteText);
                setSaved(true);
              }}
              className="text-muted-foreground"
            >
              <NotebookPen /> {saved ? "Saved" : "Save as note"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function firstSentences(text: string, n: number) {
  const parts = text.match(/[^.!?]+[.!?]+(\s|$)/g);
  return parts ? parts.slice(0, n).join("").trim() : text;
}
