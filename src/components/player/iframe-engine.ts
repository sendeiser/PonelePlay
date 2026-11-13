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
  /** Cue track silently at startSeconds without starting playback (used by Ready-Barrier). */
  cue(track: PlayerTrack, startSeconds?: number): Promise<void>;
  /** Subscribe to track cued/buffered readiness for Ready-Barrier coordination. */
  onCued(cb: (videoId: string) => void): () => void;
  /** True once YouTube's JS bridge (YT.Player or infoDelivery) is actively reporting. */
  hasLiveTime(): boolean;
  getCurrentTime(): number;
  getDuration(): number;
  /** Build the initial embed URL for a track. */
  buildEmbedUrl(videoId: string, startSeconds?: number, autoplay?: boolean): string;
}

const YT_ENDED = 0;
const YT_PLAYING = 1;
const YT_PAUSED = 2;
const YT_CUED = 5;

export function resolveVideoId(track?: PlayerTrack | null): string {
  const raw = track?.youtubeVideoId?.trim() || "";
  if (!raw || raw.startsWith("demo-")) return "T_FkEw27XJ0";
  return parseYoutubeVideoId(raw) || raw;
}

export function createIframeEngine(
  getIframe: () => HTMLIFrameElement | null,
  onPlayStateChange?: (isPlaying: boolean) => void,
  onTrackFirstPlaying?: (videoId: string) => void,
): IframePlaybackEngine {
  let endedCallbacks: Array<() => void> = [];
  let errorCallbacks: Array<(reason: string) => void> = [];
  let cuedCallbacks: Array<(videoId: string) => void> = [];

  let ytPlayer: YTPlayerInstance | null = null;
  let ytReady = false;
  let hasLiveBridge = false;
  let boundIframe: HTMLIFrameElement | null = null;
  let capturedWidgetId: number | string = 1;

  let currentVideoId = "";
  let cuedNotifiedVideoId = "";
  let currentTime = 0;
  let lastTimeUpdateAt = 0;
  let duration = 0;
  let seekLockUntil = 0;
  let lastPlayerState: number | null = null;
  let hasPlayedCurrentVideo = false;
  let pendingSeekSeconds: number | null = null;

  let desiredVolume: number | null = 85;
  let desiredMuted: boolean | null = true;
  let desiredPlaying = true;
  let isPrebuffering = false;
  let prebufferStartSec = 0;
  let cueStartedAt = 0;

  function buildEmbedUrl(videoId: string, startSeconds = 0, autoplay = true): string {
    const cleanId = parseYoutubeVideoId(videoId) || videoId || "T_FkEw27XJ0";
    if (!currentVideoId) {
      currentVideoId = cleanId;
    }
    const origin =
      typeof window !== "undefined" ? encodeURIComponent(window.location.origin) : "";
    const startParam = startSeconds > 0 ? `&start=${Math.floor(startSeconds)}` : "";
    const originParam = origin ? `&origin=${origin}&widget_referrer=${origin}` : "";
    return `https://www.youtube.com/embed/${cleanId}?autoplay=${autoplay ? 1 : 0}&enablejsapi=1&controls=0&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&disablekb=1&widgetid=1${startParam}${originParam}`;
  }

  function post(func: string, args: unknown[] = []) {
    const iframe = getIframe();
    const win = iframe?.contentWindow;
    if (!win) return;
    try {
      win.postMessage(
        JSON.stringify({ event: "command", func, args, id: capturedWidgetId, channel: "widget" }),
        "*",
      );
    } catch {}
  }

  function sendListeningHandshake() {
    const iframe = getIframe();
    const win = iframe?.contentWindow;
    if (!win) return;
    try {
      win.postMessage(
        JSON.stringify({ event: "listening", id: capturedWidgetId, channel: "widget" }),
        "*",
      );
    } catch {}
  }

  function reapplyAudioAndPlayState() {
    if (isPrebuffering) {
      if (ytReady && ytPlayer) {
        try {
          ytPlayer.mute();
          ytPlayer.setVolume(0);
        } catch {}
      } else {
        post("mute");
        post("setVolume", [0]);
      }
      return;
    }
    if (desiredVolume !== null) {
      if (ytReady && ytPlayer) {
        try {
          ytPlayer.setVolume(desiredVolume);
        } catch {}
      } else {
        post("setVolume", [desiredVolume]);
      }
    }
    if (desiredMuted === true) {
      if (ytReady && ytPlayer) {
        try {
          ytPlayer.mute();
        } catch {}
      } else {
        post("mute");
      }
    } else if (desiredMuted === false) {
      if (ytReady && ytPlayer) {
        try {
          ytPlayer.unMute();
        } catch {}
      } else {
        post("unMute");
      }
    }
    if (desiredPlaying) {
      if (ytReady && ytPlayer) {
        try {
          ytPlayer.playVideo();
        } catch {}
      } else {
        post("playVideo");
      }
    } else {
      if (ytReady && ytPlayer) {
        try {
          ytPlayer.pauseVideo();
        } catch {}
      } else {
        post("pauseVideo");
      }
    }
  }

  function handlePlayerState(state: number) {
    if (isPrebuffering) {
      if (state === YT_PLAYING) {
        isPrebuffering = false;
        desiredPlaying = false;
        pendingSeekSeconds = null;
        lastTimeUpdateAt = 0;
        if (ytReady && ytPlayer) {
          try {
            ytPlayer.pauseVideo();
            ytPlayer.seekTo(prebufferStartSec, true);
          } catch {}
        } else {
          post("pauseVideo");
          post("seekTo", [prebufferStartSec, true]);
        }
        if (currentVideoId && cuedNotifiedVideoId !== currentVideoId) {
          cuedNotifiedVideoId = currentVideoId;
          cuedCallbacks.forEach((cb) => cb(currentVideoId));
        }
        return;
      }
      if (
        state === YT_PAUSED &&
        currentVideoId &&
        cuedNotifiedVideoId !== currentVideoId &&
        Date.now() - cueStartedAt > 250
      ) {
        isPrebuffering = false;
        cuedNotifiedVideoId = currentVideoId;
        cuedCallbacks.forEach((cb) => cb(currentVideoId));
      }
      return;
    }

    if (
      (state === YT_CUED || state === YT_PAUSED || state === YT_PLAYING) &&
      currentVideoId &&
      cuedNotifiedVideoId !== currentVideoId
    ) {
      cuedNotifiedVideoId = currentVideoId;
      cuedCallbacks.forEach((cb) => cb(currentVideoId));
    }

    if (state === YT_PLAYING) {
      desiredPlaying = true;
      if (lastTimeUpdateAt === 0) {
        lastTimeUpdateAt = Date.now();
      }
      onPlayStateChange?.(true);
      if (pendingSeekSeconds !== null) {
        const s = pendingSeekSeconds;
        pendingSeekSeconds = null;
        currentTime = s;
        lastTimeUpdateAt = Date.now();
        seekLockUntil = Date.now() + 650;
        if (ytReady && ytPlayer) {
          try {
            ytPlayer.seekTo(s, true);
          } catch {}
        } else {
          post("seekTo", [s, true]);
        }
      }
      if (!hasPlayedCurrentVideo && currentVideoId) {
        hasPlayedCurrentVideo = true;
        onTrackFirstPlaying?.(currentVideoId);
      }
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
        lastTimeUpdateAt = Date.now();
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
      if (!hasLiveBridge) {
        post("addEventListener", ["onStateChange"]);
        post("addEventListener", ["onError"]);
      }
      if (!ytReady) {
        bindYtPlayerToIframe();
      }
    },

    async load(track: PlayerTrack): Promise<void> {
      const nextVideoId = resolveVideoId(track);
      isPrebuffering = false;
      if (nextVideoId === currentVideoId && currentVideoId !== "") {
        return;
      }

      currentVideoId = nextVideoId;
      cuedNotifiedVideoId = "";
      currentTime = 0;
      lastTimeUpdateAt = 0;
      duration = track.durationSeconds ?? 0;
      lastPlayerState = null;
      hasPlayedCurrentVideo = false;
      pendingSeekSeconds = null;
      seekLockUntil = Date.now() + 1800;
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
        if (hasLiveBridge && iframe.src && iframe.src.includes("youtube.com/embed")) {
          post("loadVideoById", [{ videoId: nextVideoId, startSeconds: 0 }]);
          post("playVideo");
          reapplyAudioAndPlayState();
          return;
        }

        const targetSrc = buildEmbedUrl(nextVideoId, 0);
        if (!iframe.src || !iframe.src.includes(nextVideoId)) {
          boundIframe = null;
          iframe.src = targetSrc;
        }
      }
    },

    async cue(track: PlayerTrack, startSeconds = 0): Promise<void> {
      const nextVideoId = resolveVideoId(track);
      const startSec = Math.max(0, startSeconds);
      currentVideoId = nextVideoId;
      cuedNotifiedVideoId = "";
      currentTime = startSec;
      lastTimeUpdateAt = 0;
      duration = track.durationSeconds ?? 0;
      lastPlayerState = null;
      hasPlayedCurrentVideo = false;
      pendingSeekSeconds = startSec > 0 ? startSec : null;
      seekLockUntil = Date.now() + 1800;
      desiredPlaying = false;
      isPrebuffering = true;
      prebufferStartSec = startSec;
      cueStartedAt = Date.now();

      if (ytReady && ytPlayer) {
        try {
          ytPlayer.mute();
          ytPlayer.setVolume(0);
          ytPlayer.loadVideoById({ videoId: nextVideoId, startSeconds: startSec });
          return;
        } catch {}
      }

      const iframe = getIframe();
      if (iframe) {
        if (hasLiveBridge && iframe.src && iframe.src.includes("youtube.com/embed")) {
          post("mute");
          post("setVolume", [0]);
          post("loadVideoById", [{ videoId: nextVideoId, startSeconds: startSec }]);
          return;
        }
        const targetSrc = buildEmbedUrl(nextVideoId, startSec, true);
        if (!iframe.src || !iframe.src.includes(nextVideoId)) {
          boundIframe = null;
          iframe.src = targetSrc;
        }
      }
    },

    async play(): Promise<void> {
      isPrebuffering = false;
      desiredPlaying = true;
      if (ytReady && ytPlayer) {
        try {
          if (desiredMuted === true) {
            ytPlayer.mute();
          } else {
            ytPlayer.unMute();
            if (desiredVolume !== null) ytPlayer.setVolume(desiredVolume);
          }
          ytPlayer.playVideo();
          return;
        } catch {}
      }
      if (desiredMuted === true) {
        post("mute");
      } else {
        post("unMute");
        if (desiredVolume !== null) post("setVolume", [desiredVolume]);
      }
      post("playVideo");
    },

    pause(): void {
      isPrebuffering = false;
      desiredPlaying = false;
      if (ytReady && ytPlayer) {
        try {
          ytPlayer.pauseVideo();
          return;
        } catch {}
      }
      post("pauseVideo");
    },

    stop(): void {
      desiredPlaying = false;
      if (ytReady && ytPlayer) {
        try {
          ytPlayer.stopVideo();
          return;
        } catch {}
      }
      post("stopVideo");
    },

    setVolume(volume: number): void {
      const clamped = Math.max(0, Math.min(100, volume));
      desiredVolume = clamped;
      if (clamped > 0 && desiredMuted) {
        desiredMuted = false;
        if (ytReady && ytPlayer) {
          try {
            ytPlayer.unMute();
          } catch {}
        } else {
          post("unMute");
        }
      }
      if (ytReady && ytPlayer) {
        try {
          ytPlayer.setVolume(clamped);
          return;
        } catch {}
      }
      post("setVolume", [clamped]);
    },

    seekTo(seconds: number): void {
      const target = Math.max(0, Math.round(seconds * 1000) / 1000);
      currentTime = target;
      lastTimeUpdateAt = Date.now();
      seekLockUntil = Date.now() + 650;

      // If the player hasn't started playing yet, queue the seek for when YT_PLAYING fires
      // NEVER rewrite iframe.src inside seekTo (that destroys & reloads the iframe in a loop!)
      if (lastPlayerState !== YT_PLAYING && lastPlayerState !== YT_PAUSED && !ytReady) {
        pendingSeekSeconds = target;
        post("seekTo", [target, true]);
        return;
      }

      pendingSeekSeconds = null;
      if (ytReady && ytPlayer) {
        try {
          ytPlayer.seekTo(target, true);
          if (desiredPlaying && lastPlayerState !== YT_PLAYING) {
            ytPlayer.playVideo();
          }
          return;
        } catch {}
      }

      post("seekTo", [target, true]);
      if (desiredPlaying && lastPlayerState !== YT_PLAYING) {
        post("playVideo");
      }
    },

    mute(): void {
      desiredMuted = true;
      if (ytReady && ytPlayer) {
        try {
          ytPlayer.mute();
          return;
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
          return;
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
      return (hasLiveBridge || ytReady) && lastTimeUpdateAt > 0 && lastPlayerState === YT_PLAYING;
    },

    getCurrentTime(): number {
      if (Date.now() < seekLockUntil) {
        if ((desiredPlaying || lastPlayerState === YT_PLAYING) && lastTimeUpdateAt > 0) {
          const deltaSec = Math.max(0, Math.min(0.65, (Date.now() - lastTimeUpdateAt) / 1000));
          return currentTime + deltaSec;
        }
        return currentTime;
      }
      if (ytReady && ytPlayer) {
        try {
          const t = ytPlayer.getCurrentTime();
          if (typeof t === "number" && !isNaN(t) && t >= 0) {
            currentTime = t;
            lastTimeUpdateAt = Date.now();
            return t;
          }
        } catch {}
      }
      if (lastPlayerState === YT_PLAYING && lastTimeUpdateAt > 0) {
        const deltaSec = Math.max(0, Math.min(2.5, (Date.now() - lastTimeUpdateAt) / 1000));
        return currentTime + deltaSec;
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

    onCued(cb: (videoId: string) => void): () => void {
      cuedCallbacks.push(cb);
      return () => {
        cuedCallbacks = cuedCallbacks.filter((fn) => fn !== cb);
      };
    },
  };
}
