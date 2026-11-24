import { Sprout } from "lucide-react";
import { AudioPlayer } from "@/components/player/audio-player";

export default function Home() {
  return (
    <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 py-10 sm:py-16">
      <header className="mb-12 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Sprout className="size-4" />
          </span>
          <span className="font-serif text-2xl tracking-tight">Loam</span>
        </div>
        <p className="font-serif text-sm italic text-muted-foreground">slow down, take it in</p>
      </header>

      <main className="flex-1">
        <AudioPlayer />
      </main>
    </div>
  );
}
