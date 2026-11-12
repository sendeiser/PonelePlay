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
    <div className="relative rounded-xl p-3 border border-th-border bg-th-card shadow-xs transition-all hover:border-th-border-strong">
      <div className="flex items-center justify-between gap-3">
        {/* Left: Rank & Track details */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex items-center justify-center size-8 rounded-lg bg-th-amber-soft border border-th-amber/30 text-th-amber font-mono text-xs font-bold shrink-0 tabular-nums">
            #{rank}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h4 className="text-sm text-th-text font-bold truncate">
                {title}
              </h4>
              {rank === 1 && (
                <span className="shrink-0 text-[9px] font-mono font-bold bg-th-amber-soft text-th-amber border border-th-amber/30 px-1.5 py-0.5 rounded">
                  🏆 Líder
                </span>
              )}
              {item.isKaraoke && (
                <span className="shrink-0 text-[9px] font-mono font-bold bg-th-accent-soft text-th-accent border border-th-accent/30 px-1.5 py-0.5 rounded">
                  🎤 Karaoke
                </span>
              )}
            </div>
            <p className="text-xs text-th-muted truncate mt-0.5">
              {artist} {item.durationSeconds ? `· ${formatDuration(item.durationSeconds)}` : ""}
              {item.guestName ? ` · 🎉 ${item.guestName}` : ""}
            </p>
            {item.dedication && (
              <p className="mt-1 text-[11px] text-th-accent italic truncate">
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
            disabled={disabled || isVoteLocked}
            aria-label={
              isVoteLocked
                ? `Ya votaste por ${title}`
                : `Votar por ${title}`
            }
            className={cn(
              "flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] rounded-xl font-mono text-xs font-bold transition-all active:scale-95 touch-manipulation",
              isVoteLocked
                ? "bg-th-emerald-soft border border-th-emerald/35 text-th-emerald cursor-default"
                : disabled
                  ? "bg-th-recessed border border-th-border text-th-muted cursor-not-allowed"
                  : "bg-th-accent hover:bg-th-accent-hover text-th-on-accent shadow-sm",
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
      <div className="mt-2.5 pt-2 border-t border-th-border flex items-center justify-between gap-2 sm:gap-3 font-mono text-[11px] min-w-0">
        <div className="flex items-center gap-1.5 text-th-amber font-semibold shrink-0 tabular-nums">
          <Sparkles className="size-3 text-th-amber" />
          <span>{votes}/{target} votos</span>
        </div>

        {/* Mini Progress Bar */}
        <div className="flex-1 min-w-[60px] max-w-[140px] xs:max-w-[180px] h-1.5 rounded-full bg-th-recessed overflow-hidden">
          <div
            className="h-full bg-th-teal rounded-full transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <span className="text-th-muted text-[10px] shrink-0 truncate tabular-nums">
          {votesNeeded === 1 ? "¡Falta 1 voto!" : `Faltan ${votesNeeded} votos`}
        </span>
      </div>
    </div>
  );
});
