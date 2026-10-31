import { Check, Plus } from "lucide-react";
import { BallChip } from "@/components/ball-chip";
import { cn } from "@/lib/cn";
import type { QueueItemView } from "@/lib/api/contracts";

interface QueueRowProps {
  item: QueueItemView;
  rank: number;
  onVote: () => void;
  disabled?: boolean;
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function QueueRow({ item, rank, onVote, disabled }: QueueRowProps) {
  const isNext = rank === 1;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border p-3 transition-colors",
        isNext
          ? "border-amber/35 bg-amber/[0.07]"
          : "border-cream/10 bg-white/[0.02]",
      )}
    >
      <BallChip n={rank} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-sm font-semibold text-cream">{item.title}</p>
          {isNext ? (
            <span className="shrink-0 rounded-full bg-amber px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-ink">
              próxima
            </span>
          ) : null}
        </div>
        <p className="truncate text-[11px] text-cream/45">
          {item.artist} {item.durationSeconds ? `· ${formatDuration(item.durationSeconds)}` : ""}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        <span className="font-mono text-[11px] text-cream/50" aria-label={`${item.voteCount} votos`}>
          {item.voteCount}
        </span>
        <button
          type="button"
          onClick={onVote}
          disabled={disabled || item.myVote}
          aria-label={
            item.myVote
              ? `Ya votaste por ${item.title}`
              : `Votar por ${item.title}`
          }
          className={cn(
            "grid size-10 place-items-center rounded-full border transition-all active:scale-90",
            item.myVote
              ? "border-mint/30 bg-mint/10 text-mint cursor-default"
              : disabled
                ? "border-cream/10 bg-cream/5 text-cream/30 cursor-not-allowed"
                : "border-amber/20 bg-amber text-ink hover:bg-amber/90",
          )}
        >
          {item.myVote ? (
            <Check className="size-4" aria-hidden="true" />
          ) : (
            <Plus className="size-5" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}

