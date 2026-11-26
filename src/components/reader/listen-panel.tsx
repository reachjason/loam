"use client";

import { useRef, useState } from "react";
import { BookOpen, Link2, Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SPEEDS } from "@/lib/audio";
import { cn } from "@/lib/utils";
import { Sheet } from "./sheet";
import type { Audiobook } from "./use-audiobook";
import type { Sync } from "./use-sync";

export function formatTime(s: number) {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

export function ListenPanel({ audio, sync, onClose }: { audio: Audiobook; sync: Sync; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState(false);
  const { file, chapters, chapterIdx, playing, time, duration, rate, error } = audio;

  const picker = (
    <input
      ref={inputRef}
      type="file"
      accept=".m4b,.m4a,.mp3,audio/*"
      className="sr-only"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) void audio.attach(f);
        e.target.value = "";
      }}
    />
  );

  return (
    <Sheet title="Listen" variant="side" onClose={onClose}>
      {picker}
      {file === undefined ? null : file === null ? (
        <div className="px-5 pb-8">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-6 py-12 text-center transition-colors hover:border-primary/50 hover:bg-muted/40"
          >
            <span className="font-serif text-lg">Add the audiobook</span>
            <span className="text-sm text-muted-foreground">An .m4b file (or .m4a / .mp3). It stays with this book.</span>
          </button>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </div>
      ) : (
        <>
          <div className="border-b border-border px-5 pb-5">
            <p className="truncate font-serif text-base italic" title={chapters[chapterIdx]?.title ?? file.name}>
              {chapters[chapterIdx]?.title ?? file.name.replace(/\.[^.]+$/, "")}
            </p>

            <input
              type="range"
              aria-label="Seek"
              min={0}
              max={duration || 0}
              step={1}
              value={Math.min(time, duration || 0)}
              onChange={(e) => audio.seek(Number(e.target.value))}
              className="mt-4 h-6 w-full cursor-pointer accent-primary"
            />
            <div className="flex justify-between font-mono text-[11px] text-muted-foreground tabular-nums">
              <span>{formatTime(time)}</span>
              <span>−{formatTime(duration - time)}</span>
            </div>

            <div className="mt-3 flex items-center justify-center gap-2">
              {chapters.length > 1 && (
                <Button variant="ghost" size="icon" aria-label="Previous chapter" className="pointer-coarse:size-11" onClick={() => audio.goChapter(-1)}>
                  <SkipBack />
                </Button>
              )}
              <Button variant="ghost" size="icon-lg" aria-label="Back 15 seconds" className="relative pointer-coarse:size-12" onClick={() => audio.skip(-15)}>
                <RotateCcw className="size-5" />
                <span className="absolute text-[8px] font-semibold">15</span>
              </Button>
              <Button size="icon-lg" aria-label={playing ? "Pause" : "Play"} className="size-14 rounded-full" onClick={audio.toggle}>
                {playing ? <Pause className="size-6" /> : <Play className="ml-0.5 size-6" />}
              </Button>
              <Button variant="ghost" size="icon-lg" aria-label="Forward 30 seconds" className="relative pointer-coarse:size-12" onClick={() => audio.skip(30)}>
                <RotateCw className="size-5" />
                <span className="absolute text-[8px] font-semibold">30</span>
              </Button>
              {chapters.length > 1 && (
                <Button variant="ghost" size="icon" aria-label="Next chapter" className="pointer-coarse:size-11" onClick={() => audio.goChapter(1)}>
                  <SkipForward />
                </Button>
              )}
            </div>

            <div className="mt-4 flex flex-wrap justify-center gap-1">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={rate === s}
                  onClick={() => audio.setRate(s)}
                  className={cn(
                    "rounded-full px-2.5 py-1 font-mono text-[11px] tabular-nums transition-colors pointer-coarse:px-3 pointer-coarse:py-2",
                    rate === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {s}×
                </button>
              ))}
            </div>
            {error && <p className="mt-3 text-center text-sm text-destructive">{error}</p>}
          </div>

          <SyncSection sync={sync} onJumped={() => !window.matchMedia("(min-width: 640px)").matches && onClose()} />

          <ol className="min-h-24 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
            {chapters.map((c, i) => (
              <li key={`${c.start}-${i}`}>
                <button
                  type="button"
                  aria-current={i === chapterIdx ? "true" : undefined}
                  ref={i === chapterIdx ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                  onClick={() => audio.seek(c.start)}
                  className={cn(
                    "flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted pointer-coarse:min-h-12",
                    i === chapterIdx ? "bg-secondary font-medium text-primary" : "text-foreground/80",
                  )}
                >
                  <span className="flex-1">{c.title}</span>
                  <span className="font-mono text-[11px] font-normal text-muted-foreground tabular-nums">{formatTime(c.start)}</span>
                </button>
              </li>
            ))}
          </ol>

          <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3 text-xs text-muted-foreground">
            <span className="min-w-0 truncate">{file.name}</span>
            {confirm ? (
              <span className="flex shrink-0 items-center gap-1">
                <Button size="sm" variant="destructive" onClick={() => void audio.detach().then(() => setConfirm(false))}>
                  Remove
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                  Keep
                </Button>
              </span>
            ) : (
              <span className="flex shrink-0 items-center gap-1">
                <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => inputRef.current?.click()}>
                  Replace
                </Button>
                <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setConfirm(true)}>
                  Remove
                </Button>
              </span>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}

/** On phones the tab covers the page, so it closes after a jump to show where you landed. */
function SyncSection({ sync, onJumped }: { sync: Sync; onJumped: () => void }) {
  const [confirmClear, setConfirmClear] = useState(false);
  const off = !sync.ready;
  const action =
    "flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-2 text-xs transition-colors hover:bg-muted disabled:opacity-50 pointer-coarse:min-h-11";
  return (
    <div className="space-y-3 border-b border-border px-5 py-4">
      <div className="flex gap-2">
        <button type="button" disabled={off} onClick={() => {
            sync.showInBook();
            onJumped();
          }} className={action}>
          <BookOpen className="size-3.5" /> Show in book
        </button>
        <button type="button" disabled={off} onClick={sync.listenFromPage} className={action}>
          <Play className="size-3.5" /> Listen from this page
        </button>
      </div>

      <label className="flex items-center justify-between gap-3 text-sm">
        <span>
          Follow along
          <span className="block text-[11px] text-muted-foreground">Turn pages as the narrator reads</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={sync.follow}
          disabled={off}
          onClick={() => {
            sync.setFollow(!sync.follow);
            if (!sync.follow) onJumped();
          }}
          className="flex h-11 items-center disabled:opacity-50"
        >
          <span className={cn("relative h-5 w-9 rounded-full transition-colors", sync.follow ? "bg-primary" : "bg-muted-foreground/30")}>
            <span className={cn("absolute top-0.5 left-0.5 size-4 rounded-full bg-card shadow transition-transform", sync.follow && "translate-x-4")} />
          </span>
        </button>
      </label>

      <div className="flex items-center justify-between gap-2">
        <button type="button" disabled={off} onClick={sync.link} className={cn(action, "flex-none px-3")}>
          <Link2 className="size-3.5" /> Link this page to now
        </button>
        <span className="text-right text-[11px] leading-tight text-muted-foreground">
          {off ? (
            "Preparing…"
          ) : confirmClear ? (
            <span className="flex items-center gap-1">
              <Button size="xs" variant="destructive" onClick={() => {
                  sync.clearLinks();
                  setConfirmClear(false);
                }}>
                Clear
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setConfirmClear(false)}>
                Keep
              </Button>
            </span>
          ) : (
            <>
              {sync.matched} {sync.matched === 1 ? "chapter" : "chapters"} matched
              <br />
              {sync.links} {sync.links === 1 ? "link" : "links"}
              {sync.links > 0 && (
                <button type="button" onClick={() => setConfirmClear(true)} className="ml-1 underline underline-offset-2 hover:text-foreground">
                  clear
                </button>
              )}
            </>
          )}
        </span>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        Press Link when the narrator is reading the top of the page you&apos;re on. Each link makes the
        match closer.
      </p>
    </div>
  );
}
