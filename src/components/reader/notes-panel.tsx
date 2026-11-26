"use client";

import { useEffect, useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Note } from "@/lib/notes";
import { cn } from "@/lib/utils";
import { Sheet } from "./sheet";

export type Draft = { cfi: string; quote: string | null; chapter: string | null };

const touch = "pointer-coarse:size-11";

export function NotesPanel({
  notes,
  draft,
  focusId,
  onDropQuote,
  onAdd,
  onEdit,
  onRemove,
  onJump,
  onClose,
}: {
  notes: Note[];
  draft: Draft | null;
  focusId: string | null;
  onDropQuote: () => void;
  onAdd: (text: string) => Promise<void>;
  onEdit: (note: Note, text: string) => Promise<void>;
  onRemove: (note: Note) => Promise<void>;
  onJump: (note: Note) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const save = async () => {
    const t = text.trim();
    if (!t || !draft) return;
    await onAdd(t);
    setText("");
  };

  return (
    <Sheet title="Notes" variant="side" onClose={onClose}>
      <div className="border-b border-border px-5 pb-4">
        {draft?.quote && (
          <figure className="relative mb-3 rounded-lg bg-secondary/60 py-2 pr-9 pl-3">
            <blockquote className="line-clamp-4 border-l-2 border-primary/50 pl-3 font-serif text-sm text-foreground/80 italic">
              {draft.quote}
            </blockquote>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Don't quote this passage"
              onClick={onDropQuote}
              className="absolute top-1.5 right-1.5 text-muted-foreground pointer-coarse:size-9"
            >
              <X />
            </Button>
          </figure>
        )}
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void save();
            }
          }}
          rows={3}
          placeholder={draft?.quote ? "What does this make you think?" : "Write a note…"}
          className="block w-full resize-none rounded-lg border border-border bg-background/60 px-3 py-2 font-serif text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/70 focus:border-primary/50"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="truncate text-[11px] text-muted-foreground">
            {draft?.chapter && <span className="font-serif italic">{draft.chapter}</span>}
            <span className="pointer-coarse:hidden">{draft?.chapter && " · "}Enter to save, Shift+Enter for a new line</span>
          </span>
          <Button size="sm" onClick={() => void save()} disabled={!text.trim()} className="shrink-0 pointer-coarse:h-10 pointer-coarse:px-4">
            Save
          </Button>
        </div>
      </div>

      <ul className="flex-1 overflow-y-auto overscroll-contain px-2 py-2">
        {notes.length === 0 && (
          <li className="px-3 py-8 text-center font-serif text-sm text-muted-foreground italic">No notes in this book yet.</li>
        )}
        {notes.map((n) => (
          <NoteItem key={n.id} note={n} focused={n.id === focusId} onEdit={onEdit} onRemove={onRemove} onJump={onJump} />
        ))}
      </ul>
    </Sheet>
  );
}

function NoteItem({
  note,
  focused,
  onEdit,
  onRemove,
  onJump,
}: {
  note: Note;
  focused: boolean;
  onEdit: (note: Note, text: string) => Promise<void>;
  onRemove: (note: Note) => Promise<void>;
  onJump: (note: Note) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [text, setText] = useState(note.text);
  const [el, setEl] = useState<HTMLLIElement | null>(null);
  useEffect(() => {
    if (focused) el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focused, el]);

  const save = async () => {
    const t = text.trim();
    if (t && t !== note.text) await onEdit(note, t);
    setEditing(false);
  };

  return (
    <li ref={setEl} className={cn("group relative rounded-xl transition-colors", focused && "bg-secondary/70")}>
      {editing ? (
        <div className="px-3 py-3">
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
                setText(note.text);
                setEditing(false);
              }
            }}
            rows={3}
            className="block w-full resize-none rounded-lg border border-border bg-background/60 px-3 py-2 font-serif text-[15px] leading-relaxed outline-none focus:border-primary/50"
          />
          <div className="mt-2 flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={() => {
                setText(note.text);
                setEditing(false);
              }}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void save()}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => onJump(note)} className="block w-full rounded-xl px-3 py-3 pr-20 text-left hover:bg-muted/60">
          {note.chapter && <p className="mb-1 truncate text-[10px] tracking-wide text-muted-foreground uppercase">{note.chapter}</p>}
          {note.quote && (
            <blockquote className="mb-1.5 line-clamp-3 border-l-2 border-primary/40 pl-3 font-serif text-sm text-foreground/70 italic">
              {note.quote}
            </blockquote>
          )}
          <p className="font-serif text-[15px] leading-relaxed whitespace-pre-wrap">{note.text}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {new Date(note.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          </p>
        </button>
      )}

      {!editing && (
        <div className="absolute top-2 right-2 flex items-center gap-0.5">
          {confirming ? (
            <div className="flex items-center gap-1 rounded-full bg-card px-1 py-0.5 text-xs shadow-sm">
              <Button size="sm" variant="destructive" onClick={() => void onRemove(note)}>
                Delete
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                Keep
              </Button>
            </div>
          ) : (
            <div className="flex opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-60">
              <Button variant="ghost" size="icon-sm" aria-label="Edit note" className={touch} onClick={() => setEditing(true)}>
                <Pencil />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Delete note" className={touch} onClick={() => setConfirming(true)}>
                <Trash2 />
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
