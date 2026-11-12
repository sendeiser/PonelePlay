import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

const bars = [2, 1, 3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 1, 3, 1, 2];

export function TicketCode({
  code,
  credits,
  venueName,
  notchColor = "var(--bg-card)",
  printable = false,
  className,
}: {
  code: string;
  credits: number;
  venueName: string;
  notchColor?: string;
  printable?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-[#0f172a]/12 bg-[#fafaf9] text-[#0f172a] shadow-sm",
        printable && "print-ticket",
        className,
      )}
      style={{ "--ticket-notch": notchColor } as CSSProperties}
    >
      <div className="px-5 py-4">
        <div className="flex items-center justify-between gap-4 font-mono text-[9px] uppercase tracking-[0.22em] text-[#475569]">
          <span>PonelePlay</span>
          <span className="truncate">{venueName}</span>
        </div>

        <div className="my-3 border-t border-dashed border-[#0f172a]/20" />

        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#475569]">
              Código de votos
            </p>
            <p className="mt-1 truncate font-mono text-2xl font-bold tracking-[0.2em] text-[#0f172a]">
              {code}
            </p>
          </div>
          <div className="shrink-0 rounded-full bg-[#f59e0b] px-3 py-1.5 text-center text-[#0f172a]">
            <p className="font-display text-xl font-black leading-none">{credits}</p>
            <p className="font-mono text-[8px] uppercase tracking-wider">votos</p>
          </div>
        </div>

        <div className="mt-3 border-t border-dashed border-[#0f172a]/20" />

        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="flex h-7 items-end gap-[2px]" aria-hidden="true">
            {bars.map((width, index) => (
              <span
                key={index}
                className="w-[2px] bg-[#0f172a]/80"
                style={{ height: `${6 + width * 4}px` }}
              />
            ))}
          </div>
          <p className="max-w-[62%] text-right font-mono text-[8px] uppercase leading-tight tracking-wide text-[#475569]">
            Un uso · vence al cerrar la noche
          </p>
        </div>
      </div>

      <span className="absolute -left-2 top-1/2 size-4 -translate-y-1/2 rounded-full border border-[#0f172a]/12 bg-[var(--ticket-notch)] print:hidden" />
      <span className="absolute -right-2 top-1/2 size-4 -translate-y-1/2 rounded-full border border-[#0f172a]/12 bg-[var(--ticket-notch)] print:hidden" />
    </div>
  );
}
