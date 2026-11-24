"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pause,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Upload,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SPEEDS, formatTime, useAudioPlayer } from "@/hooks/use-audio-player";
import { cn } from "@/lib/utils";

function IconButton({
  label,
  shortcut,
  className,
  ...props
}: React.ComponentProps<typeof Button> & { label: string; shortcut?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="ghost" size="icon-lg" aria-label={label} className={cn("rounded-full", className)} {...props} />
        }
      />
      <TooltipContent>
        {label}
        {shortcut && <kbd className="ml-1.5 font-mono text-[10px] opacity-70">{shortcut}</kbd>}
      </TooltipContent>
    </Tooltip>
  );
}

export function AudioPlayer() {
  const p = useAudioPlayer();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [scrub, setScrub] = useState<number | null>(null);

  const openPicker = useCallback(() => inputRef.current?.click(), []);

  // Page-wide drag & drop
  useEffect(() => {
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      depth++;
      setDragging(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDragging(false);
      if (e.dataTransfer?.files.length) p.addFiles(e.dataTransfer.files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [p.addFiles]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts
  const { toggle, skip, stepRate, toggleMute, next, prev } = p;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable=true]")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          toggle();
          break;
        case "ArrowLeft":
        case "j":
          e.preventDefault();
          skip(-15);
          break;
        case "ArrowRight":
        case "l":
          e.preventDefault();
          skip(30);
          break;
        case "ArrowUp":
        case "]":
          e.preventDefault();
          stepRate(1);
          break;
        case "ArrowDown":
        case "[":
          e.preventDefault();
          stepRate(-1);
          break;
        case "m":
          toggleMute();
          break;
        case "n":
          next();
          break;
        case "p":
          prev();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, skip, stepRate, toggleMute, next, prev]);

  const shownTime = scrub ?? p.currentTime;
  const remaining = Math.max(0, p.duration - shownTime);
  const remainingAtSpeed = remaining / p.rate;
  const pct = p.duration ? (shownTime / p.duration) * 100 : 0;
  const VolumeIcon = p.muted || p.volume === 0 ? VolumeX : p.volume < 0.5 ? Volume1 : Volume2;

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept="audio/*,.mp3,.m4a,.m4b"
      multiple
      className="sr-only"
      onChange={(e) => {
        if (e.target.files) p.addFiles(e.target.files);
        e.target.value = "";
      }}
    />
  );

  return (
    <div className="w-full">
      {fileInput}

      {/* Drag overlay */}
      <div
        className={cn(
          "pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm transition-opacity",
          dragging ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="rounded-3xl border-2 border-dashed border-primary/50 px-16 py-12 text-center">
          <p className="font-serif text-2xl">Let it settle here</p>
          <p className="mt-1 text-sm text-muted-foreground">Drop to add to your listening</p>
        </div>
      </div>

      {!p.current ? (
        <button
          type="button"
          onClick={openPicker}
          className="group flex w-full flex-col items-center justify-center gap-5 rounded-3xl border border-dashed border-border bg-card/60 px-8 py-24 text-center transition-colors hover:border-primary/50 hover:bg-card"
        >
          <span className="flex size-14 items-center justify-center rounded-full bg-secondary text-primary transition-transform group-hover:-translate-y-0.5">
            <Upload className="size-5" />
          </span>
          <span>
            <span className="block font-serif text-2xl text-foreground">Bring something to listen to</span>
            <span className="mt-2 block text-sm text-muted-foreground">
              Drop an MP3 anywhere, or <span className="text-primary underline underline-offset-4">browse your files</span>
            </span>
          </span>
          <span className="text-xs text-muted-foreground/70">Stays on your device. Nothing is uploaded.</span>
        </button>
      ) : (
        <div className="space-y-10">
          {/* Now playing */}
          <section className="rounded-3xl border border-border bg-card px-6 py-10 shadow-[0_1px_0_0_oklch(1_0_0/0.4)_inset,0_20px_40px_-24px_oklch(0.3_0.04_55/0.25)] sm:px-12">
            <p className="text-center text-xs font-medium uppercase tracking-[0.2em] text-clay">
              {p.isPlaying ? "Now listening" : p.currentTime > 0 ? "Paused" : "Ready"}
            </p>
            <h2 className="mx-auto mt-3 max-w-xl text-balance text-center font-serif text-3xl leading-tight sm:text-4xl">
              {p.title}
            </h2>

            {/* Progress */}
            <div className="mt-10">
              <Slider
                aria-label="Seek"
                min={0}
                max={p.duration || 1}
                step={1}
                value={[shownTime]}
                onValueChange={(v) => setScrub(Array.isArray(v) ? v[0] : v)}
                onValueCommitted={(v) => {
                  p.seek(Array.isArray(v) ? v[0] : v);
                  setScrub(null);
                }}
                className="[&_[data-slot=slider-track]]:h-1.5 [&_[data-slot=slider-thumb]]:size-4 [&_[data-slot=slider-thumb]]:border-primary"
              />
              <div className="mt-3 flex items-center justify-between font-mono text-xs tabular-nums text-muted-foreground">
                <span>{formatTime(shownTime)}</span>
                <span className="hidden font-sans sm:inline">
                  {p.duration ? `${Math.round(pct)}% · ${formatTime(remainingAtSpeed)} left at ${p.rate}×` : ""}
                </span>
                <span>-{formatTime(remaining)}</span>
              </div>
            </div>

            {/* Transport */}
            <div className="mt-8 flex items-center justify-center gap-2 sm:gap-4">
              <IconButton label="Previous" shortcut="P" onClick={p.prev}>
                <SkipBack className="size-5" />
              </IconButton>
              <IconButton label="Back 15 seconds" shortcut="←" onClick={() => p.skip(-15)} className="relative">
                <RotateCcw className="size-6" />
                <span className="absolute text-[8px] font-semibold">15</span>
              </IconButton>
              <Button
                onClick={p.toggle}
                aria-label={p.isPlaying ? "Pause" : "Play"}
                className="mx-2 size-16 rounded-full shadow-lg shadow-primary/20 [&_svg:not([class*='size-'])]:size-6"
              >
                {p.isPlaying ? <Pause className="fill-current" /> : <Play className="ml-0.5 fill-current" />}
              </Button>
              <IconButton label="Forward 30 seconds" shortcut="→" onClick={() => p.skip(30)} className="relative">
                <RotateCw className="size-6" />
                <span className="absolute text-[8px] font-semibold">30</span>
              </IconButton>
              <IconButton label="Next" shortcut="N" onClick={p.next} disabled={p.index >= p.queue.length - 1}>
                <SkipForward className="size-5" />
              </IconButton>
            </div>

            {/* Speed + volume */}
            <div className="mt-10 flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
              <div className="flex items-center gap-1 rounded-full bg-secondary p-1" role="radiogroup" aria-label="Playback speed">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={p.rate === s}
                    onClick={() => p.setRate(s)}
                    className={cn(
                      "rounded-full px-2.5 py-1 font-mono text-xs tabular-nums transition-colors",
                      p.rate === s
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-secondary-foreground/70 hover:text-foreground",
                    )}
                  >
                    {s}×
                  </button>
                ))}
              </div>
              <div className="flex w-40 items-center gap-2">
                <IconButton label={p.muted ? "Unmute" : "Mute"} shortcut="M" size="icon-sm" onClick={p.toggleMute}>
                  <VolumeIcon className="size-4" />
                </IconButton>
                <Slider
                  aria-label="Volume"
                  min={0}
                  max={1}
                  step={0.01}
                  value={[p.muted ? 0 : p.volume]}
                  onValueChange={(v) => p.setVolume(Array.isArray(v) ? v[0] : v)}
                />
              </div>
            </div>
          </section>

          {/* Queue */}
          <section>
            <div className="mb-3 flex items-baseline justify-between px-1">
              <h3 className="font-serif text-lg">Up next</h3>
              <Button variant="ghost" size="sm" onClick={openPicker} className="text-muted-foreground">
                <Plus /> Add audio
              </Button>
            </div>
            <ol className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card/60">
              {p.queue.map((t, i) => {
                const active = i === p.index;
                return (
                  <li key={t.id} className={cn("group flex items-center gap-3 px-4 py-3", active && "bg-secondary/60")}>
                    <button
                      type="button"
                      onClick={() => p.selectTrack(i)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span
                        className={cn(
                          "w-5 shrink-0 text-center font-mono text-xs tabular-nums",
                          active ? "text-primary" : "text-muted-foreground",
                        )}
                      >
                        {active && p.isPlaying ? "♪" : i + 1}
                      </span>
                      <span className={cn("truncate text-sm", active ? "font-medium text-foreground" : "text-foreground/80")}>
                        {p.prettyName(t.name)}
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Remove ${t.name}`}
                      onClick={() => p.removeTrack(i)}
                      className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <X />
                    </Button>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      )}

      <p className="mt-10 text-center text-xs text-muted-foreground/70">
        <kbd className="font-mono">space</kbd> play · <kbd className="font-mono">← →</kbd> skip ·{" "}
        <kbd className="font-mono">↑ ↓</kbd> speed · your place is remembered
      </p>
    </div>
  );
}
