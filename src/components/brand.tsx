import { cn } from "@/lib/cn";

export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-th-accent text-white shadow-sm",
        className,
      )}
    >
      <span
        className="material-symbols-outlined text-[20px]"
        style={{ fontVariationSettings: "'FILL' 1" }}
      >
        graphic_eq
      </span>
      <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-th-emerald ring-2 ring-th-shell animate-pulse" />
    </div>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline font-display font-bold tracking-tight text-th-text",
        className,
      )}
    >
      Ponele
      <span className="text-th-accent font-extrabold ml-0.5">Play</span>
    </span>
  );
}
