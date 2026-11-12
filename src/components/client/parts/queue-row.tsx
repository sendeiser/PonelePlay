"use client";

import { memo } from "react";
import { Flame, Plus } from "lucide-react";
import { BallChip } from "@/components/ball-chip";
import { cn } from "@/lib/cn";
import type { QueueItemView } from "@/lib/api/contracts";

interface QueueRowProps {
  item: QueueItemView;
  rank: number;
  onVote: () => void;
  onTurboVote?: () => void;
  turboAvailable?: boolean;
  disabled?: boolean;
}

function decodeHtmlEntities(str: string): string {
  if (!str) return "";
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#039;/g, "'");
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export const QueueRow = memo(function QueueRow({
  item,
  rank,
  onVote,
  onTurboVote,
  turboAvailable = false,
  disabled,
}: QueueRowProps) {
  const isNext = rank === 1;
  const title = decodeHtmlEntities(item.title);
  const artist = decodeHtmlEntities(item.artist);

  return (
    <div
      className={cn(
        "relative rounded-xl p-3 border shadow-xs flex items-center justify-between gap-2.5 transition-all",
        isNext
          ? "bg-th-accent-soft border-th-accent/40"
          : "bg-th-card border-th-border hover:border-th-border-strong",
      )}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Rank Badge */}
        <BallChip n={rank} size="md" />

        {/* Song Details */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <h4 className="text-sm text-th-text font-bold truncate">
              {title}
            </h4>
            {isNext && (
              <span className="shrink-0 px-1.5 py-0.5 rounded bg-th-accent text-th-on-accent font-mono text-[9px] uppercase font-bold tracking-wider">
                Próxima
              </span>
            )}
            {item.isKaraoke && (
              <span className="shrink-0 px-1.5 py-0.5 rounded bg-th-accent-soft text-th-accent border border-th-accent/30 font-mono text-[9px] uppercase font-bold">
                🎤 Karaoke
              </span>
            )}
          </div>
          <p className="text-xs text-th-muted truncate mt-0.5">
            {artist} {item.durationSeconds ? `· ${formatDuration(item.durationSeconds)}` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-1 font-mono text-[11px] text-th-muted">
            <span className="text-th-accent font-semibold tabular-nums">
              {(item.voteCount >= 9999 || item.voteCount === 0) ? "⭐ Selección Bar" : `${item.voteCount} ${item.voteCount === 1 ? "voto" : "votos"}`}
            </span>
            <span>•</span>
            <span>
              {item.guestName
                ? `🎉 ${item.guestName}`
                : item.voteCount >= 9999 || item.voteCount === 0
                  ? "Puesto por la casa"
                  : "Mesa en vivo"}
            </span>
          </div>
          {item.dedication && (
            <p className="mt-1 text-[11px] text-th-accent italic truncate">
              💬 &ldquo;{item.dedication}&rdquo;
            </p>
          )}
        </div>
      </div>

      {/* Vote Buttons */}
      <div className="flex shrink-0 items-center gap-1.5">
        {onTurboVote && (
          <button
            type="button"
            onClick={onTurboVote}
            disabled={disabled || !turboAvailable}
            title={turboAvailable ? "Fueguito Turbo (+3 votos de golpe)" : "Fueguito recargando..."}
            className={cn(
              "flex items-center gap-1 px-2.5 py-2.5 min-h-[44px] rounded-xl font-mono text-xs font-extrabold transition-all active:scale-95 touch-manipulation",
              turboAvailable && !disabled
                ? "bg-th-amber hover:brightness-105 text-slate-950 shadow-sm"
                : "bg-th-recessed border border-th-border text-th-muted cursor-not-allowed",
            )}
          >
            <Flame className="size-3.5" aria-hidden="true" />
            <span>+3</span>
          </button>
        )}

        <button
          type="button"
          onClick={onVote}
          disabled={disabled}
          aria-label={`Votar por ${title} para que suba en la cola`}
          className={cn(
            "flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] rounded-xl font-mono text-xs font-bold transition-all active:scale-95 touch-manipulation",
            disabled
              ? "bg-th-recessed border border-th-border text-th-muted cursor-not-allowed"
              : item.myVote
                ? "bg-th-emerald hover:brightness-105 text-white shadow-sm"
                : "bg-th-accent hover:bg-th-accent-hover text-th-on-accent shadow-sm",
          )}
        >
          {item.myVote ? (
            <>
              <Plus className="size-4" aria-hidden="true" />
              <span>+1 Subir</span>
            </>
          ) : (
            <>
              <Plus className="size-4" aria-hidden="true" />
              <span>+1 Voto</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
});
