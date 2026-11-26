"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAudio, loadPosition, loadRate, removeAudio, saveAudio, savePosition, saveRate } from "@/lib/audio";
import type { Book } from "@/lib/library";
import { readChapters, type AudioChapter } from "@/lib/m4b-chapters";

const SAVE_EVERY_S = 5;

/**
 * The audiobook attached to a book. The <audio> element lives here, not in the panel,
 * so playback carries on while the panel is closed or pages turn.
 */
export function useAudiobook(bookId: string, meta: Book | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSaved = useRef(0);
  const [file, setFile] = useState<File | null | undefined>(undefined); // undefined = still loading
  const [chapters, setChapters] = useState<AudioChapter[]>([]);
  const [playing, setPlaying] = useState(false);
  /** Pressed play since the book was opened; the mini player shows from then on. */
  const [started, setStarted] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRateState] = useState(loadRate);
  const [error, setError] = useState<string | null>(null);

  // One element for the reader's lifetime.
  useEffect(() => {
    const a = new Audio();
    a.preload = "metadata";
    audioRef.current = a;
    const save = () => {
      if (a.src && a.currentTime > 0) savePosition(bookId, a.currentTime);
    };
    const on = {
      play: () => {
        setPlaying(true);
        setStarted(true);
      },
      pause: () => {
        setPlaying(false);
        save();
      },
      timeupdate: () => {
        setTime(a.currentTime);
        if (Math.abs(a.currentTime - lastSaved.current) >= SAVE_EVERY_S) {
          lastSaved.current = a.currentTime;
          save();
        }
      },
      durationchange: () => setDuration(Number.isFinite(a.duration) ? a.duration : 0),
      loadedmetadata: () => {
        a.currentTime = Math.min(loadPosition(bookId), Math.max(0, a.duration - 1));
        a.playbackRate = loadRate();
      },
      error: () => setError("This file can't be played in this browser."),
    };
    for (const [k, f] of Object.entries(on)) a.addEventListener(k, f);
    window.addEventListener("pagehide", save);
    return () => {
      save();
      a.pause();
      for (const [k, f] of Object.entries(on)) a.removeEventListener(k, f);
      window.removeEventListener("pagehide", save);
      if (a.src) URL.revokeObjectURL(a.src);
      a.removeAttribute("src");
      audioRef.current = null;
    };
  }, [bookId]);

  // Load the stored file, if any, into the element.
  const load = useCallback((f: File | null) => {
    const a = audioRef.current;
    if (!a) return;
    if (a.src) URL.revokeObjectURL(a.src);
    setError(null);
    setTime(0);
    setDuration(0);
    setChapters([]);
    setFile(f);
    if (!f) {
      setStarted(false);
      a.pause();
      a.removeAttribute("src");
      a.load();
      return;
    }
    a.src = URL.createObjectURL(f);
    void readChapters(f).then(setChapters);
  }, []);

  useEffect(() => {
    let live = true;
    getAudio(bookId).then((f) => live && load(f));
    return () => {
      live = false;
    };
  }, [bookId, load]);

  const attach = useCallback(
    async (f: File) => {
      try {
        load(await saveAudio(bookId, f));
      } catch (e) {
        console.error(e);
        setError(
          e instanceof DOMException && e.name === "QuotaExceededError"
            ? "Not enough browser storage for this file."
            : "Couldn't save this file.",
        );
      }
    },
    [bookId, load],
  );
  const detach = useCallback(async () => {
    await removeAudio(bookId);
    load(null);
  }, [bookId, load]);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a?.src) return;
    if (a.paused) a.play().catch(() => setError("Playback was blocked. Press play again."));
    else a.pause();
  }, []);
  const pause = useCallback(() => audioRef.current?.pause(), []);
  const play = useCallback(() => {
    audioRef.current?.play().catch(() => setError("Playback was blocked. Press play again."));
  }, []);
  const seek = useCallback((t: number) => {
    const a = audioRef.current;
    if (!a?.src) return;
    a.currentTime = Math.max(0, Math.min(t, a.duration || t));
    setTime(a.currentTime);
  }, []);
  const skip = useCallback((d: number) => seek((audioRef.current?.currentTime ?? 0) + d), [seek]);
  const setRate = useCallback((r: number) => {
    if (audioRef.current) audioRef.current.playbackRate = r;
    setRateState(r);
    saveRate(r);
  }, []);

  const chapterIdx = chapters.findLastIndex((c) => c.start <= time + 0.5);
  const goChapter = useCallback(
    (dir: 1 | -1) => {
      const t = audioRef.current?.currentTime ?? 0;
      const i = chapters.findLastIndex((c) => c.start <= t + 0.5);
      // "previous" restarts the current chapter unless we're right at its start
      const target = dir === -1 && i >= 0 && t - chapters[i].start > 3 ? i : i + dir;
      const c = chapters[Math.max(0, Math.min(chapters.length - 1, target))];
      if (c) seek(c.start);
    },
    [chapters, seek],
  );

  // Lock screen and media keys.
  useEffect(() => {
    if (!("mediaSession" in navigator) || !file || !meta) return;
    const art = meta.cover ? URL.createObjectURL(meta.cover) : null;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: meta.title,
      artist: meta.author,
      album: chapters[chapterIdx]?.title ?? "",
      artwork: art ? [{ src: art, sizes: "512x512", type: meta.cover!.type || "image/jpeg" }] : [],
    });
    return () => {
      if (art) URL.revokeObjectURL(art);
    };
  }, [file, meta, chapters, chapterIdx]);

  useEffect(() => {
    if (!("mediaSession" in navigator) || !file) return;
    const ms = navigator.mediaSession;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", toggle],
      ["pause", toggle],
      ["seekbackward", () => skip(-15)],
      ["seekforward", () => skip(30)],
      ["seekto", (d) => d.seekTime != null && seek(d.seekTime)],
      ["previoustrack", () => goChapter(-1)],
      ["nexttrack", () => goChapter(1)],
    ];
    for (const [a, h] of handlers) {
      try {
        ms.setActionHandler(a, h);
      } catch {
        /* unsupported action */
      }
    }
    return () => {
      for (const [a] of handlers) {
        try {
          ms.setActionHandler(a, null);
        } catch {
          /* unsupported action */
        }
      }
    };
  }, [file, toggle, skip, seek, goChapter]);

  return { file, chapters, chapterIdx, playing, started, time, duration, rate, error, attach, detach, toggle, pause, play, seek, skip, setRate, goChapter };
}

export type Audiobook = ReturnType<typeof useAudiobook>;
