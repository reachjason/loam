"use client";

import { ArrowLeft, Headphones, Keyboard, List, NotebookPen, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Panel } from "./config";

export function TopBar({
  title,
  visible,
  panel,
  playing,
  onToggle,
  onBack,
}: {
  title: string | undefined;
  visible: boolean;
  panel: Panel | null;
  playing: boolean;
  onToggle: (p: Panel) => void;
  onBack: () => void;
}) {
  const icon = (p: Panel) => cn("text-muted-foreground pointer-coarse:size-11", panel === p && "bg-muted text-foreground");
  return (
    <header
      className={cn(
        "absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 transition-opacity duration-500 sm:px-6 sm:pt-3",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <Button variant="ghost" size="sm" className="text-muted-foreground pointer-coarse:h-11 pointer-coarse:px-3" onClick={onBack}>
        <ArrowLeft /> Shelf
      </Button>
      <p className="hidden min-w-0 flex-1 truncate text-center font-serif text-sm text-muted-foreground italic sm:block">{title}</p>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="Keyboard shortcuts" className={cn(icon("keys"), "pointer-coarse:hidden")} onClick={() => onToggle("keys")}>
          <Keyboard />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Search" className={icon("search")} onClick={() => onToggle("search")}>
          <Search />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Contents" className={icon("toc")} onClick={() => onToggle("toc")}>
          <List />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={playing ? "Listen (playing)" : "Listen"}
          className={cn(icon("listen"), "relative")}
          onClick={() => onToggle("listen")}
        >
          <Headphones />
          {playing && <span className="absolute top-1 right-1 size-1.5 animate-pulse rounded-full bg-primary" />}
        </Button>
        <Button variant="ghost" size="icon" aria-label="Notes" className={icon("notes")} onClick={() => onToggle("notes")}>
          <NotebookPen />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Text settings" className={cn(icon("type"), "font-serif text-base")} onClick={() => onToggle("type")}>
          Aa
        </Button>
      </div>
    </header>
  );
}
