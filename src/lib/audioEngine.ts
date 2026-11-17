import { Song } from '../types/jukebox';

declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string,
        options: {
          videoId: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: (event: { target: YTPlayerInstance }) => void;
            onStateChange?: (event: { data: number; target: YTPlayerInstance }) => void;
          };
        }
      ) => YTPlayerInstance;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

export interface YTPlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (volume: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy: () => void;
}

const audioUrlCache = new Map<string, string | null>();
let ytApiLoadingPromise: Promise<void> | null = null;

export function isRealYoutubeId(id: string | null | undefined): id is string {
  if (!id || id.startsWith('yt_') || id.startsWith('http')) return false;
  return /^[A-Za-z0-9_-]{11}$/.test(id);
}

export function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (ytApiLoadingPromise) return ytApiLoadingPromise;

  ytApiLoadingPromise = new Promise<void>((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });

  return ytApiLoadingPromise;
}

export async function resolvePlayableAudioUrl(song: Song): Promise<string | null> {
  if (song.youtubeVideoId && song.youtubeVideoId.startsWith('https://')) {
    return song.youtubeVideoId;
  }

  const cacheKey = `${song.id}:${song.title}:${song.artist}`;
  if (audioUrlCache.has(cacheKey)) {
    return audioUrlCache.get(cacheKey) ?? null;
  }

  try {
    const query = `${song.title.replace(/\(.*?\)/g, '').trim()} ${song.artist.split('&')[0].trim()}`;
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=1`
    );
    if (res.ok) {
      const payload = (await res.json()) as { results?: Array<{ previewUrl?: string }> };
      const url = payload.results?.[0]?.previewUrl ?? null;
      audioUrlCache.set(cacheKey, url);
      return url;
    }
  } catch {
    // ignore offline/network errors
  }

  audioUrlCache.set(cacheKey, null);
  return null;
}

export class StudioSynthLoop {
  private ctx: AudioContext | null = null;
  private timer: number | null = null;
  private step = 0;

  start(volumePercent: number) {
    if (this.timer !== null || typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = this.ctx ?? new AudioCtx();
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }

    const chordNotes = [220, 261.63, 329.63, 392.0, 293.66, 349.23];
    const playStep = () => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const level = Math.max(0.01, (volumePercent / 100) * 0.08);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(chordNotes[this.step % chordNotes.length], now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(level, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.45);
      this.step += 1;
    };

    playStep();
    this.timer = window.setInterval(playStep, 500);
  }

  stop() {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }
}
