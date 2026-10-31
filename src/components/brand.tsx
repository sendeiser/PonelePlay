import { cn } from "@/lib/cn";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-amber shadow-[inset_0_-3px_0_rgba(0,0,0,0.2)]",
        className,
      )}
    >
      <span className="flex size-6 items-center justify-center rounded-full bg-cream font-display text-xs font-black text-ink">
        P
      </span>
      <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-coral ring-2 ring-felt-950" />
    </span>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline font-display text-xl font-extrabold tracking-[-0.04em]",
        className,
      )}
    >
      Ponele<span className="text-amber">Play</span>
      <span className="ml-0.5 size-1.5 rounded-full bg-coral" />
    </span>
  );
}
