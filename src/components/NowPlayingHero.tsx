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
  const coverUrl = nowPlaying?.song.imageUrl ?? '/covers/cover-synthwave.png';
  const currentDurationMs = nowPlaying?.song.durationMs ?? 204_000;
  const progressPercent = Math.min(100, Math.max(0, Math.round((room.progressMs / currentDurationMs) * 100)));

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

      {/* Contenedor técnico oculto para YouTube IFrame Audio (Cero video visible) */}
      <div className="sr-only" aria-hidden="true" data-audio-engine={room.activeProvider}>
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

                <button
                  type="button"
                  onClick={() => updateRoom({ isPlaying: !room.isPlaying })}
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
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-elevated/90">
            <div
              className="bg-brand-gradient h-full rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex items-center justify-between font-mono text-[11px] font-semibold tabular-nums-mono text-muted">
            <span>{formatDurationMs(room.progressMs)}</span>
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
