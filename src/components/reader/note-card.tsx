"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { NotebookPen, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BookSelection } from "./use-epub-reader";
import { LookupBody } from "./lookup-body";

const GAP = 10;

/**
 * Write a note right next to the selected passage, without moving the page.
 * First a small "Note / Look up" button by the selection; W opens the note card, D the lookup card.
 */
export function NoteCard({
  selection,
  mode,
  chapter,
  onOpen,
  onLookup,
  onLinks,
  onSave,
  onClose,
}: {
  selection: BookSelection;
  mode: "pill" | "note" | "lookup";
  chapter: string | null;
  onOpen: () => void;
  /** Show a quick reference card for the selected text. */
  onLookup: () => void;
  onLinks: (links: { source: string | null; google: string }) => void;
  onSave: (text: string) => Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  // Re-place the card when its content grows (a lookup arriving).
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);
  const { rect } = selection;

  // Sit below the passage if there's room, otherwise above it; never cover the passage itself.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight;
    const w = el.offsetWidth;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const below = rect.bottom + GAP;
    const top = below + h <= vh - GAP ? below : Math.max(GAP, rect.top - GAP - h);
    const center = (rect.left + rect.right) / 2;
    const left = Math.min(Math.max(GAP, center - w / 2), vw - w - GAP);
    setPos({ top, left });
  }, [rect, mode, height]);

  const save = async () => {
    const t = text.trim();
    if (!t) return;
    await onSave(t);
    setText("");
  };

  const style = pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 };

  if (mode === "lookup") {
    return (
      <div
        ref={ref}
        style={style}
        role="dialog"
        aria-label="Look up"
        className="fixed z-40 w-[min(360px,calc(100vw-20px))] rounded-2xl border border-border bg-card shadow-xl max-sm:!top-auto max-sm:right-2.5 max-sm:bottom-[max(0.625rem,env(safe-area-inset-bottom))] max-sm:!left-2.5 max-sm:w-auto"
      >
        <LookupBody query={selection.quote} onSaveNote={onSave} onClose={onClose} onLinks={onLinks} />
      </div>
    );
  }

  if (mode === "pill") {
    return (
      <div ref={ref} style={style} className="fixed z-40 flex items-center rounded-full border border-border bg-card text-xs shadow-lg">
        {[
          { label: "Note", key: "W", icon: NotebookPen, onClick: onOpen },
          { label: "Look up", key: "D", icon: Search, onClick: onLookup },
        ].map(({ label, key, icon: Icon, onClick }, i) => (
          <button
            key={label}
            type="button"
            onMouseDown={(e) => e.preventDefault()} // keep the book's selection
            onClick={onClick}
            className={
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors hover:bg-secondary pointer-coarse:px-4 pointer-coarse:py-2.5" +
              (i ? " border-l border-border/70" : "")
            }
          >
            <Icon className="size-3.5 text-primary" /> {label}
            <kbd className="ml-0.5 font-mono text-[10px] text-muted-foreground pointer-coarse:hidden">{key}</kbd>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      style={style}
      role="dialog"
      aria-label="New note"
      className="fixed z-40 w-[min(320px,calc(100vw-20px))] rounded-2xl border border-border bg-card p-3 shadow-xl max-sm:!top-auto max-sm:right-2.5 max-sm:bottom-[max(0.625rem,env(safe-area-inset-bottom))] max-sm:!left-2.5 max-sm:w-auto"
    >
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void save();
          }
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
        rows={3}
        placeholder="What does this make you think?"
        className="block w-full resize-none bg-transparent font-serif text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/70"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-serif text-[11px] text-muted-foreground italic">{chapter}</span>
        <span className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onClose} className="text-muted-foreground pointer-coarse:h-10">
            Cancel
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={!text.trim()} className="pointer-coarse:h-10 pointer-coarse:px-4">
            Save
          </Button>
        </span>
      </div>
    </div>
  );
}
