import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

const bars = [2, 1, 3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 1, 3, 1, 2];

export function TicketCode({
  code,
  credits,
  venueName,
  notchColor = "#041611",
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
        "relative overflow-hidden rounded-2xl bg-cream text-ink",
        printable && "print-ticket",
        className,
      )}
      style={{ "--ticket-notch": notchColor } as CSSProperties}
    >
      <div className="px-5 py-4">
        <div className="flex items-center justify-between gap-4 font-mono text-[9px] uppercase tracking-[0.22em] text-ink/55">
          <span>PonelePlay</span>
          <span className="truncate">{venueName}</span>
        </div>

        <div className="my-3 border-t border-dashed border-ink/25" />

        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink/55">
              Código de votos
            </p>
            <p className="mt-1 truncate font-mono text-2xl font-bold tracking-[0.2em]">
              {code}
            </p>
          </div>
          <div className="shrink-0 rounded-full bg-amber px-3 py-1.5 text-center">
            <p className="font-display text-xl font-black leading-none">{credits}</p>
            <p className="font-mono text-[8px] uppercase tracking-wider">votos</p>
          </div>
        </div>

        <div className="mt-3 border-t border-dashed border-ink/25" />

        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="flex h-7 items-end gap-[2px]" aria-hidden="true">
            {bars.map((width, index) => (
              <span
                key={index}
                className="w-[2px] bg-ink/80"
                style={{ height: `${6 + width * 4}px` }}
              />
            ))}
          </div>
          <p className="max-w-[62%] text-right font-mono text-[8px] uppercase leading-tight tracking-wide text-ink/55">
            Un uso · vence al cerrar la noche
          </p>
        </div>
      </div>

      <span className="absolute -left-2 top-1/2 size-4 -translate-y-1/2 rounded-full bg-[var(--ticket-notch)] print:hidden" />
      <span className="absolute -right-2 top-1/2 size-4 -translate-y-1/2 rounded-full bg-[var(--ticket-notch)] print:hidden" />
    </div>
  );
}
