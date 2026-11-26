"use client";

import { cn } from "@/lib/utils";
import type { Entry } from "./config";
import { Sheet } from "./sheet";

export function ContentsPanel({
  toc,
  current,
  onPick,
  onClose,
}: {
  toc: Entry[];
  current: number;
  onPick: (i: number) => void;
  onClose: () => void;
}) {
  return (
    <Sheet title="Contents" variant="side" onClose={onClose}>
      <nav className="flex-1 overflow-y-auto overscroll-contain px-2 pb-6">
        {toc.map((t, i) => (
          <button
            key={`${t.href}-${i}`}
            type="button"
            aria-current={i === current ? "true" : undefined}
            ref={i === current ? (el) => el?.scrollIntoView({ block: "center" }) : undefined}
            onClick={() => onPick(i)}
            style={{ paddingLeft: `${0.75 + t.depth}rem` }}
            className={cn(
              "flex min-h-10 w-full items-center gap-2 rounded-lg py-2 pr-3 text-left text-sm transition-colors hover:bg-muted pointer-coarse:min-h-12",
              i === current ? "bg-secondary font-medium text-primary" : "text-foreground/80",
            )}
          >
            <span className="flex-1">{t.label}</span>
            {i === current && <span className="text-[10px] font-normal tracking-wide text-muted-foreground uppercase">Reading</span>}
          </button>
        ))}
      </nav>
    </Sheet>
  );
}
