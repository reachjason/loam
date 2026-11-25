"use client";

import { Minus, Moon, Plus, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReaderPrefs } from "@/lib/library";
import { cn } from "@/lib/utils";
import { FONT_STEPS, LINE_STEPS, step } from "./config";
import { Sheet } from "./sheet";

const touch = "pointer-coarse:size-11";

export function SettingsPanel({
  prefs,
  onChange,
  onClose,
}: {
  prefs: ReaderPrefs;
  onChange: (patch: Partial<ReaderPrefs>) => void;
  onClose: () => void;
}) {
  return (
    <Sheet title="Text" variant="popover" onClose={onClose}>
      <div className="space-y-4 px-5 pt-2 pb-6 sm:p-4">
        <Row label="Size">
          <Button variant="ghost" size="icon-sm" className={touch} aria-label="Smaller text" onClick={() => onChange({ fontSize: step(FONT_STEPS, prefs.fontSize, -1) })}>
            <Minus />
          </Button>
          <span className="w-12 text-center font-mono text-xs tabular-nums">{prefs.fontSize}%</span>
          <Button variant="ghost" size="icon-sm" className={touch} aria-label="Larger text" onClick={() => onChange({ fontSize: step(FONT_STEPS, prefs.fontSize, 1) })}>
            <Plus />
          </Button>
        </Row>
        <Row label="Spacing">
          <Button variant="ghost" size="icon-sm" className={touch} aria-label="Tighter lines" onClick={() => onChange({ lineHeight: step(LINE_STEPS, prefs.lineHeight, -1) })}>
            <Minus />
          </Button>
          <span className="w-12 text-center font-mono text-xs tabular-nums">{prefs.lineHeight.toFixed(2)}</span>
          <Button variant="ghost" size="icon-sm" className={touch} aria-label="Looser lines" onClick={() => onChange({ lineHeight: step(LINE_STEPS, prefs.lineHeight, 1) })}>
            <Plus />
          </Button>
        </Row>
        <Row label="Theme">
          <div className="flex rounded-full bg-secondary p-0.5">
            {(["light", "dark"] as const).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={prefs.theme === t}
                aria-label={t === "light" ? "Parchment" : "Night"}
                onClick={() => onChange({ theme: t })}
                className={cn(
                  "flex size-7 items-center justify-center rounded-full transition-colors pointer-coarse:size-10",
                  prefs.theme === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                )}
              >
                {t === "light" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Progress">
          <button
            type="button"
            role="switch"
            aria-checked={prefs.showProgress}
            aria-label="Show progress"
            onClick={() => onChange({ showProgress: !prefs.showProgress })}
            className="flex h-11 items-center"
          >
            <span className={cn("relative h-5 w-9 rounded-full transition-colors", prefs.showProgress ? "bg-primary" : "bg-muted-foreground/30")}>
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 size-4 rounded-full bg-card shadow transition-transform",
                  prefs.showProgress && "translate-x-4",
                )}
              />
            </span>
          </button>
        </Row>
      </div>
    </Sheet>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}
