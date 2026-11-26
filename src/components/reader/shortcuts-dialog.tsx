"use client";

import { AUDIO_SHORTCUTS, SHORTCUTS } from "./config";

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-foreground/10 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Shortcuts"
        className="max-h-full w-full max-w-sm overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 font-serif text-lg">Shortcuts</h2>
        <List items={SHORTCUTS} />
        <h3 className="mt-5 mb-3 text-[11px] tracking-wide text-muted-foreground uppercase">Audiobook</h3>
        <List items={AUDIO_SHORTCUTS} />
      </div>
    </div>
  );
}

function List({ items }: { items: [string, string][] }) {
  return (
    <dl className="space-y-2.5 text-sm">
      {items.map(([k, d]) => (
        <div key={k} className="flex items-center justify-between gap-6">
          <dt className="text-muted-foreground">{d}</dt>
          <dd>
            <kbd className="rounded-md border border-border bg-secondary px-2 py-0.5 font-mono text-xs whitespace-pre">{k}</kbd>
          </dd>
        </div>
      ))}
    </dl>
  );
}
