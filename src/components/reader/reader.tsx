"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { IDLE_MS, type Panel } from "./config";
import { ContentsPanel } from "./contents-panel";
import { NotesPanel, type Draft } from "./notes-panel";
import { ProgressFooter } from "./progress-footer";
import { SettingsPanel } from "./settings-panel";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { TopBar } from "./top-bar";
import { useEpubReader, type FrameEvents } from "./use-epub-reader";
import { ListenPanel } from "./listen-panel";
import { SearchPanel } from "./search-panel";
import { useBookSearch } from "./use-book-search";
import { MiniPlayer } from "./mini-player";
import { useAudiobook } from "./use-audiobook";
import { useNotes } from "./use-notes";
import { useSync } from "./use-sync";
import { useReaderKeys } from "./use-reader-keys";

export function Reader() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const viewRef = useRef<HTMLDivElement>(null);
  const events = useRef<FrameEvents>({ key: () => {}, tap: () => {}, activity: () => {} });
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
  const openPanel = useCallback((p: Panel) => setPanel(p), []);
  const frameKey = useReaderKeys(reader, togglePanel, closePanel, audio, openPanel);

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
    events.current = { key: frameKey, tap: onTap, activity: poke };
  }, [frameKey, onTap, poke]);

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
          onJump={(r) => {
            goTo(r.cfi);
            highlight(r.cfi, () => {}, "loam-find");
            setTimeout(() => unhighlight(r.cfi), 2500);
            if (!window.matchMedia("(min-width: 640px)").matches) closePanel();
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
