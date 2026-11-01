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
    // 1. Check if already loaded or poll until available
    const check = () => {
      if (window.YT && window.YT.Player) {
        resolve();
        return true;
      }
      return false;
    };

    if (check()) return;

    const timer = setInterval(() => {
      if (check()) {
        clearInterval(timer);
      }
    }, 50);

    // Timeout safety fallback after 8 seconds
    setTimeout(() => {
      clearInterval(timer);
      resolve();
    }, 8000);

    // 2. Inject script if not present
    if (!document.getElementById("youtube-iframe-api")) {
      const tag = document.createElement("script");
      tag.id = "youtube-iframe-api";
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
    }

    const prevOnReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevOnReady?.();
      clearInterval(timer);
      resolve();
    };
  });
}

export function createYoutubeEngine(containerId: string): PlaybackEngine {
  let player: YTPlayerInstance | null = null;
  let endedCallbacks: Array<() => void> = [];
  let errorCallbacks: Array<(reason: string) => void> = [];

  function postToFallbackIframe(func: string, args: unknown[] = []) {
    const directIframe = document.getElementById(`${containerId}-direct`) as HTMLIFrameElement | null;
    if (directIframe?.contentWindow) {
      try {
        directIframe.contentWindow.postMessage(
          JSON.stringify({ event: "command", func, args }),
          "*"
        );
      } catch {}
    }
  }

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
        // Fallback classic music video (Soda Stereo - De Música Ligera)
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
            try {
              player.playVideo();
            } catch {}
            resolve();
          } catch (e) {
            triggerError(`Error loading video: ${e instanceof Error ? e.message : String(e)}`);
            resolve();
          }
          return;
        }

        const directIframe = document.getElementById(`${containerId}-direct`) as HTMLIFrameElement | null;
        if (directIframe) {
          const originParam = typeof window !== "undefined" ? `&origin=${encodeURIComponent(window.location.origin)}` : "";
          directIframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&enablejsapi=1${originParam}`;
          resolve();
          return;
        }

        const el = document.getElementById(containerId);
        if (!el) {
          triggerError(`Container element #${containerId} not found in DOM`);
          resolve();
          return;
        }

        if (!window.YT || !window.YT.Player) {
          triggerError("window.YT.Player is not defined or blocked by client");
          // Fallback direct iframe to bypass adblocker script restrictions
          try {
            const originParam = typeof window !== "undefined" ? `&origin=${encodeURIComponent(window.location.origin)}` : "";
            el.innerHTML = `<iframe id="${containerId}-direct" width="100%" height="100%" src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&enablejsapi=1${originParam}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="width:100%;height:100%;border:none;"></iframe>`;
          } catch {}
          resolve();
          return;
        }

        try {
          player = new window.YT.Player(containerId, {
            host: "https://www.youtube-nocookie.com",
            width: "100%",
            height: "100%",
            videoId,
            playerVars: {
              autoplay: 1,
              mute: 1,
              enablejsapi: 1,
              controls: 1,
              disablekb: 0,
              fs: 1,
              modestbranding: 1,
              rel: 0,
              playsinline: 1,
              origin: typeof window !== "undefined" ? window.location.origin : undefined,
              widget_referrer: typeof window !== "undefined" ? window.location.href : undefined,
            },
            events: {
              onReady: (ev) => {
                try {
                  ev.target.playVideo();
                } catch {
                  try {
                    ev.target.mute();
                    ev.target.playVideo();
                  } catch {}
                }
                resolve();
              },
              onStateChange: (event) => {
                if (event.data === window.YT.PlayerState.ENDED) {
                  triggerEnded();
                }
              },
              onError: (event) => {
                const code = event.data;
                triggerError(`YouTube player error: ${code}`);
                // If copyright restricted from embedding (101 or 150) or invalid id (2), skip to next track
                if (code === 150 || code === 101 || code === 2) {
                  setTimeout(() => triggerEnded(), 1200);
                }
              },
            },
          });
        } catch (err: unknown) {
          triggerError(`Exception creating YT.Player: ${err instanceof Error ? err.message : String(err)}`);
          try {
            const originParam = typeof window !== "undefined" ? `&origin=${encodeURIComponent(window.location.origin)}` : "";
            el.innerHTML = `<iframe id="${containerId}-direct" width="100%" height="100%" src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&enablejsapi=1${originParam}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="width:100%;height:100%;border:none;"></iframe>`;
          } catch {}
          resolve();
        }
      });
    },

    async play(): Promise<void> {
      if (player) {
        try {
          player.playVideo();
        } catch {}
      } else {
        postToFallbackIframe("playVideo");
      }
    },

    pause(): void {
      if (player) {
        try {
          player.pauseVideo();
        } catch {}
      } else {
        postToFallbackIframe("pauseVideo");
      }
    },

    stop(): void {
      if (player) {
        try {
          player.stopVideo();
        } catch {}
      } else {
        postToFallbackIframe("stopVideo");
      }
    },

    setVolume(volume: number): void {
      if (player) {
        try {
          player.setVolume(Math.max(0, Math.min(100, volume)));
        } catch {}
      } else {
        postToFallbackIframe("setVolume", [Math.max(0, Math.min(100, volume))]);
      }
    },

    unMute(): void {
      if (player) {
        try {
          player.unMute();
          player.setVolume(85);
          player.playVideo();
        } catch {}
      } else {
        postToFallbackIframe("unMute");
        postToFallbackIframe("setVolume", [85]);
        postToFallbackIframe("playVideo");
      }
    },

    mute(): void {
      if (player) {
        try {
          player.mute();
        } catch {}
      } else {
        postToFallbackIframe("mute");
      }
    },

    isMuted(): boolean {
      if (!player) return false;
      try {
        return player.isMuted();
      } catch {
        return false;
      }
    },

    getCurrentTime(): number {
      if (!player) return 0;
      try {
        return player.getCurrentTime() || 0;
      } catch {
        return 0;
      }
    },

    getDuration(): number {
      if (!player) return 0;
      try {
        return player.getDuration() || 0;
      } catch {
        return 0;
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
