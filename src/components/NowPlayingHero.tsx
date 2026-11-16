import React from 'react';
import {
  Pause,
  Play,
  Radio,
  ShieldCheck,
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
      className="relative overflow-hidden rounded-3xl border border-stroke bg-card p-4 shadow-lg sm:p-6"
    >
      {/* Aura luminosa ambiental sutil */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-neon/10 blur-3xl"
      />

      {/* Contenedor técnico oculto para YouTube IFrame Audio (Cero video visible) */}
      <div className="sr-only" aria-hidden="true" data-audio-engine={room.activeProvider}>
        Reproductor de audio oculto YouTube IFrame Audio-Only (solo portada HD visible)
      </div>

      {/* Header de tarjeta Sonando Ahora */}
      <div className="relative z-10 mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-5 items-end gap-0.5 rounded-md bg-neon/15 px-1.5 py-1">
            <span className={`eq-bar h-3 w-1 rounded-full bg-neon ${!room.isPlaying ? 'animate-none h-1.5' : ''}`} />
            <span className={`eq-bar eq-bar-2 h-3.5 w-1 rounded-full bg-neon ${!room.isPlaying ? 'animate-none h-2' : ''}`} />
            <span className={`eq-bar eq-bar-3 h-2.5 w-1 rounded-full bg-neon ${!room.isPlaying ? 'animate-none h-1.5' : ''}`} />
            <span className={`eq-bar eq-bar-4 h-3 w-1 rounded-full bg-neon ${!room.isPlaying ? 'animate-none h-2' : ''}`} />
          </div>
          <span className="font-mono text-xs font-semibold uppercase tracking-widest text-neon">
            {isEmptyAutoplay ? 'Autoplay de respaldo' : 'Sonando ahora'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              room.activeProvider === 'youtube_music'
                ? 'border border-ytm/40 bg-ytm/15 text-red-600 dark:text-red-300'
                : 'border border-neon/40 bg-neon/15 text-neon'
            }`}
          >
            <Music2 className="h-3.5 w-3.5" />
            {room.activeProvider === 'youtube_music'
              ? 'YouTube Music Sin Premium'
              : 'Spotify Premium'}
          </span>

          {nowPlaying && (
            <span className="inline-flex items-center gap-1 rounded-full border border-stroke bg-elevated px-2.5 py-1 text-[11px] font-medium text-ink">
              <span>{nowPlaying.proposedByAvatar}</span>
              <span>@{nowPlaying.proposedByName}</span>
            </span>
          )}
        </div>
      </div>

      {/* Cuerpo principal: Portada HD cuadrada + Info + Reacciones flotantes */}
      <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-center">
        {/* Portada HD cuadrada (nunca video) */}
        <div className="relative mx-auto w-44 shrink-0 sm:mx-0 sm:w-48">
          <div className="relative aspect-square overflow-hidden rounded-2xl border border-brand/50 bg-elevated shadow-neon-indigo">
            <img
              src={nowPlaying?.song.imageUrl ?? '/covers/cover-synthwave.png'}
              alt={`Portada de ${nowPlaying?.song.title ?? 'Autoplay'}`}
              className="h-full w-full object-cover"
            />
            <div className="absolute bottom-2 left-2 rounded-full bg-black/75 px-2 py-0.5 font-mono text-[10px] font-semibold text-white backdrop-blur-sm">
              SOLO PORTADA HD
            </div>
          </div>

          {/* Burbujas de reacciones flotantes */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
          >
            {floatingReactions.map((r) => (
              <span
                key={r.id}
                style={{ left: `${r.xPercent}%` }}
                className="floating-reaction absolute bottom-2 text-2xl drop-shadow"
              >
                {r.emoji}
              </span>
            ))}
          </div>
        </div>

        {/* Detalles del tema, barra de progreso y reacciones */}
        <div className="min-w-0 flex-1 space-y-4">
          <div className="text-center sm:text-left">
            <h2 className="line-clamp-2 font-display text-xl leading-snug text-ink sm:text-2xl">
              {nowPlaying?.song.title ?? 'Mix Fiesta de Respaldo'}
            </h2>
            <p className="mt-1 truncate text-sm font-medium text-muted sm:text-base">
              {nowPlaying?.song.artist ?? 'PonelePlay Autoplay'} ·{' '}
              <span className="text-xs">{nowPlaying?.song.album ?? 'Modo Sin Silencio'}</span>
            </p>
          </div>

          {/* Barra de progreso */}
          <div className="space-y-1.5">
            <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-elevated">
              <div
                className="h-full rounded-full bg-neon shadow-neon-green transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between font-mono text-xs tabular-nums-mono text-muted">
              <span>{formatDurationMs(room.progressMs)}</span>
              <span>{formatDurationMs(currentDurationMs)}</span>
            </div>
          </div>

          {/* Reacciones Rápidas en Vivo */}
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            {REACTION_BUTTONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => sendReaction(emoji)}
                className="flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-full border border-stroke bg-elevated px-3.5 py-2 text-sm font-semibold text-ink transition-all hover:border-neon/60 hover:bg-brand-deep active:scale-95"
                aria-label={`Enviar reacción ${emoji}`}
              >
                <span className="text-base">{emoji}</span>
                <span className="tabular-nums-mono text-xs text-muted">{reactionCounts[emoji]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Panel de Control Exclusivo del Anfitrión (Host) */}
      {isHost && (
        <div className="relative z-10 mt-5 rounded-2xl border border-stroke bg-elevated/80 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Botones Play/Pause, Skip y Volumen */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => updateRoom({ isPlaying: !room.isPlaying })}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-neon text-on-neon shadow-neon-green transition-transform active:scale-95"
                aria-label={room.isPlaying ? 'Pausar reproducción' : 'Reanudar reproducción'}
                title={room.isPlaying ? 'Pausar' : 'Reproducir'}
              >
                {room.isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </button>

              <button
                type="button"
                onClick={skipCurrentTrack}
                className="flex h-11 min-w-[44px] items-center gap-1.5 rounded-xl border border-stroke bg-card px-3 text-xs font-semibold text-ink transition-colors hover:border-brand active:scale-95"
                aria-label="Pasar a la siguiente canción"
              >
                <SkipForward className="h-4 w-4" />
                <span>Siguiente</span>
              </button>

              <div className="hidden items-center gap-2 pl-2 sm:flex">
                <Volume2 className="h-4 w-4 text-muted" />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={room.volumePercent}
                  onChange={(e) => updateRoom({ volumePercent: Number(e.target.value) })}
                  aria-label="Volumen del reproductor"
                  className="h-1.5 w-20 cursor-pointer accent-neon"
                />
                <span className="tabular-nums-mono text-[11px] text-muted">{room.volumePercent}%</span>
              </div>
            </div>

            {/* Conmutadores Motor de Audio & Salida Host vs Smart TV */}
            <div className="flex flex-wrap items-center gap-2">
              <div
                role="group"
                aria-label="Motor de música"
                className="flex rounded-xl border border-stroke bg-card p-1"
              >
                <button
                  type="button"
                  onClick={() => updateRoom({ activeProvider: 'youtube_music' })}
                  className={`min-h-[44px] min-w-[44px] rounded-lg px-3 text-xs font-semibold transition-colors ${
                    room.activeProvider === 'youtube_music'
                      ? 'bg-ytm text-white'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  YT Music
                </button>
                <button
                  type="button"
                  onClick={() => updateRoom({ activeProvider: 'spotify' })}
                  className={`min-h-[44px] min-w-[44px] rounded-lg px-3 text-xs font-semibold transition-colors ${
                    room.activeProvider === 'spotify'
                      ? 'bg-neon text-on-neon'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  Spotify
                </button>
              </div>

              <div
                role="group"
                aria-label="Salida de audio"
                className="flex rounded-xl border border-stroke bg-card p-1"
              >
                <button
                  type="button"
                  onClick={() => updateRoom({ audioOutput: 'host_device' })}
                  className={`flex min-h-[44px] min-w-[44px] items-center gap-1 rounded-lg px-3 text-xs font-semibold transition-colors ${
                    room.audioOutput === 'host_device'
                      ? 'bg-brand text-white'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  <span>Host</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateRoom({ audioOutput: 'tv' })}
                  className={`flex min-h-[44px] min-w-[44px] items-center gap-1 rounded-lg px-3 text-xs font-semibold transition-colors ${
                    room.audioOutput === 'tv'
                      ? 'bg-brand text-white'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  <Tv className="h-3.5 w-3.5" />
                  <span>Smart TV</span>
                </button>
              </div>

              <span className="inline-flex items-center gap-1 rounded-lg border border-neon/30 bg-neon/10 px-2.5 py-1.5 text-[11px] font-medium text-neon">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Wake Lock</span>
                <span>Activo</span>
              </span>
            </div>
          </div>

          {room.audioOutput === 'tv' && (
            <p className="mt-2.5 flex items-center gap-1.5 text-xs text-muted">
              <Radio className="h-3.5 w-3.5 shrink-0 text-neon" />
              <span>
                El audio está saliendo por la <strong className="text-ink">App Nativa de Smart TV</strong>. Tu celular controla la fiesta sin audio duplicado.
              </span>
            </p>
          )}
        </div>
      )}
    </section>
  );
};
