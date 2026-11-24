"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Track = {
  id: string;
  name: string;
  size: number;
  url: string;
};

export const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;

const RATE_KEY = "loam:rate";
const VOLUME_KEY = "loam:volume";
const posKey = (t: Track) => `loam:pos:${t.name}:${t.size}`;

function readNumber(key: string, fallback: number) {
  if (typeof window === "undefined") return fallback;
  const raw = localStorage.getItem(key);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function prettyName(filename: string) {
  return filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
}

export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  // Only rendered once a track is loaded (client-side), so reading storage here is hydration-safe
  const [rate, setRateState] = useState(() => readNumber(RATE_KEY, 1));
  const [volume, setVolumeState] = useState(() => readNumber(VOLUME_KEY, 1));
  const [muted, setMuted] = useState(false);
  const lastSaved = useRef(0);
  const autoplayNext = useRef(false);

  const current = queue[index] ?? null;

  // Create the audio element once and restore preferences
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.src = "";
    };
  }, []);

  // Keep element in sync with rate / volume
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.playbackRate = rate;
    a.defaultPlaybackRate = rate;
    localStorage.setItem(RATE_KEY, String(rate));
  }, [rate]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.volume = volume;
    a.muted = muted;
    localStorage.setItem(VOLUME_KEY, String(volume));
  }, [volume, muted]);

  // Load current track and resume saved position
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !current) return;
    a.src = current.url;
    a.playbackRate = rate;
    const onMeta = () => {
      setDuration(a.duration || 0);
      const saved = Number(localStorage.getItem(posKey(current)));
      if (saved && saved < a.duration - 5) {
        a.currentTime = saved;
        setCurrentTime(saved);
      }
      if (autoplayNext.current) {
        autoplayNext.current = false;
        void a.play();
      }
    };
    a.addEventListener("loadedmetadata", onMeta, { once: true });
    return () => a.removeEventListener("loadedmetadata", onMeta);
    // rate intentionally excluded: changing speed must not reload the track
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // Wire element events
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const save = () => {
      if (current) localStorage.setItem(posKey(current), String(a.currentTime));
    };
    const onTime = () => {
      setCurrentTime(a.currentTime);
      const now = Date.now();
      if (now - lastSaved.current > 3000) {
        lastSaved.current = now;
        save();
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => {
      setIsPlaying(false);
      save();
    };
    const onEnded = () => {
      if (current) localStorage.removeItem(posKey(current));
      setIsPlaying(false);
      if (index < queue.length - 1) {
        autoplayNext.current = true;
        setIndex(index + 1);
      }
    };
    const onDuration = () => setDuration(a.duration || 0);
    const onLoadStart = () => {
      setCurrentTime(0);
      setDuration(0);
    };
    a.addEventListener("loadstart", onLoadStart);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnded);
    a.addEventListener("durationchange", onDuration);
    window.addEventListener("beforeunload", save);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("durationchange", onDuration);
      a.removeEventListener("loadstart", onLoadStart);
      window.removeEventListener("beforeunload", save);
    };
  }, [current, index, queue.length]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const audioFiles = Array.from(files).filter(
      (f) => f.type.startsWith("audio/") || /\.(mp3|m4a|m4b|aac|wav|ogg|flac)$/i.test(f.name),
    );
    if (!audioFiles.length) return;
    const tracks = audioFiles.map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      size: f.size,
      url: URL.createObjectURL(f),
    }));
    setQueue((q) => [...q, ...tracks]);
  }, []);

  const play = useCallback(() => void audioRef.current?.play(), []);
  const pause = useCallback(() => audioRef.current?.pause(), []);
  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a || !a.src) return;
    if (a.paused) void a.play();
    else a.pause();
  }, []);

  const seek = useCallback((t: number) => {
    const a = audioRef.current;
    if (!a || !Number.isFinite(a.duration)) return;
    a.currentTime = Math.max(0, Math.min(t, a.duration));
    setCurrentTime(a.currentTime);
  }, []);

  const skip = useCallback(
    (delta: number) => {
      const a = audioRef.current;
      if (a) seek(a.currentTime + delta);
    },
    [seek],
  );

  const setRate = useCallback((r: number) => setRateState(r), []);
  const stepRate = useCallback((dir: 1 | -1) => {
    setRateState((r) => {
      const i = SPEEDS.findIndex((s) => s >= r);
      const next = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (i === -1 ? SPEEDS.length - 1 : i) + dir))];
      return next;
    });
  }, []);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    if (v > 0) setMuted(false);
  }, []);
  const toggleMute = useCallback(() => setMuted((m) => !m), []);

  const selectTrack = useCallback(
    (i: number) => {
      if (i === index) return toggle();
      autoplayNext.current = true;
      setIndex(i);
    },
    [index, toggle],
  );

  const next = useCallback(() => {
    if (index < queue.length - 1) {
      autoplayNext.current = isPlaying;
      setIndex(index + 1);
    }
  }, [index, queue.length, isPlaying]);

  const prev = useCallback(() => {
    const a = audioRef.current;
    if (a && a.currentTime > 3) return seek(0);
    if (index > 0) {
      autoplayNext.current = isPlaying;
      setIndex(index - 1);
    }
  }, [index, isPlaying, seek]);

  const removeTrack = useCallback(
    (i: number) => {
      setQueue((q) => {
        const t = q[i];
        if (t) URL.revokeObjectURL(t.url);
        const nq = q.filter((_, j) => j !== i);
        if (i === index) {
          audioRef.current?.pause();
          if (!nq.length) audioRef.current?.removeAttribute("src");
        }
        return nq;
      });
      setIndex((cur) => (i < cur ? cur - 1 : Math.min(cur, Math.max(0, queue.length - 2))));
    },
    [index, queue.length],
  );

  return {
    queue,
    index,
    current,
    title: current ? prettyName(current.name) : "",
    isPlaying,
    currentTime,
    duration,
    rate,
    volume,
    muted,
    addFiles,
    play,
    pause,
    toggle,
    seek,
    skip,
    setRate,
    stepRate,
    setVolume,
    toggleMute,
    selectTrack,
    next,
    prev,
    removeTrack,
    prettyName,
  };
}

export function formatTime(s: number) {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}
