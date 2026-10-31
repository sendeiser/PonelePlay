import { ChevronRight, Ticket } from "lucide-react";

interface BalanceCardProps {
  credits: number;
  onOpenRedeem: () => void;
}

export function BalanceCard({ credits, onOpenRedeem }: BalanceCardProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber/25 bg-amber/[0.06] px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-amber text-ink">
          <Ticket className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-amber/80">
            Tus votos
          </p>
          <p className="font-display text-xl font-bold leading-none text-cream">
            {credits}{" "}
            <span className="text-sm font-medium text-cream/55">
              disponibles
            </span>
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onOpenRedeem}
        className="flex items-center gap-1 rounded-full border border-amber/30 bg-amber/10 px-3 py-2 text-xs font-semibold text-amber transition-colors hover:bg-amber hover:text-ink active:scale-95"
      >
        Canjear
        <ChevronRight className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
