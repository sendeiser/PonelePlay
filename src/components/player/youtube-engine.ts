import type { PlaybackEngine } from "./engine";
import type { PlayerTrack } from "@/lib/api/player";
import type { YTPlayerInstance } from "@/types/youtube";
import { parseYoutubeVideoId } from "@/lib/domain/youtube";

export function loadYoutubeIframeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();

  if (window.YT && window.YT.Player) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const existingScript = document.getElementById("youtube-iframe-api");
    if (!existingScript) {
      const tag = document.createElement("script");
      tag.id = "youtube-iframe-api";
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
    }

    const prevOnReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevOnReady?.();
      resolve();
    };
  });
}

export function createYoutubeEngine(containerId: string): PlaybackEngine {
  let player: YTPlayerInstance | null = null;
  let endedCallbacks: Array<() => void> = [];
  let errorCallbacks: Array<(reason: string) => void> = [];

  function triggerEnded() {
    endedCallbacks.forEach((cb) => cb());
  }

  function triggerError(reason: string) {
    errorCallbacks.forEach((cb) => cb(reason));
  }

  return {
    async load(track: PlayerTrack): Promise<void> {
      let videoId = track.youtubeVideoId?.trim() || "";
      if (!videoId || videoId.startsWith("demo-")) {
        // Fallback classic video for demo
        videoId = "T_FkEw27XJ0";
      } else {
        const parsed = parseYoutubeVideoId(videoId);
        if (parsed) {
          videoId = parsed;
        }
      }

      await loadYoutubeIframeApi();

      return new Promise<void>((resolve) => {
        if (player) {
          try {
            player.loadVideoById(videoId);
            resolve();
          } catch (e) {
            triggerError(`Error loading video: ${e instanceof Error ? e.message : String(e)}`);
            resolve();
          }
          return;
        }

        const el = document.getElementById(containerId);
        if (!el) {
          triggerError(`Container element #${containerId} not found`);
          resolve();
          return;
        }

        player = new window.YT.Player(containerId, {
          videoId,
          playerVars: {
            autoplay: 1,
            controls: 1,
            disablekb: 0,
            fs: 1,
            modestbranding: 1,
            rel: 0,
            origin: typeof window !== "undefined" ? window.location.origin : undefined,
          },
          events: {
            onReady: (ev) => {
              try {
                ev.target.playVideo();
              } catch {}
              resolve();
            },
            onStateChange: (event) => {
              if (event.data === window.YT.PlayerState.ENDED) {
                triggerEnded();
              }
            },
            onError: (event) => {
              triggerError(`YouTube player error: ${event.data}`);
            },
          },
        });
      });
    },

    async play(): Promise<void> {
      if (player) {
        player.playVideo();
      }
    },

    pause(): void {
      if (player) {
        player.pauseVideo();
      }
    },

    stop(): void {
      if (player) {
        player.stopVideo();
      }
    },

    setVolume(volume: number): void {
      if (player) {
        player.setVolume(Math.max(0, Math.min(100, volume)));
      }
    },

    unMute(): void {
      if (player) {
        player.unMute();
      }
    },

    mute(): void {
      if (player) {
        player.mute();
      }
    },

    isMuted(): boolean {
      return player ? player.isMuted() : false;
    },

    getCurrentTime(): number {
      return player ? player.getCurrentTime() : 0;
    },

    getDuration(): number {
      return player ? player.getDuration() : 0;
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
