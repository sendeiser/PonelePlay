import { Moon, Music } from "lucide-react";
import { BrandMark } from "@/components/brand";

interface ClosedStateProps {
  venueName: string;
  joinMessage?: string | null;
}

export function ClosedState({ venueName, joinMessage }: ClosedStateProps) {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-4 text-center">
      <div className="relative mb-6">
        <BrandMark className="size-16 opacity-60" />
        <span className="absolute -bottom-1 -right-1 grid size-7 place-items-center rounded-full border border-th-border bg-th-card text-th-secondary shadow-xs">
          <Moon className="size-4" aria-hidden="true" />
        </span>
      </div>
      <h1 className="font-display text-2xl font-bold tracking-tight text-th-text">
        La noche está cerrada
      </h1>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-th-muted">
        {joinMessage ||
          `En ${venueName} todavía no arrancó la sesión de votación o ya terminó por hoy.`}
      </p>
      <div className="mt-6 flex items-center gap-2 rounded-full border border-th-border bg-th-card px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-th-secondary shadow-xs">
        <Music className="size-3.5 text-th-accent" aria-hidden="true" />
        Volvé a escanear más tarde
      </div>
    </div>
  );
}

