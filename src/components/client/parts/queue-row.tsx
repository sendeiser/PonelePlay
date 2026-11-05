"use client";

import { memo } from "react";
import { Check, Flame, Plus } from "lucide-react";
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
        "relative rounded-xl p-3 border shadow-sm flex items-center justify-between gap-2.5 transition-all",
        isNext
          ? "bg-[#161c2e] border-indigo-500/40 shadow-[0_0_15px_rgba(99,102,241,0.15)]"
          : "bg-[#131826] border-[#1E2538] hover:border-[#2a344e]",
      )}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Rank Badge */}
        <BallChip n={rank} size="md" />

        {/* Song Details */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <h4 className="text-sm text-white font-bold truncate">
              {title}
            </h4>
            {isNext && (
              <span className="shrink-0 px-1.5 py-0.5 rounded bg-indigo-500/20 text-[#c0c1ff] border border-indigo-500/30 font-mono text-[9px] uppercase font-bold tracking-wider">
                Próxima
              </span>
            )}
            {item.isKaraoke && (
              <span className="shrink-0 px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-200 border border-pink-400/40 font-mono text-[9px] uppercase font-bold">
                🎤 Karaoke
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 truncate mt-0.5">
            {artist} {item.durationSeconds ? `· ${formatDuration(item.durationSeconds)}` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-1 font-mono text-[11px] text-slate-400">
            <span className="text-indigo-400 font-semibold">
              {(item.voteCount >= 9999 || item.voteCount === 0) ? "⭐ Selección Bar" : `${item.voteCount} ${item.voteCount === 1 ? "voto" : "votos"}`}
            </span>
            <span className="text-slate-600">•</span>
            <span>
              {item.guestName
                ? `🎉 ${item.guestName}`
                : item.voteCount >= 9999 || item.voteCount === 0
                  ? "Puesto por la casa"
                  : "Mesa en vivo"}
            </span>
          </div>
          {item.dedication && (
            <p className="mt-1 text-[11px] text-fuchsia-200 italic truncate">
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
                ? "bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 shadow-md shadow-amber-500/25"
                : "bg-[#181b25] border border-[#232b42] text-slate-500 cursor-not-allowed",
            )}
          >
            <Flame className="size-3.5" aria-hidden="true" />
            <span>+3</span>
          </button>
        )}

        <button
          type="button"
          onClick={onVote}
          disabled={disabled || item.myVote}
          aria-label={
            item.myVote
              ? `Ya votaste por ${title}`
              : `Votar por ${title}`
          }
          className={cn(
            "flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] rounded-xl font-mono text-xs font-bold transition-all active:scale-95 touch-manipulation",
            item.myVote
              ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 cursor-default"
              : disabled
                ? "bg-[#181b25] border border-[#232b42] text-slate-500 cursor-not-allowed"
                : "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-md shadow-indigo-600/30",
          )}
        >
          {item.myVote ? (
            <>
              <Check className="size-4" aria-hidden="true" />
              <span>Votado</span>
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
