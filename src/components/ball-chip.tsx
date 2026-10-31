import { cn } from "@/lib/cn";

const palette = ["#FFB703", "#FF5D5D", "#78E0B4", "#7DD3FC", "#F5E9D6"];
const sizes = {
  sm: {
    outer: "size-8",
    inner: "size-5",
    text: "text-[10px]",
  },
  md: {
    outer: "size-10",
    inner: "size-6",
    text: "text-xs",
  },
};

export function BallChip({
  n,
  size = "md",
  className,
}: {
  n: number;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const color = palette[(n - 1) % palette.length];
  const s = sizes[size];

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full shadow-[inset_0_-3px_0_rgba(0,0,0,0.18)]",
        s.outer,
        className,
      )}
      style={{ backgroundColor: color }}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-full bg-cream font-display font-black leading-none text-ink",
          s.inner,
          s.text,
        )}
      >
        {n > 99 ? "99" : n}
      </span>
    </span>
  );
}
