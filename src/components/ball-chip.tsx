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
        "relative inline-flex shrink-0 items-center justify-center font-mono font-bold select-none",
        sizeClasses,
        isFirst
          ? "bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-700 text-white shadow-md shadow-indigo-600/35 border border-indigo-400/40"
          : isSecond
            ? "bg-[#1e2438] border border-[#3b476b] text-[#4cd7f6] shadow-sm"
            : isThird
              ? "bg-[#181f33] border border-[#2c3755] text-[#c0c1ff]"
              : "bg-[#131722] border border-[#1e2333] text-slate-400",
        className,
      )}
    >
      #{n > 99 ? "99" : n}
    </span>
  );
}
