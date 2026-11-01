import type { PlaybackEngine } from "./engine";

/**
 * Single-player engine: controls the ONE visible YouTube <iframe> rendered by
 * React (via the postMessage IFrame API protocol) instead of creating a second,
 * hidden YT.Player. Which video is playing is driven by the iframe `src`
 * (React), so `load()` is a no-op here.
 */
export interface IframePlaybackEngine extends PlaybackEngine {
  /** Start listening to iframe messages. Returns a detach function. */
  attach(): () => void;
  /**
   * YouTube embed handshake. Must be sent (repeatedly until it answers) so the
   * iframe starts broadcasting infoDelivery (currentTime/duration/playerState).
   */
  handshake(): void;
  getCurrentTime(): number;
  getDuration(): number;
}

const YT_ENDED = 0;

export function createIframeEngine(
  getIframe: () => HTMLIFrameElement | null,
): IframePlaybackEngine {
  let endedCallbacks: Array<() => void> = [];
  let errorCallbacks: Array<(reason: string) => void> = [];

  let currentTime = 0;
  let duration = 0;
  let lastPlayerState: number | null = null;
  let lastSource: MessageEventSource | null = null;

  // Last explicitly requested audio state, re-applied whenever a new iframe
  // (new song) comes up, so volume/mute survive track changes.
  let desiredVolume: number | null = null;
  let desiredMuted: boolean | null = null;

  function post(func: string, args: unknown[] = []) {
    const win = getIframe()?.contentWindow;
    if (!win) return;
    try {
      win.postMessage(JSON.stringify({ event: "command", func, args }), "*");
    } catch {}
  }

  function reapplyAudioState() {
    if (desiredVolume !== null) post("setVolume", [desiredVolume]);
    if (desiredMuted === true) post("mute");
    else if (desiredMuted === false) post("unMute");
  }

  function handlePlayerState(state: number) {
    // Fire "ended" exactly once per transition (YouTube repeats state updates).
    if (state === YT_ENDED && lastPlayerState !== YT_ENDED) {
      endedCallbacks.forEach((cb) => cb());
    }
    lastPlayerState = state;
  }

  function onMessage(e: MessageEvent) {
    const iframeWin = getIframe()?.contentWindow;
    if (!iframeWin || e.source !== iframeWin) return;

    let data: { event?: string; info?: unknown } | null = null;
    try {
      data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
    } catch {
      return;
    }
    if (!data || typeof data !== "object") return;

    // A message from a different iframe window means a new song was mounted.
    if (e.source !== lastSource) {
      lastSource = e.source;
      currentTime = 0;
      duration = 0;
      lastPlayerState = null;
      reapplyAudioState();
    }

    if (data.event === "onReady") {
      reapplyAudioState();
      return;
    }

    if ((data.event === "infoDelivery" || data.event === "initialDelivery") && data.info) {
      const info = data.info as { currentTime?: number; duration?: number; playerState?: number };
      if (typeof info.currentTime === "number") currentTime = info.currentTime;
      if (typeof info.duration === "number" && info.duration > 0) duration = info.duration;
      if (typeof info.playerState === "number") handlePlayerState(info.playerState);
      return;
    }

    if (data.event === "onStateChange" && typeof data.info === "number") {
      handlePlayerState(data.info);
      return;
    }

    if (data.event === "onError") {
      const code = data.info;
      errorCallbacks.forEach((cb) => cb(`YouTube player error: ${String(code)}`));
    }
  }

  return {
    attach() {
      window.addEventListener("message", onMessage);
      return () => window.removeEventListener("message", onMessage);
    },

    handshake() {
      const win = getIframe()?.contentWindow;
      if (!win) return;
      try {
        win.postMessage(JSON.stringify({ event: "listening", id: "poneleplay-tv", channel: "widget" }), "*");
      } catch {}
      post("addEventListener", ["onStateChange"]);
      post("addEventListener", ["onError"]);
    },

    async load(): Promise<void> {
      // The visible iframe's `src` (rendered by React from nowPlaying) selects the video.
    },

    async play(): Promise<void> {
      post("playVideo");
    },

    pause(): void {
      post("pauseVideo");
    },

    stop(): void {
      post("stopVideo");
    },

    setVolume(volume: number): void {
      desiredVolume = Math.max(0, Math.min(100, volume));
      post("setVolume", [desiredVolume]);
    },

    seekTo(seconds: number): void {
      currentTime = Math.max(0, seconds);
      post("seekTo", [currentTime, true]);
    },

    mute(): void {
      desiredMuted = true;
      post("mute");
    },

    unMute(): void {
      desiredMuted = false;
      post("unMute");
    },

    isMuted(): boolean {
      return desiredMuted === true;
    },

    getCurrentTime(): number {
      return currentTime;
    },

    getDuration(): number {
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
