import type { PlaybackEngine } from "./engine";
import type { PlayerTrack } from "@/lib/api/player";

export function createAudioEngine(): PlaybackEngine {
  let audio: HTMLAudioElement | null = null;
  let endedCallbacks: Array<() => void> = [];
  let errorCallbacks: Array<(reason: string) => void> = [];

  function ensureAudio() {
    if (!audio && typeof window !== "undefined") {
      audio = new Audio();
      audio.addEventListener("ended", () => {
        endedCallbacks.forEach((cb) => cb());
      });
      audio.addEventListener("error", () => {
        const message = audio?.error?.message || "Audio playback error";
        errorCallbacks.forEach((cb) => cb(message));
      });
    }
    return audio;
  }

  return {
    async load(track: PlayerTrack): Promise<void> {
      const el = ensureAudio();
      if (!el) return;

      const src = track.storagePath || "";
      if (!src) {
        errorCallbacks.forEach((cb) => cb("No storagePath or audio URL found"));
        return;
      }

      el.src = src;
      el.load();
    },

    async play(): Promise<void> {
      const el = ensureAudio();
      if (!el) return;
      await el.play();
    },

    stop(): void {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    },

    onEnded(cb: () => void): () => void {
      endedCallbacks.push(cb);
      return () => {
        endedCallbacks = endedCallbacks.filter((fn) => fn !== cb);
      };
    },

    onError(cb: (reason: string) => void): () => void {
      errorCallbacks.push(cb);
      return () => {
        errorCallbacks = errorCallbacks.filter((fn) => fn !== cb);
      };
    },
  };
}

