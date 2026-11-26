"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A panel over the page. On phones it slides up from the bottom; on larger screens it is
 * a side panel ("side") or a small card under the top bar ("popover").
 */
export function Sheet({
  title,
  variant,
  onClose,
  children,
}: {
  title: string;
  variant: "side" | "popover";
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div
        className={cn("absolute inset-0 z-30 bg-foreground/10 sm:bg-foreground/5", variant === "popover" && "sm:bg-transparent")}
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-label={title}
        className={cn(
          "absolute inset-x-0 bottom-0 z-40 flex max-h-[80dvh] flex-col rounded-t-3xl border-t border-border bg-card pb-[env(safe-area-inset-bottom)] shadow-xl",
          "animate-in slide-in-from-bottom duration-200 sm:animate-none",
          variant === "side" &&
            "sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-full sm:max-w-sm sm:rounded-none sm:border-t-0 sm:border-l sm:pb-0",
          variant === "popover" &&
            "sm:top-[calc(3.5rem+env(safe-area-inset-top))] sm:right-6 sm:bottom-auto sm:left-auto sm:w-72 sm:rounded-2xl sm:border sm:pb-0",
        )}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/25 sm:hidden" />
        <div className={cn("flex items-center justify-between px-5 pt-3 pb-2 sm:pt-4", variant === "popover" && "sm:hidden")}>
          <h2 className="font-serif text-lg">{title}</h2>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose} className="pointer-coarse:size-11">
            <X />
          </Button>
        </div>
        {children}
      </section>
    </>
  );
}
