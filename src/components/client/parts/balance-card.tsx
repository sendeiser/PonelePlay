import { ChevronRight, Ticket } from "lucide-react";

interface BalanceCardProps {
  credits: number;
  onOpenRedeem: () => void;
}

export function BalanceCard({ credits, onOpenRedeem }: BalanceCardProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-th-amber/30 bg-th-amber-soft px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-th-amber text-white shadow-xs">
          <Ticket className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-th-amber">
            Tus votos
          </p>
          <p className="font-display text-xl font-bold leading-none text-th-text tabular-nums">
            {credits}{" "}
            <span className="text-sm font-medium text-th-secondary">
              disponibles
            </span>
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onOpenRedeem}
        className="flex items-center gap-1 rounded-full border border-th-amber/40 bg-th-card px-3 py-2 text-xs font-semibold text-th-amber transition-colors hover:bg-th-amber hover:text-white active:scale-95"
      >
        Canjear
        <ChevronRight className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

