import { cn } from "@/lib/cn";

export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/25",
        className,
      )}
    >
      <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
        graphic_eq
      </span>
      <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-tertiary ring-2 ring-[#0f131c] animate-pulse" />
    </div>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline font-sans font-bold tracking-tight text-white",
        className,
      )}
    >
      Ponele
      <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent font-extrabold ml-0.5">
        Play
      </span>
    </span>
  );
}
