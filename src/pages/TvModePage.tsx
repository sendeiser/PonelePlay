import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Gamepad2,
  Monitor,
  Pause,
  Play,
  PlusCircle,
  Radio,
  SkipForward,
  Speaker,
  Trophy,
  Tv,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { usePartyPreview } from '../context/PartyPreviewContext';
import { RECENT_ROOMS_MOCK, formatDurationMs } from '../data/mockPartyData';

type TvModeView = 'web_tv' | 'android_tv_native';
type AndroidTvScreen = 'tv_home' | 'tv_room' | 'tv_summary';

export const TvModePage: React.FC = () => {
  const { code = 'PLAY42' } = useParams();
  const navigate = useNavigate();
  const {
    room,
    updateRoom,
    nowPlaying,
    queue,
    played,
    floatingReactions,
    reactionCounts,
    skipCurrentTrack,
  } = usePartyPreview();

  const [tvSurface, setTvSurface] = useState<TvModeView>('web_tv');
  const [androidScreen, setAndroidScreen] = useState<AndroidTvScreen>('tv_room');
  const [dpadFocusIndex, setDpadFocusIndex] = useState(0);

  const joinUrl = `${window.location.origin}/join/${code.toUpperCase()}`;
  const topFive = queue.slice(0, 5);
  const currentDurationMs = nowPlaying?.song.durationMs ?? 204_000;
  const progressPercent = Math.min(100, Math.round((room.progressMs / currentDurationMs) * 100));

  const dpadActions = [
    {
      label: room.isPlaying ? 'Pausar' : 'Reproducir',
      icon: room.isPlaying ? Pause : Play,
      onClick: () => updateRoom({ isPlaying: !room.isPlaying }),
    },
    {
      label: 'Siguiente Tema',
      icon: SkipForward,
      onClick: skipCurrentTrack,
    },
    {
      label: room.audioOutput === 'tv' ? 'Audio en TV (Activo)' : 'Pasar Audio a esta TV',
      icon: Speaker,
      onClick: () => updateRoom({ audioOutput: room.audioOutput === 'tv' ? 'host_device' : 'tv' }),
    },
    {
      label: 'Ver Podio TV',
      icon: Trophy,
      onClick: () => setAndroidScreen('tv_summary'),
    },
  ];

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-3 py-4 sm:px-6 sm:py-6">
      {/* Selector superior Web Modo TV vs App Android TV Nativa */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stroke bg-card p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(`/room/${code.toUpperCase()}`)}
            className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-stroke bg-elevated px-3 text-xs font-semibold text-ink hover:border-brand"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Volver a la Sala</span>
          </button>
          <span className="hidden text-xs text-muted md:inline">
            Vista panorámica 16:9 · Cero video de YouTube (Solo Portada HD)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setTvSurface('web_tv')}
            className={`flex min-h-[44px] items-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold transition-colors ${
              tvSurface === 'web_tv'
                ? 'bg-brand text-white shadow-neon-indigo'
                : 'bg-elevated text-muted hover:text-ink'
            }`}
          >
            <Monitor className="h-4 w-4" />
            <span>Modo TV Web</span>
          </button>

          <button
            type="button"
            onClick={() => setTvSurface('android_tv_native')}
            className={`flex min-h-[44px] items-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold transition-colors ${
              tvSurface === 'android_tv_native'
                ? 'bg-neon text-on-neon shadow-neon-green'
                : 'bg-elevated text-muted hover:text-ink'
            }`}
          >
            <Tv className="h-4 w-4" />
            <span>App Nativa Android TV (Compose 10-foot UI)</span>
          </button>
        </div>
      </div>

      {/* MODO 1: MODO TV WEB (/room/:code/tv) */}
      {tvSurface === 'web_tv' && (
        <section
          aria-label="Modo Pantalla Gigante TV Web"
          className="relative overflow-hidden rounded-3xl border border-stroke bg-card p-5 shadow-2xl sm:p-8"
        >
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
            {/* Columna Izquierda: Portada HD Gigante + Reacciones Flotantes */}
            <div className="relative space-y-5 lg:col-span-7">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-neon/40 bg-neon/10 px-3 py-1 font-mono text-xs font-bold uppercase text-neon">
                  <Radio className="h-3.5 w-3.5" />
                  {room.audioOutput === 'tv'
                    ? 'Audio activo en Smart TV (YouTube Music Sin Premium)'
                    : 'Pantalla sincronizada · Audio en Host'}
                </span>
                <span className="font-mono text-xs text-muted">{room.name}</span>
              </div>

              <div className="flex flex-col items-center gap-6 sm:flex-row">
                <div className="relative w-56 shrink-0 sm:w-64">
                  <img
                    src={nowPlaying?.song.imageUrl ?? '/covers/cover-synthwave.png'}
                    alt={nowPlaying?.song.title ?? 'Portada'}
                    className="aspect-square w-full rounded-3xl border-2 border-brand/60 object-cover shadow-neon-indigo"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl"
                  >
                    {floatingReactions.map((r) => (
                      <span
                        key={r.id}
                        style={{ left: `${r.xPercent}%` }}
                        className="floating-reaction absolute bottom-4 text-3xl"
                      >
                        {r.emoji}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="min-w-0 flex-1 space-y-4 text-center sm:text-left">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-neon">
                      Sonando Ahora · {nowPlaying?.proposedByAvatar} @{nowPlaying?.proposedByName}
                    </p>
                    <h1 className="mt-1 font-display text-2xl text-ink sm:text-4xl">
                      {nowPlaying?.song.title}
                    </h1>
                    <p className="mt-1 text-base text-muted sm:text-xl">{nowPlaying?.song.artist}</p>
                  </div>

                  <div className="space-y-1.5">
                    <div className="h-3 w-full overflow-hidden rounded-full bg-elevated">
                      <div
                        className="h-full rounded-full bg-neon shadow-neon-green"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <div className="flex justify-between font-mono text-xs tabular-nums-mono text-muted">
                      <span>{formatDurationMs(room.progressMs)}</span>
                      <span>{formatDurationMs(currentDurationMs)}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
                    {Object.entries(reactionCounts).map(([emoji, count]) => (
                      <span
                        key={emoji}
                        className="inline-flex items-center gap-1.5 rounded-full border border-stroke bg-elevated px-3 py-1.5 text-sm font-semibold text-ink"
                      >
                        <span>{emoji}</span>
                        <span className="tabular-nums-mono text-xs text-muted">{count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Columna Derecha: QR Gigante + Top 5 */}
            <div className="space-y-5 lg:col-span-5">
              <div className="flex flex-col items-center gap-4 rounded-3xl border border-stroke bg-elevated p-5 text-center sm:flex-row sm:text-left">
                <div className="shrink-0 rounded-2xl bg-white p-3 shadow-lg">
                  <QRCodeSVG value={joinUrl} size={136} level="M" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-neon">
                    ¡Escaneá y votá la próxima!
                  </p>
                  <p className="mt-1 font-display text-4xl tracking-[0.18em] text-ink">
                    {code.toUpperCase()}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Entra desde el navegador de tu celu sin instalar nada.
                  </p>
                </div>
              </div>

              <div className="rounded-3xl border border-stroke bg-elevated p-4">
                <h2 className="mb-3 font-display text-sm uppercase tracking-wider text-muted">
                  A continuación (Top 5 en vivo)
                </h2>
                <div className="space-y-2">
                  {topFive.map((item, idx) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-stroke bg-card px-3 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="font-mono text-xs font-bold text-muted">#{idx + 1}</span>
                        <img
                          src={item.song.imageUrl}
                          alt={item.song.title}
                          className="h-9 w-9 shrink-0 rounded-lg object-cover"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-ink">{item.song.title}</p>
                          <p className="truncate text-[11px] text-muted">{item.song.artist}</p>
                        </div>
                      </div>
                      <span className="shrink-0 font-mono text-xs font-bold tabular-nums-mono text-neon">
                        {item.netScore >= 0 ? `+${item.netScore}` : item.netScore}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* MODO 2: PREVIEW APP NATIVA ANDROID TV (Kotlin + Jetpack Compose for TV 10-foot UI) */}
      {tvSurface === 'android_tv_native' && (
        <section
          aria-label="Simulador App Nativa Android TV"
          className="space-y-4"
        >
          {/* Sub-selector de las 3 pantallas nativas de /android-tv */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stroke bg-card p-3">
            <div className="flex items-center gap-2 text-xs text-muted">
              <Gamepad2 className="h-4 w-4 text-neon" />
              <span>
                Proyecto nativo en <code className="font-mono text-ink">/android-tv</code> · Navegación 100% D-Pad
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'tv_home', label: '1. TvHomeScreen' },
                  { id: 'tv_room', label: '2. TvRoomScreen (Modo Dual)' },
                  { id: 'tv_summary', label: '3. TvSummaryScreen' },
                ] as const
              ).map((scr) => (
                <button
                  key={scr.id}
                  type="button"
                  onClick={() => setAndroidScreen(scr.id)}
                  className={`min-h-[44px] rounded-xl px-3.5 text-xs font-semibold transition-colors ${
                    androidScreen === scr.id
                      ? 'bg-neon text-on-neon'
                      : 'bg-elevated text-muted hover:text-ink'
                  }`}
                >
                  {scr.label}
                </button>
              ))}
            </div>
          </div>

          {/* Marco 16:9 Smart TV OLED */}
          <div className="rounded-3xl border-4 border-slate-800 bg-[#090917] p-5 text-white shadow-2xl sm:p-8">
            {androidScreen === 'tv_home' && (
              <div className="space-y-7">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <span className="rounded-full bg-brand/30 px-3 py-1 font-mono text-xs font-semibold text-indigo-200">
                      ANDROID TV LEANBACK · 1920x1080
                    </span>
                    <h1 className="mt-2 font-display text-3xl sm:text-4xl">
                      PonelePlay <span className="text-neon">TV</span>
                    </h1>
                  </div>
                  <p className="text-sm text-slate-300">Usa las flechas del control remoto (D-Pad) + OK</p>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {/* Tarjeta D-Pad: Unirse con código */}
                  <div className="rounded-3xl border-2 border-neon bg-[#16162D] p-6 shadow-neon-green">
                    <span className="font-mono text-xs font-bold uppercase text-neon">
                      FOCO D-PAD ACTIVO
                    </span>
                    <h2 className="mt-1 font-display text-2xl">Unirse a Sala con Código</h2>
                    <p className="mt-1 text-sm text-slate-300">
                      Selector de 6 casillas sin teclado físico para vincular la fiesta del Host:
                    </p>
                    <div className="mt-5 grid grid-cols-6 gap-2">
                      {code
                        .toUpperCase()
                        .padEnd(6, ' ')
                        .slice(0, 6)
                        .split('')
                        .map((char, idx) => (
                          <div
                            key={idx}
                            className={`flex h-14 items-center justify-center rounded-xl border-2 font-display text-2xl ${
                              idx === 0
                                ? 'border-neon bg-neon/20 text-neon'
                                : 'border-slate-700 bg-[#0F0F23] text-white'
                            }`}
                          >
                            {char}
                          </div>
                        ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setAndroidScreen('tv_room')}
                      className="mt-5 flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-neon text-sm font-bold text-slate-950"
                    >
                      OK · Conectar TV a Sala
                    </button>
                  </div>

                  {/* Tarjeta D-Pad: Crear sala directa en TV */}
                  <div className="flex flex-col justify-between rounded-3xl border border-slate-700 bg-[#16162D] p-6">
                    <div>
                      <h2 className="font-display text-2xl">Crear Sala Nueva en esta TV</h2>
                      <p className="mt-2 text-sm text-slate-300">
                        Inicia la fiesta al instante con <strong className="text-white">YouTube Music Sin Premium</strong> usando los parlantes del televisor como reproductor principal.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        updateRoom({ audioOutput: 'tv' });
                        setAndroidScreen('tv_room');
                      }}
                      className="mt-5 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-indigo-400/50 bg-brand text-sm font-bold text-white"
                    >
                      <PlusCircle className="h-5 w-5" />
                      <span>Crear Sala con 1 Clic del Control</span>
                    </button>
                  </div>
                </div>

                {/* TvLazyRow de Salas Recientes */}
                <div>
                  <h3 className="mb-3 font-display text-sm uppercase tracking-wider text-slate-400">
                    Salas Recientes en esta TV (TvLazyRow)
                  </h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {RECENT_ROOMS_MOCK.map((r) => (
                      <button
                        key={r.code}
                        type="button"
                        onClick={() => setAndroidScreen('tv_room')}
                        className="flex min-h-[64px] items-center justify-between rounded-2xl border border-slate-700 bg-[#16162D] px-5 py-4 text-left hover:border-neon"
                      >
                        <div>
                          <p className="font-display text-lg text-white">{r.name}</p>
                          <p className="font-mono text-xs text-neon">{r.code}</p>
                        </div>
                        <span className="rounded-lg bg-slate-800 px-3 py-1 text-xs text-slate-300">
                          OK para abrir
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {androidScreen === 'tv_room' && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="rounded-xl bg-neon/20 px-3 py-1 font-mono text-xs font-bold text-neon">
                      {room.audioOutput === 'tv'
                        ? 'MODO A: REPRODUCTOR PRINCIPAL EN TV'
                        : 'MODO B: SOLO PANTALLA SINCRONIZADA'}
                    </span>
                    <span className="text-sm text-slate-300">{room.name}</span>
                  </div>
                  <span className="font-mono text-xs text-slate-400">
                    10-foot UI · Control Remoto D-Pad
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-center">
                  <div className="flex flex-col items-center gap-6 sm:flex-row lg:col-span-7">
                    <img
                      src={nowPlaying?.song.imageUrl ?? '/covers/cover-synthwave.png'}
                      alt={nowPlaying?.song.title ?? 'Album'}
                      className="h-52 w-52 shrink-0 rounded-3xl border-2 border-neon/70 object-cover shadow-neon-green"
                    />
                    <div className="min-w-0 flex-1 space-y-3 text-center sm:text-left">
                      <p className="font-mono text-xs uppercase text-neon">
                        YouTube Music Audio · Video oculto
                      </p>
                      <h2 className="font-display text-3xl leading-tight">
                        {nowPlaying?.song.title}
                      </h2>
                      <p className="text-lg text-slate-300">{nowPlaying?.song.artist}</p>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-neon"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                      <p className="font-mono text-xs text-slate-400">
                        {formatDurationMs(room.progressMs)} / {formatDurationMs(currentDurationMs)} · Propuesto por @{nowPlaying?.proposedByName}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-3xl border border-slate-700 bg-[#16162D] p-5 lg:col-span-5">
                    <div className="flex items-center gap-4">
                      <div className="rounded-xl bg-white p-2">
                        <QRCodeSVG value={joinUrl} size={96} level="M" />
                      </div>
                      <div>
                        <p className="text-xs uppercase text-slate-400">Escanea para votar</p>
                        <p className="font-display text-3xl tracking-widest text-neon">
                          {code.toUpperCase()}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1.5 pt-2">
                      {topFive.slice(0, 3).map((item, idx) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between rounded-xl bg-[#0F0F23] px-3 py-2 text-xs"
                        >
                          <span className="truncate">
                            #{idx + 1} {item.song.title}
                          </span>
                          <span className="ml-2 font-mono font-bold text-neon">
                            +{item.netScore}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Barra de controles enfocables con D-Pad */}
                <div className="flex flex-wrap items-center gap-3 border-t border-slate-800 pt-4">
                  {dpadActions.map((act, idx) => {
                    const Icon = act.icon;
                    const focused = dpadFocusIndex === idx;
                    return (
                      <button
                        key={act.label}
                        type="button"
                        onClick={() => {
                          setDpadFocusIndex(idx);
                          act.onClick();
                        }}
                        className={`flex min-h-[48px] items-center gap-2 rounded-2xl px-4 text-xs font-bold transition-all ${
                          focused
                            ? 'scale-[1.03] border-2 border-white bg-neon text-slate-950 shadow-neon-green'
                            : 'border border-slate-700 bg-[#16162D] text-slate-200 hover:border-slate-400'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span>{act.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {androidScreen === 'tv_summary' && (
              <div className="space-y-6 text-center">
                <Trophy className="mx-auto h-14 w-14 text-amber" />
                <h2 className="font-display text-3xl sm:text-4xl">Fin de Fiesta en Smart TV</h2>
                <p className="text-sm text-slate-300">
                  {played.length + 1} temas reproducidos · Podio de DJs de la noche
                </p>
                <div className="mx-auto grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl border border-amber/60 bg-amber/10 p-4">
                    <p className="font-mono text-xs text-amber">1º PUESTO ORO</p>
                    <p className="mt-1 text-2xl">🌟 @martina</p>
                    <p className="font-mono text-sm text-white">33 pts</p>
                  </div>
                  <div className="rounded-2xl border border-slate-500 bg-slate-800/60 p-4">
                    <p className="font-mono text-xs text-slate-300">2º PUESTO PLATA</p>
                    <p className="mt-1 text-2xl">🔥 @gonza</p>
                    <p className="font-mono text-sm text-white">27 pts</p>
                  </div>
                  <div className="rounded-2xl border border-orange-500/60 bg-orange-500/10 p-4">
                    <p className="font-mono text-xs text-orange-300">3º PUESTO BRONCE</p>
                    <p className="mt-1 text-2xl">🎤 @flor</p>
                    <p className="font-mono text-sm text-white">20 pts</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAndroidScreen('tv_home')}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-2xl border-2 border-white bg-neon px-6 text-sm font-bold text-slate-950 shadow-neon-green"
                >
                  OK · Volver al Inicio de TV
                </button>
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
};
