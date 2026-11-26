"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, CornerUpLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { IDLE_MS, type Panel } from "./config";
import type { Draft } from "./notes-panel";
import { ProgressFooter } from "./progress-footer";
import { TopBar } from "./top-bar";
import { useEpubReader, type BookSelection, type FrameEvents } from "./use-epub-reader";
import { useBookSearch } from "./use-book-search";
import { MiniPlayer } from "./mini-player";
import { useAudiobook } from "./use-audiobook";
import { useNotes } from "./use-notes";
import { useSync } from "./use-sync";
import { useReaderKeys } from "./use-reader-keys";

// Panels load the first time they're opened, not with the reader.
const ContentsPanel = dynamic(() => import("./contents-panel").then((m) => m.ContentsPanel));
const NoteCard = dynamic(() => import("./note-card").then((m) => m.NoteCard));
const NotesPanel = dynamic(() => import("./notes-panel").then((m) => m.NotesPanel));
const SettingsPanel = dynamic(() => import("./settings-panel").then((m) => m.SettingsPanel));
const ShortcutsDialog = dynamic(() => import("./shortcuts-dialog").then((m) => m.ShortcutsDialog));
const ListenPanel = dynamic(() => import("./listen-panel").then((m) => m.ListenPanel));
const SearchPanel = dynamic(() => import("./search-panel").then((m) => m.SearchPanel));

export function Reader() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const viewRef = useRef<HTMLDivElement>(null);
  const events = useRef<FrameEvents>({ key: () => {}, tap: () => {}, activity: () => {}, select: () => {} });
  const reader = useEpubReader(id, viewRef, events);
  const { meta, status, toc, chapterIdx, pagesLeft, percent, prefs, updatePrefs, next, prev, jumpTo, goTo, capture, highlight, unhighlight, flush } =
    reader;

  const [panel, setPanel] = useState<Panel | null>(null);
  const [chrome, setChrome] = useState(true);
  const panelRef = useRef(panel);
  useEffect(() => {
    panelRef.current = panel;
  }, [panel]);

  // ---- controls fade away while reading ---------------------------------
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scheduleHide = useCallback(() => {
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => !panelRef.current && setChrome(false), IDLE_MS);
  }, []);
  const poke = useCallback(() => {
    setChrome(true);
    scheduleHide();
  }, [scheduleHide]);
  useEffect(() => {
    if (status === "ready") scheduleHide();
    return () => clearTimeout(idleTimer.current);
  }, [status, scheduleHide]);
  useEffect(() => {
    window.addEventListener("mousemove", poke);
    return () => window.removeEventListener("mousemove", poke);
  }, [poke]);

  // ---- notes: opening the panel captures the selected passage (or the current page) ----
  // A passage selected in the book: offers a note card right beside it.
  const [selection, setSelection] = useState<BookSelection | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const selectionRef = useRef(selection);
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);
  const onSelect = useCallback((s: BookSelection | null) => {
    setSelection(s);
    if (!s) setCardOpen(false);
  }, []);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [focusNote, setFocusNote] = useState<string | null>(null);
  const togglePanel = useCallback(
    (p: Panel) => {
      if (p === "notes" && panelRef.current !== "notes") {
        setDraft(capture());
        setFocusNote(null);
      }
      setPanel((cur) => (cur === p ? null : p));
    },
    [capture],
  );
  const closePanel = useCallback(() => setPanel(null), []);
  // W with a passage selected writes beside it; otherwise it opens the Notes list.
  const { currentSelection } = reader;
  const keyToggle = useCallback(
    (p: Panel) => {
      if (p === "notes" && !panelRef.current) {
        const s = selectionRef.current ?? currentSelection();
        if (s) {
          setSelection(s);
          setCardOpen(true);
          return;
        }
      }
      togglePanel(p);
    },
    [togglePanel, currentSelection],
  );
  const openNote = useCallback(
    (id: string) => {
      setDraft(capture());
      setFocusNote(id);
      setPanel("notes");
    },
    [capture],
  );
  const notes = useNotes(id, reader, openNote);
  const audio = useAudiobook(id, meta);
  const sync = useSync(id, reader, audio);
  const search = useBookSearch(reader);

  // ---- pause the audiobook while writing a note; resume (a little earlier) on save or close ----
  const pausedForNote = useRef(false);
  const resumeAfterNote = useCallback(() => {
    if (!pausedForNote.current) return;
    pausedForNote.current = false;
    audio.seek(audio.time - 2);
    audio.play();
  }, [audio]);
  const writing = useRef(false); // a note is being written (panel or card)
  useEffect(() => {
    const was = writing.current;
    const now = panel === "notes" || cardOpen;
    writing.current = now;
    if (now && !was && prefs.pauseForNotes && audio.playing) {
      pausedForNote.current = true;
      audio.pause();
    }
    if (was && !now) resumeAfterNote();
  }, [panel, cardOpen, prefs.pauseForNotes, audio, resumeAfterNote]);

  const dropSelection = useCallback(() => {
    reader.clearSelection();
    setSelection(null);
    setCardOpen(false);
  }, [reader]);
  const openPanel = useCallback((p: Panel) => setPanel(p), []);
  // ---- search: remember where you were reading, so Esc can bring you back ----
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const returnRef = useRef(returnTo);
  useEffect(() => {
    returnRef.current = returnTo;
  }, [returnTo]);
  const { pageRange, restore } = reader;
  const leaveForSearch = useCallback(() => {
    if (!returnRef.current) {
      const here = pageRange()?.start ?? null;
      returnRef.current = here;
      setReturnTo(here);
    }
  }, [pageRange]);
  const goBack = useCallback(() => {
    const spot = returnRef.current;
    if (!spot) return false;
    returnRef.current = null;
    setReturnTo(null);
    restore(spot);
    return true;
  }, [restore]);
  // Search keeps the book's text only while it's open.
  const { release: releaseSearch } = search;
  useEffect(() => {
    if (panel !== "search") releaseSearch();
  }, [panel, releaseSearch]);

  const onEscape = useCallback(() => {
    goBack();
    setPanel(null);
  }, [goBack]);

  const frameKey = useReaderKeys(reader, keyToggle, onEscape, audio, openPanel);

  // Taps on the page: left edge goes back, right edge goes forward, middle shows/hides controls.
  const onTap = useCallback(
    (x: number) => {
      if (x < 0.3) prev();
      else if (x > 0.7) next();
      else if (chrome) setChrome(false);
      else poke();
    },
    [prev, next, chrome, poke],
  );

  useEffect(() => {
    events.current = { key: frameKey, tap: onTap, activity: poke, select: onSelect };
  }, [frameKey, onTap, poke, onSelect]);

  const showChrome = chrome || panel !== null || status !== "ready";
  const showMini = status === "ready" && !!audio.file && audio.started && panel !== "listen";

  return (
    <div
      data-reader-theme={prefs.theme}
      className="reader-surface fixed inset-0 z-10 flex touch-manipulation flex-col overscroll-none bg-background text-foreground transition-colors"
    >
      <TopBar
        title={meta?.title}
        visible={showChrome}
        panel={panel}
        playing={audio.playing}
        onToggle={togglePanel}
        onBack={() => {
          flush();
          router.push("/");
        }}
      />

      <div className="relative flex-1 px-[max(1.25rem,6vw)] pt-[calc(3.5rem+env(safe-area-inset-top))] pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
        <EdgeButton side="left" onClick={prev} />
        <div ref={viewRef} className="h-full w-full" />
        <EdgeButton side="right" onClick={next} />

        {status !== "ready" && (
          <div className="absolute inset-0 flex items-center justify-center px-6">
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

      {prefs.showProgress && status === "ready" && (
        <ProgressFooter
          chapter={toc[chapterIdx]?.label ?? null}
          pagesLeft={pagesLeft}
          percent={percent}
          className={showMini ? "max-sm:hidden" : undefined}
        />
      )}

      {showMini && <MiniPlayer audio={audio} dim={!showChrome} onOpen={() => togglePanel("listen")} />}

      {panel === "toc" && (
        <ContentsPanel
          toc={toc}
          current={chapterIdx}
          onClose={closePanel}
          onPick={(i) => {
            jumpTo(i);
            closePanel();
          }}
        />
      )}
      {panel === "search" && (
        <SearchPanel
          search={search}
          onClose={closePanel}
          onOpen={async (r) => {
            const cfi = await search.locate(r);
            if (!cfi) return;
            leaveForSearch();
            goTo(cfi);
            highlight(cfi, () => {}, "loam-find");
            setTimeout(() => unhighlight(cfi), 2500);
            if (!window.matchMedia("(min-width: 640px)").matches) closePanel();
          }}
          onOpenChapter={(i) => {
            leaveForSearch();
            jumpTo(i);
            if (!window.matchMedia("(min-width: 640px)").matches) closePanel();
          }}
        />
      )}
      {returnTo && status === "ready" && (
        <div className="absolute bottom-[calc(3.75rem+env(safe-area-inset-bottom))] left-1/2 z-40 flex -translate-x-1/2 items-center rounded-full border border-border bg-card shadow-lg">
          <button
            type="button"
            onClick={() => {
              goBack();
              closePanel();
            }}
            className="flex items-center gap-2 py-2 pr-2 pl-4 text-sm transition-colors hover:text-primary pointer-coarse:py-3"
          >
            <CornerUpLeft className="size-4 text-primary" />
            Back to where you were
            <kbd className="rounded border border-border bg-secondary px-1.5 font-mono text-[10px] text-muted-foreground pointer-coarse:hidden">Esc</kbd>
          </button>
          <button
            type="button"
            aria-label="Stay here"
            title="Stay here"
            onClick={() => setReturnTo(null)}
            className="mr-1 flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted pointer-coarse:size-10"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
      {selection && !panel && (
        <NoteCard
          selection={selection}
          open={cardOpen}
          chapter={toc[chapterIdx]?.label ?? null}
          onOpen={() => setCardOpen(true)}
          onClose={dropSelection}
          onSave={async (text) => {
            await notes.add({ cfi: selection.cfi, quote: selection.quote, chapter: toc[chapterIdx]?.label ?? null, text });
            dropSelection();
          }}
        />
      )}
      {panel === "notes" && (
        <NotesPanel
          notes={notes.notes}
          draft={draft}
          focusId={focusNote}
          onDropQuote={() => setDraft((d) => d && { ...d, quote: null, cfi: capture()?.cfi ?? d.cfi })}
          onAdd={async (text) => {
            if (!draft) return;
            const note = await notes.add({ ...draft, text });
            setFocusNote(note.id);
            setDraft(capture());
            resumeAfterNote();
          }}
          onEdit={notes.edit}
          onRemove={notes.remove}
          onJump={(n) => {
            goTo(n.cfi);
            setFocusNote(n.id);
            if (!window.matchMedia("(min-width: 640px)").matches) closePanel();
          }}
          onClose={closePanel}
        />
      )}
      {panel === "listen" && <ListenPanel audio={audio} sync={sync} onClose={closePanel} />}
      {panel === "type" && <SettingsPanel prefs={prefs} onChange={updatePrefs} onClose={closePanel} />}
      {panel === "keys" && <ShortcutsDialog onClose={closePanel} />}
    </div>
  );
}

/** Page-turn zones in the margins. On touch screens, tapping or swiping the text works too. */
function EdgeButton({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={side === "left" ? "Previous page" : "Next page"}
      onClick={onClick}
      className={cn("group absolute inset-y-0 z-10 flex w-[max(1.25rem,6vw)] items-center justify-center", side === "left" ? "left-0" : "right-0")}
    >
      <Icon className="size-5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-60" />
    </button>
  );
}
