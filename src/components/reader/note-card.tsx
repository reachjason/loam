"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BookSelection } from "./use-epub-reader";

const GAP = 10;

/**
 * Write a note right next to the selected passage, without moving the page.
 * First a small "Note" button by the selection; pressing it (or W) opens the card.
 */
export function NoteCard({
  selection,
  open,
  chapter,
  onOpen,
  onSave,
  onClose,
}: {
  selection: BookSelection;
  open: boolean;
  chapter: string | null;
  onOpen: () => void;
  onSave: (text: string) => Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
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
  }, [rect, open]);

  const save = async () => {
    const t = text.trim();
    if (!t) return;
    await onSave(t);
    setText("");
  };

  const style = pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 };

  if (!open) {
    return (
      <div ref={ref} style={style} className="fixed z-40">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()} // keep the book's selection
          onClick={onOpen}
          className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs shadow-lg transition-colors hover:bg-secondary pointer-coarse:px-4 pointer-coarse:py-2.5"
        >
          <NotebookPen className="size-3.5 text-primary" /> Note
          <kbd className="ml-1 font-mono text-[10px] text-muted-foreground pointer-coarse:hidden">W</kbd>
        </button>
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
