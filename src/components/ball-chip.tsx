import { cn } from "@/lib/cn";

export function BallChip({
  n,
  size = "md",
  className,
}: {
  n: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const isFirst = n === 1;
  const isSecond = n === 2;
  const isThird = n === 3;

  const sizeClasses = {
    sm: "size-7 text-[11px] rounded-lg",
    md: "size-9 text-xs rounded-xl",
    lg: "size-11 text-sm rounded-xl font-bold",
  }[size];

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center font-mono font-bold tabular-nums select-none",
        sizeClasses,
        isFirst
          ? "bg-th-accent text-white shadow-sm"
          : isSecond
            ? "bg-th-teal-soft border border-th-teal/30 text-th-teal"
            : isThird
              ? "bg-th-accent-soft border border-th-accent/30 text-th-accent"
              : "bg-th-recessed border border-th-border text-th-muted",
        className,
      )}
    >
      #{n > 99 ? "99" : n}
    </span>
  );
}
