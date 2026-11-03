import type { PlaybackEngine } from "./engine";
import type { PlayerTrack } from "@/lib/api/player";
import type { YTPlayerInstance } from "@/types/youtube";
import { parseYoutubeVideoId } from "@/lib/domain/youtube";
import { loadYoutubeIframeApi } from "./youtube-engine";

export interface IframePlaybackEngine extends PlaybackEngine {
  /** Start listening to iframe messages and attach YT.Player bridge. */
  attach(): () => void;
  /** Called when the <iframe> fires onLoad. */
  handshake(): void;
  /** True once YouTube's JS bridge (YT.Player or infoDelivery) is actively reporting. */
  hasLiveTime(): boolean;
  getCurrentTime(): number;
  getDuration(): number;
  /** Build the initial embed URL for a track. */
  buildEmbedUrl(videoId: string, startSeconds?: number): string;
}

const YT_ENDED = 0;
const YT_PLAYING = 1;
const YT_PAUSED = 2;

export function resolveVideoId(track?: PlayerTrack | null): string {
  const raw = track?.youtubeVideoId?.trim() || "";
  if (!raw || raw.startsWith("demo-")) return "T_FkEw27XJ0";
  return parseYoutubeVideoId(raw) || raw;
}

export function createIframeEngine(
  getIframe: () => HTMLIFrameElement | null,
  onPlayStateChange?: (isPlaying: boolean) => void,
): IframePlaybackEngine {
  let endedCallbacks: Array<() => void> = [];
  let errorCallbacks: Array<(reason: string) => void> = [];

  let ytPlayer: YTPlayerInstance | null = null;
  let ytReady = false;
  let hasLiveBridge = false;
  let boundIframe: HTMLIFrameElement | null = null;
  let capturedWidgetId: number | string = 1;

  let currentVideoId = "";
  let currentTime = 0;
  let duration = 0;
  let seekLockUntil = 0;
  let lastPlayerState: number | null = null;

  let desiredVolume: number | null = 85;
  let desiredMuted: boolean | null = true;
  let desiredPlaying = true;

  function buildEmbedUrl(videoId: string, startSeconds = 0): string {
    const cleanId = parseYoutubeVideoId(videoId) || videoId || "T_FkEw27XJ0";
    if (!currentVideoId) {
      currentVideoId = cleanId;
    }
    const origin =
      typeof window !== "undefined" ? encodeURIComponent(window.location.origin) : "";
    const startParam = startSeconds > 0 ? `&start=${Math.floor(startSeconds)}` : "";
    const originParam = origin ? `&origin=${origin}&widget_referrer=${origin}` : "";
    return `https://www.youtube.com/embed/${cleanId}?autoplay=1&enablejsapi=1&controls=0&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&disablekb=1&widgetid=1${startParam}${originParam}`;
  }

  function post(func: string, args: unknown[] = []) {
    const iframe = getIframe();
    const win = iframe?.contentWindow;
    if (!win) return;
    const iframeId = iframe?.id || "poneleplay-tv-iframe";
    try {
      // 1. Direct standard command
      win.postMessage(JSON.stringify({ event: "command", func, args }), "*");
      // 2. Widget protocol with captured widget ID
      win.postMessage(
        JSON.stringify({ event: "command", func, args, id: capturedWidgetId, channel: "widget" }),
        "*",
      );
      // 3. Widget protocol with DOM ID
      win.postMessage(
        JSON.stringify({ event: "command", func, args, id: iframeId, channel: "widget" }),
        "*",
      );
    } catch {}
  }

  function sendListeningHandshake() {
    const iframe = getIframe();
    const win = iframe?.contentWindow;
    if (!win) return;
    const iframeId = iframe?.id || "poneleplay-tv-iframe";
    try {
      win.postMessage(JSON.stringify({ event: "listening" }), "*");
      win.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "*");
      win.postMessage(
        JSON.stringify({ event: "listening", id: capturedWidgetId, channel: "widget" }),
        "*",
      );
      win.postMessage(
        JSON.stringify({ event: "listening", id: iframeId, channel: "widget" }),
        "*",
      );
    } catch {}
  }

  function reapplyAudioAndPlayState() {
    if (desiredVolume !== null) {
      try {
        if (ytReady && ytPlayer) ytPlayer.setVolume(desiredVolume);
      } catch {}
      post("setVolume", [desiredVolume]);
    }
    if (desiredMuted === true) {
      try {
        if (ytReady && ytPlayer) ytPlayer.mute();
      } catch {}
      post("mute");
    } else if (desiredMuted === false) {
      try {
        if (ytReady && ytPlayer) ytPlayer.unMute();
      } catch {}
      post("unMute");
    }
    if (desiredPlaying) {
      try {
        if (ytReady && ytPlayer) ytPlayer.playVideo();
      } catch {}
      post("playVideo");
    } else {
      try {
        if (ytReady && ytPlayer) ytPlayer.pauseVideo();
      } catch {}
      post("pauseVideo");
    }
  }

  function handlePlayerState(state: number) {
    if (state === YT_PLAYING) {
      desiredPlaying = true;
      onPlayStateChange?.(true);
    } else if (state === YT_PAUSED) {
      onPlayStateChange?.(false);
    } else if (state === YT_ENDED && lastPlayerState !== YT_ENDED) {
      endedCallbacks.forEach((cb) => cb());
    }
    lastPlayerState = state;
  }

  function bindYtPlayerToIframe(forceRebind = false) {
    const iframe = getIframe();
    if (!iframe || typeof window === "undefined") return;
    if (!forceRebind && boundIframe === iframe) return;
    boundIframe = iframe;

    void loadYoutubeIframeApi().then(() => {
      if (!window.YT || !window.YT.Player) return;
      const currentIframe = getIframe();
      if (!currentIframe) return;

      ytPlayer = null;
      ytReady = false;

      try {
        ytPlayer = new window.YT.Player(currentIframe, {
          events: {
            onReady: () => {
              ytReady = true;
              hasLiveBridge = true;
              reapplyAudioAndPlayState();
            },
            onStateChange: (ev) => {
              hasLiveBridge = true;
              if (typeof ev.data === "number") {
                handlePlayerState(ev.data);
              }
            },
            onError: (ev) => {
              const code = ev.data;
              errorCallbacks.forEach((cb) =>
                cb(`YouTube player error: ${String(code)}`),
              );
              if (code === 150 || code === 101 || code === 2) {
                setTimeout(() => {
                  endedCallbacks.forEach((cb) => cb());
                }, 1200);
              }
            },
          },
        });
      } catch {
        boundIframe = null;
      }
    });
  }

  function onMessage(e: MessageEvent) {
    const iframe = getIframe();
    const iframeWin = iframe?.contentWindow;
    const isYoutubeOrigin =
      typeof e.origin === "string" &&
      (e.origin.includes("youtube.com") || e.origin.includes("youtube-nocookie.com"));
    const isOurIframe = iframeWin && e.source === iframeWin;
    if (!isOurIframe && !isYoutubeOrigin) return;

    let data: { event?: string; info?: unknown; id?: number | string } | null = null;
    try {
      data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
    } catch {
      return;
    }
    if (!data || typeof data !== "object") return;

    if (data.id !== undefined && data.id !== null) {
      capturedWidgetId = data.id;
    }

    if (data.event === "onReady") {
      hasLiveBridge = true;
      reapplyAudioAndPlayState();
      return;
    }

    if (
      (data.event === "infoDelivery" || data.event === "initialDelivery") &&
      data.info
    ) {
      hasLiveBridge = true;
      const info = data.info as {
        currentTime?: number;
        duration?: number;
        playerState?: number;
        videoData?: { video_id?: string };
      };
      if (typeof info.currentTime === "number" && Date.now() >= seekLockUntil) {
        currentTime = info.currentTime;
      }
      if (typeof info.duration === "number" && info.duration > 0) {
        duration = info.duration;
      }
      if (typeof info.playerState === "number") {
        handlePlayerState(info.playerState);
      }
      return;
    }

    if (data.event === "onStateChange" && typeof data.info === "number") {
      hasLiveBridge = true;
      handlePlayerState(data.info);
      return;
    }

    if (data.event === "onError") {
      const code = data.info;
      errorCallbacks.forEach((cb) => cb(`YouTube player error: ${String(code)}`));
    }
  }

  return {
    buildEmbedUrl,

    attach() {
      window.addEventListener("message", onMessage);
      return () => {
        window.removeEventListener("message", onMessage);
      };
    },

    handshake() {
      sendListeningHandshake();
      post("addEventListener", ["onStateChange"]);
      post("addEventListener", ["onError"]);
      if (!ytReady) {
        bindYtPlayerToIframe();
      }
    },

    async load(track: PlayerTrack): Promise<void> {
      const nextVideoId = resolveVideoId(track);
      if (nextVideoId === currentVideoId && currentVideoId !== "") {
        return;
      }

      currentVideoId = nextVideoId;
      currentTime = 0;
      duration = track.durationSeconds ?? 0;
      lastPlayerState = null;
      seekLockUntil = Date.now() + 1500;
      desiredPlaying = true;

      if (ytReady && ytPlayer) {
        try {
          ytPlayer.loadVideoById(nextVideoId);
          ytPlayer.playVideo();
          reapplyAudioAndPlayState();
          return;
        } catch {}
      }

      const iframe = getIframe();
      if (iframe) {
        // Send postMessage load command
        post("loadVideoById", [nextVideoId, 0]);
        post("playVideo");

        // Also update iframe.src directly to guarantee video switch
        const targetSrc = buildEmbedUrl(nextVideoId, 0);
        if (!iframe.src || !iframe.src.includes(nextVideoId)) {
          iframe.src = targetSrc;
        }
      }
    },

    async play(): Promise<void> {
      desiredPlaying = true;
      if (ytReady && ytPlayer) {
        try {
          ytPlayer.playVideo();
        } catch {}
      }
      post("playVideo");
    },

    pause(): void {
      desiredPlaying = false;
      if (ytReady && ytPlayer) {
        try {
          ytPlayer.pauseVideo();
        } catch {}
      }
      post("pauseVideo");
    },

    stop(): void {
      desiredPlaying = false;
      if (ytReady && ytPlayer) {
        try {
          ytPlayer.stopVideo();
        } catch {}
      }
      post("stopVideo");
    },

    setVolume(volume: number): void {
      desiredVolume = Math.max(0, Math.min(100, volume));
      if (desiredVolume > 0 && desiredMuted) {
        desiredMuted = false;
        if (ytReady && ytPlayer) {
          try {
            ytPlayer.unMute();
          } catch {}
        }
        post("unMute");
      }
      if (ytReady && ytPlayer) {
        try {
          ytPlayer.setVolume(desiredVolume);
        } catch {}
      }
      post("setVolume", [desiredVolume]);
    },

    seekTo(seconds: number): void {
      const target = Math.max(0, Math.floor(seconds));
      currentTime = target;
      seekLockUntil = Date.now() + 2000;

      if (ytReady && ytPlayer) {
        try {
          ytPlayer.seekTo(target, true);
        } catch {}
      }

      post("seekTo", [target, true]);

      // Fallback: If not bridged, reload iframe directly at seek position
      if (!hasLiveBridge && !ytReady) {
        const iframe = getIframe();
        if (iframe && currentVideoId) {
          boundIframe = null;
          iframe.src = buildEmbedUrl(currentVideoId, target);
        }
      }
    },

    mute(): void {
      desiredMuted = true;
      if (ytReady && ytPlayer) {
        try {
          ytPlayer.mute();
        } catch {}
      }
      post("mute");
    },

    unMute(): void {
      desiredMuted = false;
      if (ytReady && ytPlayer) {
        try {
          ytPlayer.unMute();
          if (desiredVolume !== null) ytPlayer.setVolume(desiredVolume);
        } catch {}
      }
      post("unMute");
      if (desiredVolume !== null) post("setVolume", [desiredVolume]);
    },

    isMuted(): boolean {
      if (ytReady && ytPlayer) {
        try {
          return ytPlayer.isMuted();
        } catch {}
      }
      return desiredMuted === true;
    },

    hasLiveTime(): boolean {
      return hasLiveBridge || ytReady;
    },

    getCurrentTime(): number {
      if (Date.now() < seekLockUntil) {
        return currentTime;
      }
      if (ytReady && ytPlayer) {
        try {
          const t = ytPlayer.getCurrentTime();
          if (typeof t === "number" && !isNaN(t) && t >= 0) {
            currentTime = t;
            return t;
          }
        } catch {}
      }
      return currentTime;
    },

    getDuration(): number {
      if (ytReady && ytPlayer) {
        try {
          const d = ytPlayer.getDuration();
          if (typeof d === "number" && !isNaN(d) && d > 0) {
            duration = d;
            return d;
          }
        } catch {}
      }
      return duration;
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
