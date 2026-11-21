import React, { useEffect, useRef, useState } from 'react';
import {
  Pause,
  Play,
  SkipForward,
  Smartphone,
  Tv,
  Volume2,
  Music2,
} from 'lucide-react';
import {
  StudioSynthLoop,
  YTPlayerInstance,
  isRealYoutubeId,
  loadYouTubeIframeApi,
  resolvePlayableAudioUrl,
} from '../lib/audioEngine';
import { usePartyPreview } from '../context/PartyPreviewContext';
import { formatDurationMs } from '../data/mockPartyData';
import { ReactionEmoji } from '../types/jukebox';

const REACTION_BUTTONS: ReactionEmoji[] = ['🔥', '❤️', '🕺', '👎'];

export const NowPlayingHero: React.FC = () => {
  const {
    room,
    updateRoom,
    nowPlaying,
    demoRole,
    queue,
    floatingReactions,
    reactionCounts,
    sendReaction,
    skipCurrentTrack,
  } = usePartyPreview();

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ytPlayerRef = useRef<YTPlayerInstance | null>(null);
  const synthRef = useRef<StudioSynthLoop | null>(null);
  const explicitGestureRef = useRef(false);

  const [needsInteractionUnlock, setNeedsInteractionUnlock] = useState(false);
  const [liveProgressMs, setLiveProgressMs] = useState(room.progressMs);

  const isHost = demoRole === 'host';
  const isEmptyAutoplay = queue.length === 0;
  const coverUrl = nowPlaying?.song.imageUrl ?? '/covers/cover-synthwave.png';
  const currentDurationMs = nowPlaying?.song.durationMs ?? 204_000;
  const shouldOutputAudio = room.isPlaying && room.audioOutput === 'host_device';
  const displayProgressMs = liveProgressMs;
  const progressPercent = Math.min(
    100,
    Math.max(0, Math.round((displayProgressMs / Math.max(1, currentDurationMs)) * 100))
  );

  useEffect(() => {
    setLiveProgressMs(room.progressMs);
  }, [nowPlaying?.id, room.progressMs]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = Math.min(1, Math.max(0, room.volumePercent / 100));
    }
    try {
      ytPlayerRef.current?.setVolume(room.volumePercent);
    } catch {
      // ignore unready YT player
    }
  }, [room.volumePercent]);

  useEffect(() => {
    const song = nowPlaying?.song;
    const isWebdriver = typeof navigator !== 'undefined' && navigator.webdriver === true;

    const stopAll = () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      try {
        ytPlayerRef.current?.pauseVideo();
      } catch {
        // ignore unready YT player
      }
      synthRef.current?.stop();
    };

    if (!shouldOutputAudio || !song || (isWebdriver && !explicitGestureRef.current)) {
      stopAll();
      return;
    }

    let cancelled = false;
    let progressInterval: number | null = null;

    const startAudioStreamFallback = async () => {
      const streamUrl = await resolvePlayableAudioUrl(song);
      if (cancelled) return;

      const audioEl = audioRef.current;
      if (streamUrl && audioEl) {
        synthRef.current?.stop();
        if (audioEl.src !== streamUrl) {
          audioEl.src = streamUrl;
          audioEl.load();
        }
        audioEl.volume = Math.min(1, Math.max(0, room.volumePercent / 100));
        try {
          await audioEl.play();
          setNeedsInteractionUnlock(false);
        } catch (err) {
          const errName = err instanceof DOMException ? err.name : '';
          if (errName === 'NotAllowedError') {
            setNeedsInteractionUnlock(true);
          }
        }
        return;
      }

      if (explicitGestureRef.current) {
        synthRef.current = synthRef.current ?? new StudioSynthLoop();
        synthRef.current.start(room.volumePercent);
      }
    };

    const startPlayback = async () => {
      if (isRealYoutubeId(song.youtubeVideoId)) {
        if (audioRef.current) audioRef.current.pause();
        synthRef.current?.stop();
        await loadYouTubeIframeApi();
        if (cancelled || !window.YT?.Player) {
          await startAudioStreamFallback();
          return;
        }

        try {
          ytPlayerRef.current?.destroy();
        } catch {
          // ignore
        }

        ytPlayerRef.current = new window.YT.Player('yt-audio-only-mount', {
          videoId: song.youtubeVideoId,
          playerVars: {
            autoplay: 1,
            controls: 0,
            modestbranding: 1,
            playsinline: 1,
          },
          events: {
            onReady: (e) => {
              if (cancelled) return;
              e.target.setVolume(room.volumePercent);
              e.target.playVideo();
              setNeedsInteractionUnlock(false);
              progressInterval = window.setInterval(() => {
                if (cancelled) return;
                try {
                  const sec = ytPlayerRef.current?.getCurrentTime();
                  if (typeof sec === 'number' && Number.isFinite(sec) && sec >= 0) {
                    setLiveProgressMs(Math.floor(sec * 1000));
                  }
                } catch {
                  // ignore unready YT player
                }
              }, 500);
            },
            onStateChange: (e) => {
              if (e.data === 0 && !cancelled) {
                skipCurrentTrack();
              }
            },
            onError: () => {
              if (!cancelled) {
                void startAudioStreamFallback();
              }
            },
          },
        });
        return;
      }

      await startAudioStreamFallback();
    };

    void startPlayback();

    return () => {
      cancelled = true;
      if (progressInterval !== null) {
        window.clearInterval(progressInterval);
      }
      stopAll();
    };
  }, [nowPlaying?.id, nowPlaying?.song, shouldOutputAudio]);

  useEffect(() => {
    if (!room.isPlaying || !isHost) return;
    let sentinel: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    };
    if (nav.wakeLock?.request) {
      void nav.wakeLock
        .request('screen')
        .then((lock) => {
          sentinel = lock;
        })
        .catch(() => {
          // ignore unsupported / backgrounded wakeLock failures
        });
    }
    return () => {
      if (sentinel) {
        void sentinel.release().catch(() => {});
      }
    };
  }, [room.isPlaying, isHost]);

  const handleTogglePlay = () => {
    explicitGestureRef.current = true;
    const nextPlaying = !room.isPlaying;
    updateRoom({ isPlaying: nextPlaying });
    if (!nextPlaying) {
      audioRef.current?.pause();
      synthRef.current?.stop();
    }
  };

  const handleUnlockAudio = async () => {
    explicitGestureRef.current = true;
    setNeedsInteractionUnlock(false);
    if (audioRef.current) {
      try {
        await audioRef.current.play();
        return;
      } catch {
        // fallback synth if needed
      }
    }
    synthRef.current = synthRef.current ?? new StudioSynthLoop();
    synthRef.current.start(room.volumePercent);
  };

  const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isHost) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / Math.max(1, rect.width)));
    const nextMs = Math.round(ratio * currentDurationMs);
    setLiveProgressMs(nextMs);
    updateRoom({ progressMs: nextMs });
    if (audioRef.current && Number.isFinite(audioRef.current.duration) && audioRef.current.duration > 0) {
      audioRef.current.currentTime = ratio * audioRef.current.duration;
    }
    try {
      ytPlayerRef.current?.seekTo(nextMs / 1000, true);
    } catch {
      // ignore unready YT player
    }
  };

  return (
    <section
      aria-label="Reproductor Sonando Ahora"
      className="relative overflow-hidden rounded-3xl border border-stroke bg-card p-4 shadow-elevated sm:p-6"
    >
      {/* Ambient Album Blur estilo Spotify / YouTube Music */}
      <img
        src={coverUrl}
        alt=""
        aria-hidden="true"
        className="ambient-cover-blur pointer-events-none absolute inset-0 h-full w-full object-cover"
      />
      <div aria-hidden="true" className="ambient-scrim pointer-events-none absolute inset-0" />

      {/* Contenedor técnico oculto para Audio Real (Cero video visible) */}
      <div
        className="sr-only"
        aria-hidden="true"
        data-audio-engine={room.activeProvider}
        data-youtube-video-id={nowPlaying?.song.youtubeVideoId ?? 'yt_neon_pulse'}
        data-audio-output-active={String(shouldOutputAudio)}
      >
        <audio
          ref={audioRef}
          className="sr-only"
          preload="none"
          crossOrigin="anonymous"
          onTimeUpdate={(e) => setLiveProgressMs(Math.floor(e.currentTarget.currentTime * 1000))}
          onEnded={() => skipCurrentTrack()}
        />
        <div id="yt-audio-only-mount" className="sr-only" />
        Reproductor de audio oculto YouTube IFrame Audio-Only (solo portada HD visible)
      </div>

      {/* Contenido sobre el Ambient Blur */}
      <div className="relative z-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            {/* Portada HD cuadrada con sombra editorial */}
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-stroke shadow-elevated sm:h-24 sm:w-24">
              <img
                src={coverUrl}
                alt={`Portada de ${nowPlaying?.song.title ?? 'Autoplay'}`}
                className="h-full w-full object-cover"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 overflow-hidden"
              >
                {floatingReactions.map((r) => (
                  <span
                    key={r.id}
                    style={{ left: `${r.xPercent}%` }}
                    className="floating-reaction absolute bottom-1 text-xl drop-shadow"
                  >
                    {r.emoji}
                  </span>
                ))}
              </div>
            </div>

            {/* Info de pista */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex h-3.5 items-end gap-0.5">
                  <span className={`eq-bar bg-brand-gradient h-2.5 w-1 rounded-full ${!room.isPlaying ? 'animate-none h-1.5' : ''}`} />
                  <span className={`eq-bar eq-bar-2 bg-brand-gradient h-3.5 w-1 rounded-full ${!room.isPlaying ? 'animate-none h-2' : ''}`} />
                  <span className={`eq-bar eq-bar-3 bg-brand-gradient h-2 w-1 rounded-full ${!room.isPlaying ? 'animate-none h-1.5' : ''}`} />
                </div>
                <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-coral">
                  {isEmptyAutoplay ? 'Autoplay respaldo' : 'Sonando ahora'}
                </span>
                {nowPlaying && (
                  <span className="rounded-full border border-stroke bg-card/70 px-2 py-0.5 text-[11px] font-medium text-ink backdrop-blur-sm">
                    {nowPlaying.proposedByAvatar} @{nowPlaying.proposedByName}
                  </span>
                )}
              </div>

              <h2 className="mt-1 truncate font-display text-xl font-extrabold text-ink sm:text-2xl">
                {nowPlaying?.song.title ?? 'Mix Fiesta de Respaldo'}
              </h2>
              <p className="truncate text-xs font-medium text-muted sm:text-sm">
                {nowPlaying?.song.artist ?? 'PonelePlay Autoplay'} ·{' '}
                <span>{room.activeProvider === 'youtube_music' ? 'YouTube Music Sin Premium' : 'Spotify Premium'}</span>
              </p>
            </div>
          </div>

          {/* Controles primarios del Host */}
          {isHost && (
            <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
              <div className="flex items-center gap-2 sm:hidden">
                <Volume2 className="h-4 w-4 text-muted" />
                <span className="tabular-nums-mono text-xs font-semibold text-muted">{room.volumePercent}%</span>
              </div>

              <div className="flex items-center gap-2">
                <div className="hidden items-center gap-2 pr-2 md:flex">
                  <Volume2 className="h-4 w-4 text-muted" />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={room.volumePercent}
                    onChange={(e) => updateRoom({ volumePercent: Number(e.target.value) })}
                    aria-label="Volumen del reproductor"
                    className="h-1.5 w-20 cursor-pointer accent-coral"
                  />
                </div>

                {needsInteractionUnlock && (
                  <button
                    type="button"
                    onClick={handleUnlockAudio}
                    className="flex min-h-[44px] items-center gap-1.5 rounded-full border border-coral bg-coral-soft px-3.5 text-xs font-bold text-coral"
                  >
                    <Volume2 className="h-4 w-4" />
                    <span>Activar Audio</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleTogglePlay}
                  className="bg-brand-gradient flex h-12 w-12 items-center justify-center rounded-full shadow-aurora transition-transform hover:scale-105 active:scale-95"
                  aria-label={room.isPlaying ? 'Pausar reproducción' : 'Reanudar reproducción'}
                  title={room.isPlaying ? 'Pausar' : 'Reproducir'}
                >
                  {room.isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </button>

                <button
                  type="button"
                  onClick={skipCurrentTrack}
                  className="flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-full border border-stroke bg-card/85 px-4 text-xs font-semibold text-ink backdrop-blur-md transition-colors hover:border-brand active:scale-95"
                  aria-label="Pasar a la siguiente canción"
                >
                  <SkipForward className="h-4 w-4" />
                  <span className="hidden sm:inline">Siguiente</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Barra de progreso gradiente */}
        <div className="mt-4 space-y-1.5">
          <div
            role={isHost ? 'slider' : undefined}
            aria-label={isHost ? 'Progreso de la canción' : undefined}
            aria-valuemin={0}
            aria-valuemax={currentDurationMs}
            aria-valuenow={displayProgressMs}
            onClick={handleSeekClick}
            className={`relative h-2 w-full overflow-hidden rounded-full bg-elevated/90 ${
              isHost ? 'cursor-pointer' : ''
            }`}
          >
            <div
              className="bg-brand-gradient h-full rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex items-center justify-between font-mono text-[11px] font-semibold tabular-nums-mono text-muted">
            <span>{formatDurationMs(displayProgressMs)}</span>
            <span>{formatDurationMs(currentDurationMs)}</span>
          </div>
        </div>

        {/* Fila inferior: Reacciones en vivo + Selectores del Host */}
        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2.5 border-t border-stroke pt-3.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {REACTION_BUTTONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => sendReaction(emoji)}
                className="flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-full border border-stroke bg-card/85 px-3 text-xs font-semibold text-ink backdrop-blur-sm transition-all hover:border-coral active:scale-95"
                aria-label={`Enviar reacción ${emoji}`}
              >
                <span className="text-sm">{emoji}</span>
                <span className="tabular-nums-mono text-muted">{reactionCounts[emoji]}</span>
              </button>
            ))}
          </div>

          {isHost && (
            <div className="flex flex-wrap items-center gap-2">
              <div
                role="group"
                aria-label="Motor de música"
                className="flex rounded-full border border-stroke bg-card/85 p-1 backdrop-blur-sm"
              >
                <button
                  type="button"
                  onClick={() => updateRoom({ activeProvider: 'youtube_music' })}
                  className={`flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-all ${
                    room.activeProvider === 'youtube_music'
                      ? 'bg-brand-gradient shadow-sm'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  <Music2 className="h-3.5 w-3.5" />
                  <span>YT Music</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateRoom({ activeProvider: 'spotify' })}
                  className={`min-h-[44px] min-w-[44px] rounded-full px-3 text-xs font-semibold transition-all ${
                    room.activeProvider === 'spotify'
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  Spotify
                </button>
              </div>

              <div
                role="group"
                aria-label="Salida de audio"
                className="flex rounded-full border border-stroke bg-card/85 p-1 backdrop-blur-sm"
              >
                <button
                  type="button"
                  onClick={() => updateRoom({ audioOutput: 'host_device' })}
                  className={`flex min-h-[44px] min-w-[44px] items-center gap-1 rounded-full px-3 text-xs font-semibold transition-colors ${
                    room.audioOutput === 'host_device'
                      ? 'bg-elevated text-ink shadow-sm'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  <span>Host</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateRoom({ audioOutput: 'tv' })}
                  className={`flex min-h-[44px] min-w-[44px] items-center gap-1 rounded-full px-3 text-xs font-semibold transition-colors ${
                    room.audioOutput === 'tv'
                      ? 'bg-elevated text-ink shadow-sm'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  <Tv className="h-3.5 w-3.5" />
                  <span>Smart TV</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
