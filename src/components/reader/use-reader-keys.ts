"use client";

import { useCallback, useEffect, useRef } from "react";
import { SPEEDS } from "@/lib/audio";
import { FONT_STEPS, step, type Panel } from "./config";
import type { Audiobook } from "./use-audiobook";
import type { EpubReader } from "./use-epub-reader";

/**
 * Keyboard shortcuts. Returns a handler for keys pressed inside the book frame,
 * whose listeners are passive, so it can't preventDefault there.
 */
export function useReaderKeys(
  reader: EpubReader,
  togglePanel: (p: Panel) => void,
  closePanel: () => void,
  audio: Audiobook,
  openPanel: (p: Panel) => void,
  lookup: () => void,
  /** Gets first say on a key (e.g. shortcuts inside an open card); returns true if it handled it. */
  intercept: (key: string) => boolean,
) {
  const { toggle, skip, goChapter: audioChapter, setRate, rate } = audio;
  const { next, prev, goChapter, updatePrefs, prefs } = reader;
  const prefsRef = useRef(prefs);
  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  const onKey = useCallback(
    (e: KeyboardEvent, fromBook: boolean) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        if (!fromBook) e.preventDefault(); // the browser's own find can't be stopped from inside the book frame
        return openPanel("search");
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") return closePanel();
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input, textarea, [contenteditable]")) return;
      const p = prefsRef.current;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (intercept(k)) {
        if (!fromBook) e.preventDefault();
        return;
      }
      const bigger = () => updatePrefs({ fontSize: step(FONT_STEPS, p.fontSize, 1) });
      const shifted: Record<string, () => void> = {
        ArrowLeft: () => skip(-15),
        ArrowRight: () => skip(30),
        "{": () => audioChapter(-1),
        "}": () => audioChapter(1),
        "[": () => audioChapter(-1),
        "]": () => audioChapter(1),
      };
      const actions: Record<string, () => void> = {
        ArrowRight: next,
        PageDown: next,
        ArrowLeft: prev,
        PageUp: prev,
        " ": e.shiftKey ? prev : next,
        "]": () => goChapter(1),
        "[": () => goChapter(-1),
        c: () => togglePanel("toc"),
        "/": () => openPanel("search"),
        d: lookup,
        w: () => togglePanel("notes"),
        l: () => togglePanel("listen"),
        k: toggle,
        ",": () => setRate(step(SPEEDS, rate, -1)),
        ".": () => setRate(step(SPEEDS, rate, 1)),
        p: () => updatePrefs({ showProgress: !p.showProgress }),
        "=": bigger,
        "+": bigger,
        "-": () => updatePrefs({ fontSize: step(FONT_STEPS, p.fontSize, -1) }),
        n: () => updatePrefs({ theme: p.theme === "light" ? "dark" : "light" }),
        "?": () => togglePanel("keys"),
      };
      const action = (e.shiftKey && shifted[e.key]) || actions[k];
      if (!action) return;
      if (!fromBook) e.preventDefault();
      action();
    },
    [next, prev, goChapter, updatePrefs, togglePanel, openPanel, lookup, intercept, closePanel, toggle, skip, audioChapter, setRate, rate],
  );

  useEffect(() => {
    const key = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onKey]);

  return useCallback((e: KeyboardEvent) => onKey(e, true), [onKey]);
}
