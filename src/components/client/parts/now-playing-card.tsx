import { Music2 } from "lucide-react";
import { SourceBadge } from "@/components/source-badge";
import type { QueueItemView } from "@/lib/api/contracts";

interface NowPlayingCardProps {
  item: QueueItemView | null;
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function NowPlayingCard({ item }: NowPlayingCardProps) {
  if (!item) {
    return (
      <section className="relative overflow-hidden rounded-[2rem] border border-cream/10 bg-felt-900 p-5">
        <div className="relative flex items-center justify-between">
          <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-cream/40">
            <span className="size-1.5 rounded-full bg-cream/30" />
            Música de fondo
          </span>
        </div>
        <div className="relative mt-4 flex items-center gap-4">
          <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-white/[0.04] text-cream/30">
            <Music2 className="size-7" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-xl font-bold tracking-tight text-cream">
              Playlist del bar
            </h2>
            <p className="mt-1 text-xs text-cream/50">
              Votá una canción para que empiece a sonar.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-cream/10 bg-felt-900 p-5">
      <div
        aria-hidden="true"
        className="absolute -right-12 -top-16 size-48 rounded-full border border-amber/20 bg-amber/[0.04]"
      />
      <div
        aria-hidden="true"
        className="absolute -right-2 -top-6 size-24 rounded-full border border-amber/10"
      />

      <div className="relative flex items-center justify-between">
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-amber">
          <span className="flex size-4 items-center justify-center rounded-full bg-coral/15">
            <span className="size-1.5 animate-pulse rounded-full bg-coral" />
          </span>
          Suena ahora
        </span>
        <SourceBadge source={item.source} />
      </div>

      <div className="relative mt-4 flex items-center gap-4">
        <div className="relative size-20 shrink-0">
          <div
            className="spin-slow absolute inset-0 rounded-full ring-1 ring-cream/10"
            style={{
              background:
                "repeating-radial-gradient(circle at center, #0b0b0b 0 2px, #1b1b1b 2px 4px)",
            }}
          >
            <span className="absolute left-1/2 top-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-amber font-display text-[9px] font-black text-ink">
              PP
            </span>
          </div>
          <span className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-felt-950" />
        </div>

        <div className="min-w-0">
          <h2 className="font-display text-2xl font-extrabold leading-[0.95] tracking-[-0.02em] text-cream">
            {item.title}
          </h2>
          <p className="mt-1.5 truncate text-sm text-cream/60">{item.artist}</p>
          <div className="mt-3 flex items-center gap-2">
            <Equalizer />
            <span className="text-[11px] text-cream/40">
              {formatDuration(item.durationSeconds)}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function Equalizer() {
  return (
    <span className="flex h-3.5 items-end gap-[3px]" aria-hidden="true">
      {[0.55, 1, 0.4, 0.8, 0.6].map((scale, index) => (
        <span
          key={index}
          className="eq-bar w-[2.5px] rounded-full bg-amber/80"
          style={{
            height: `${Math.round(scale * 14)}px`,
            animationDelay: `${index * 120}ms`,
          }}
        />
      ))}
    </span>
  );
}

