"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { IDLE_MS, type Panel } from "./config";
import { ContentsPanel } from "./contents-panel";
import { ProgressFooter } from "./progress-footer";
import { SettingsPanel } from "./settings-panel";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { TopBar } from "./top-bar";
import { useEpubReader, type FrameEvents } from "./use-epub-reader";
import { useReaderKeys } from "./use-reader-keys";

export function Reader() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const viewRef = useRef<HTMLDivElement>(null);
  const events = useRef<FrameEvents>({ key: () => {}, tap: () => {}, activity: () => {} });
  const reader = useEpubReader(id, viewRef, events);
  const { meta, status, toc, chapterIdx, pagesLeft, percent, prefs, updatePrefs, next, prev, jumpTo, flush } = reader;

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

  const togglePanel = useCallback((p: Panel) => setPanel((cur) => (cur === p ? null : p)), []);
  const closePanel = useCallback(() => setPanel(null), []);
  const frameKey = useReaderKeys(reader, togglePanel, closePanel);

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

  return (
    <div
      data-reader-theme={prefs.theme}
      className="reader-surface fixed inset-0 z-10 flex touch-manipulation flex-col overscroll-none bg-background text-foreground transition-colors"
    >
      <TopBar
        title={meta?.title}
        visible={showChrome}
        panel={panel}
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
        <ProgressFooter chapter={toc[chapterIdx]?.label ?? null} pagesLeft={pagesLeft} percent={percent} />
      )}

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
