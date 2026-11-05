"use client";

import { memo } from "react";
import { Check, Flame, Plus, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import type { QueueItemView } from "@/lib/api/contracts";
import { MIN_VOTES_FOR_QUEUE } from "@/lib/domain/queue";

interface CandidateRowProps {
  item: QueueItemView;
  rank: number;
  targetVotes?: number;
  onVote: () => void;
  onTurboVote?: () => void;
  turboAvailable?: boolean;
  allowRepeatVotes?: boolean;
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

export const CandidateRow = memo(function CandidateRow({
  item,
  rank,
  targetVotes = MIN_VOTES_FOR_QUEUE,
  onVote,
  onTurboVote,
  turboAvailable = false,
  allowRepeatVotes = false,
  disabled,
}: CandidateRowProps) {
  const title = decodeHtmlEntities(item.title);
  const artist = decodeHtmlEntities(item.artist);
  const votes = item.voteCount;
  const target = Math.max(1, targetVotes);
  const progressPct = Math.min(100, Math.round((votes / target) * 100));
  const votesNeeded = Math.max(0, target - votes);
  const isVoteLocked = !allowRepeatVotes && item.myVote;

  return (
    <div className="relative rounded-xl p-3 border border-[#232B42] bg-[#121624] shadow-sm transition-all hover:border-[#2f3a58]">
      <div className="flex items-center justify-between gap-3">
        {/* Left: Rank & Track details */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex items-center justify-center size-8 rounded-lg bg-[#181F33] border border-[#2a344e] text-amber-400 font-mono text-xs font-bold shrink-0">
            #{rank}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h4 className="text-sm text-white font-bold truncate">
                {title}
              </h4>
              {rank === 1 && (
                <span className="shrink-0 text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.5 rounded">
                  🏆 Líder
                </span>
              )}
              {item.isKaraoke && (
                <span className="shrink-0 text-[9px] font-mono font-bold bg-pink-500/20 text-pink-200 border border-pink-400/40 px-1.5 py-0.5 rounded">
                  🎤 Karaoke
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 truncate mt-0.5">
              {artist} {item.durationSeconds ? `· ${formatDuration(item.durationSeconds)}` : ""}
              {item.guestName ? ` · 🎉 ${item.guestName}` : ""}
            </p>
            {item.dedication && (
              <p className="mt-1 text-[11px] text-fuchsia-200 italic truncate">
                💬 &ldquo;{item.dedication}&rdquo;
              </p>
            )}
          </div>
        </div>

        {/* Right: Vote Actions */}
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
            disabled={disabled || isVoteLocked}
            aria-label={
              isVoteLocked
                ? `Ya votaste por ${title}`
                : `Votar por ${title}`
            }
            className={cn(
              "flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] rounded-xl font-mono text-xs font-bold transition-all active:scale-95 touch-manipulation",
              isVoteLocked
                ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 cursor-default"
                : disabled
                  ? "bg-[#181b25] border border-[#232b42] text-slate-500 cursor-not-allowed"
                  : "bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-400 hover:to-indigo-500 text-white shadow-md shadow-amber-500/20",
            )}
          >
            {isVoteLocked ? (
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

      {/* Vote Progress Bar towards target votes */}
      <div className="mt-2.5 pt-2 border-t border-[#1C2336]/80 flex items-center justify-between gap-2 sm:gap-3 font-mono text-[11px] min-w-0">
        <div className="flex items-center gap-1.5 text-amber-300 font-semibold shrink-0">
          <Sparkles className="size-3 text-amber-400" />
          <span>{votes}/{target} votos</span>
        </div>

        {/* Mini Progress Bar */}
        <div className="flex-1 min-w-[60px] max-w-[140px] xs:max-w-[180px] h-1.5 rounded-full bg-[#1A2032] overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-indigo-500 rounded-full transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <span className="text-slate-400 text-[10px] shrink-0 truncate">
          {votesNeeded === 1 ? "¡Falta 1 voto!" : `Faltan ${votesNeeded} votos`}
        </span>
      </div>
    </div>
  );
});
