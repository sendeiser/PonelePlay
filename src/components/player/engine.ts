import type { PlayerTrack } from "@/lib/api/player";

export interface PlaybackEngine {
  load(track: PlayerTrack): Promise<void>;
  play(): Promise<void>;
  pause?(): void;
  stop(): void;
  setVolume?(volume: number): void;
  unMute?(): void;
  mute?(): void;
  isMuted?(): boolean;
  getCurrentTime?(): number;
  getDuration?(): number;
  onEnded(cb: () => void): () => void;
  onError(cb: (reason: string) => void): () => void;
}

