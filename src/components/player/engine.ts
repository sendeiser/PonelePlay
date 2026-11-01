import type { PlayerTrack } from "@/lib/api/player";

export interface PlaybackEngine {
  load(track: PlayerTrack): Promise<void>;
  play(): Promise<void>;
  stop(): void;
  onEnded(cb: () => void): () => void;
  onError(cb: (reason: string) => void): () => void;
}

