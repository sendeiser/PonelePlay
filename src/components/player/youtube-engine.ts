import type { PlaybackEngine } from "./engine";
import type { PlayerTrack } from "@/lib/api/player";
import type { YTPlayerInstance } from "@/types/youtube";

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
      if (!track.youtubeVideoId) {
        triggerError("No youtubeVideoId provided");
        return;
      }

      await loadYoutubeIframeApi();

      return new Promise<void>((resolve) => {
        if (player) {
          player.loadVideoById(track.youtubeVideoId!);
          resolve();
          return;
        }

        player = new window.YT.Player(containerId, {
          videoId: track.youtubeVideoId ?? undefined,
          playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            rel: 0,
            origin: typeof window !== "undefined" ? window.location.origin : undefined,
          },
          events: {
            onReady: () => {
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

    stop(): void {
      if (player) {
        player.stopVideo();
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

