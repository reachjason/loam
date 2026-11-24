import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AudioPlayer } from "@/components/player/audio-player";

export default function ListenPage() {
  return (
    <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 py-10 sm:py-16">
      <header className="mb-12 flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Shelf
        </Link>
        <p className="font-serif text-sm italic text-muted-foreground">listen</p>
      </header>
      <main className="flex-1">
        <AudioPlayer />
      </main>
    </div>
  );
}
