import { FileAudio, Music2, Play } from "lucide-react";
import { cn } from "@/lib/cn";

export type TrackSource = "youtube" | "upload" | "spotify";

export function SourceBadge({
  source,
  className,
  label = true,
}: {
  source: TrackSource;
  className?: string;
  label?: boolean;
}) {
  const Icon =
    source === "youtube" ? Play : source === "upload" ? FileAudio : Music2;

  const labelText =
    source === "youtube" ? "YouTube" : source === "upload" ? "MP3" : "Spotify";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-cream/10 bg-felt-950/50 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-cream/55",
        className,
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {label ? labelText : null}
    </span>
  );
}
