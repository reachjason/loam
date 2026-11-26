"use client";

import { Headphones, Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime } from "./listen-panel";
import type { Audiobook } from "./use-audiobook";

/**
 * Audiobook controls that stay on screen while listening: a slim tab in the right margin on
 * larger screens, a bar in place of the progress line on phones.
 */
export function MiniPlayer({ audio, dim, onOpen }: { audio: Audiobook; dim: boolean; onOpen: () => void }) {
  const { playing, time, duration, chapters, chapterIdx } = audio;
  const label = chapters[chapterIdx]?.title ?? "Audiobook";
  const left = `−${formatTime(duration - time)}`;
  const btn =
    "flex items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

  const playPause = (size: string) => (
    <button
      type="button"
      aria-label={playing ? "Pause" : "Play"}
      onClick={audio.toggle}
      className={cn("flex shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground", size)}
    >
      {playing ? <Pause className="size-4" /> : <Play className="ml-0.5 size-4" />}
    </button>
  );
  const back = (
    <button type="button" aria-label="Back 15 seconds" onClick={() => audio.skip(-15)} className={cn(btn, "size-9 pointer-coarse:size-11")}>
      <RotateCcw className="size-4" />
    </button>
  );
  const fwd = (
    <button type="button" aria-label="Forward 30 seconds" onClick={() => audio.skip(30)} className={cn(btn, "size-9 pointer-coarse:size-11")}>
      <RotateCw className="size-4" />
    </button>
  );

  return (
    <div
      role="region"
      aria-label="Audiobook"
      className={cn("transition-opacity duration-500 hover:opacity-100 focus-within:opacity-100", dim ? "opacity-55" : "opacity-100")}
    >
      {/* phones: bar along the bottom */}
      <div className="absolute inset-x-3 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-20 flex items-center gap-1 rounded-full border border-border bg-card/95 py-1 pr-1 pl-3 shadow-lg backdrop-blur sm:hidden">
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 flex-col items-start py-0.5 text-left">
          <span className="w-full truncate font-serif text-[13px] italic">{label}</span>
          <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{left}</span>
        </button>
        {back}
        {playPause("size-11")}
        {fwd}
      </div>

      {/* larger screens: tab in the right margin */}
      <div className="absolute top-1/2 right-[max(0.25rem,calc(3vw-1.5rem))] z-20 hidden -translate-y-1/2 flex-col items-center gap-1 rounded-full border border-border bg-card/95 p-1.5 shadow-lg backdrop-blur sm:flex">
        <button type="button" aria-label={`Open Listen: ${label}`} title={label} onClick={onOpen} className={cn(btn, "relative size-9")}>
          <Headphones className="size-4" />
          {playing && <span className="absolute top-1 right-1 size-1.5 animate-pulse rounded-full bg-primary" />}
        </button>
        {back}
        {playPause("size-10")}
        {fwd}
        <span className="pb-1 font-mono text-[9px] text-muted-foreground tabular-nums">{left}</span>
      </div>
    </div>
  );
}
