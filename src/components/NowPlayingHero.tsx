import React from 'react';
import {
  Pause,
  Play,
  SkipForward,
  Smartphone,
  Tv,
  Volume2,
  Music2,
} from 'lucide-react';
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

  const isHost = demoRole === 'host';
  const isEmptyAutoplay = queue.length === 0;
  const currentDurationMs = nowPlaying?.song.durationMs ?? 204_000;
  const progressPercent = Math.min(100, Math.max(0, Math.round((room.progressMs / currentDurationMs) * 100)));

  return (
    <section
      aria-label="Reproductor Sonando Ahora"
      className="relative overflow-hidden rounded-2xl border border-stroke bg-card p-4 shadow-surface sm:p-5"
    >
      {/* Contenedor técnico oculto para YouTube IFrame Audio (Cero video visible) */}
      <div className="sr-only" aria-hidden="true" data-audio-engine={room.activeProvider}>
        Reproductor de audio oculto YouTube IFrame Audio-Only (solo portada HD visible)
      </div>

      {/* Fila principal compacta: Portada + Info + Controles principales */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3.5 sm:gap-4">
          {/* Portada HD cuadrada compacta */}
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-stroke bg-elevated sm:h-20 sm:w-20">
            <img
              src={nowPlaying?.song.imageUrl ?? '/covers/cover-synthwave.png'}
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
                <span className={`eq-bar h-2.5 w-0.5 rounded-full bg-brand ${!room.isPlaying ? 'animate-none h-1.5' : ''}`} />
                <span className={`eq-bar eq-bar-2 h-3.5 w-0.5 rounded-full bg-brand ${!room.isPlaying ? 'animate-none h-2' : ''}`} />
                <span className={`eq-bar eq-bar-3 h-2 w-0.5 rounded-full bg-brand ${!room.isPlaying ? 'animate-none h-1.5' : ''}`} />
              </div>
              <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-brand">
                {isEmptyAutoplay ? 'Autoplay respaldo' : 'Sonando ahora'}
              </span>
              {nowPlaying && (
                <span className="text-xs text-muted">
                  · {nowPlaying.proposedByAvatar} @{nowPlaying.proposedByName}
                </span>
              )}
            </div>

            <h2 className="mt-0.5 truncate font-display text-lg font-bold text-ink sm:text-xl">
              {nowPlaying?.song.title ?? 'Mix Fiesta de Respaldo'}
            </h2>
            <p className="truncate text-xs text-muted sm:text-sm">
              {nowPlaying?.song.artist ?? 'PonelePlay Autoplay'} ·{' '}
              <span>{room.activeProvider === 'youtube_music' ? 'YouTube Music Sin Premium' : 'Spotify Premium'}</span>
            </p>
          </div>
        </div>

        {/* Controles primarios del Host alineados a la derecha */}
        {isHost && (
          <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
            <div className="flex items-center gap-2 sm:hidden">
              <Volume2 className="h-4 w-4 text-muted" />
              <span className="tabular-nums-mono text-xs text-muted">{room.volumePercent}%</span>
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
                  className="h-1.5 w-20 cursor-pointer accent-brand"
                />
              </div>

              <button
                type="button"
                onClick={() => updateRoom({ isPlaying: !room.isPlaying })}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-on-brand shadow-surface transition-transform hover:opacity-95 active:scale-95"
                aria-label={room.isPlaying ? 'Pausar reproducción' : 'Reanudar reproducción'}
                title={room.isPlaying ? 'Pausar' : 'Reproducir'}
              >
                {room.isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </button>

              <button
                type="button"
                onClick={skipCurrentTrack}
                className="flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-full border border-stroke bg-elevated px-3.5 text-xs font-semibold text-ink transition-colors hover:bg-canvas active:scale-95"
                aria-label="Pasar a la siguiente canción"
              >
                <SkipForward className="h-4 w-4" />
                <span className="hidden sm:inline">Siguiente</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Barra de progreso minimalista ultrafina */}
      <div className="mt-4 space-y-1.5">
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-elevated">
          <div
            className="h-full rounded-full bg-brand transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex items-center justify-between font-mono text-[11px] tabular-nums-mono text-muted">
          <span>{formatDurationMs(room.progressMs)}</span>
          <span>{formatDurationMs(currentDurationMs)}</span>
        </div>
      </div>

      {/* Fila inferior compacta: Reacciones en vivo + Selectores discretos del Host */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5 border-t border-stroke pt-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {REACTION_BUTTONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => sendReaction(emoji)}
              className="flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-full border border-stroke bg-elevated px-3 text-xs font-semibold text-ink transition-colors hover:border-brand/60 active:scale-95"
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
              className="flex rounded-xl border border-stroke bg-elevated p-0.5"
            >
              <button
                type="button"
                onClick={() => updateRoom({ activeProvider: 'youtube_music' })}
                className={`flex min-h-[44px] min-w-[44px] items-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                  room.activeProvider === 'youtube_music'
                    ? 'bg-brand text-on-brand'
                    : 'text-muted hover:text-ink'
                }`}
              >
                <Music2 className="h-3.5 w-3.5" />
                <span>YT Music</span>
              </button>
              <button
                type="button"
                onClick={() => updateRoom({ activeProvider: 'spotify' })}
                className={`min-h-[44px] min-w-[44px] rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                  room.activeProvider === 'spotify'
                    ? 'bg-brand text-on-brand'
                    : 'text-muted hover:text-ink'
                }`}
              >
                Spotify
              </button>
            </div>

            <div
              role="group"
              aria-label="Salida de audio"
              className="flex rounded-xl border border-stroke bg-elevated p-0.5"
            >
              <button
                type="button"
                onClick={() => updateRoom({ audioOutput: 'host_device' })}
                className={`flex min-h-[44px] min-w-[44px] items-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                  room.audioOutput === 'host_device'
                    ? 'bg-card text-ink shadow-sm'
                    : 'text-muted hover:text-ink'
                }`}
              >
                <Smartphone className="h-3.5 w-3.5" />
                <span>Host</span>
              </button>
              <button
                type="button"
                onClick={() => updateRoom({ audioOutput: 'tv' })}
                className={`flex min-h-[44px] min-w-[44px] items-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                  room.audioOutput === 'tv'
                    ? 'bg-card text-ink shadow-sm'
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
    </section>
  );
};
