import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
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
import { toast } from 'sonner';
import { PonelePlayLogo } from '../components/PonelePlayLogo';
import { usePartyPreview } from '../context/PartyPreviewContext';
import { formatDurationMs } from '../data/mockPartyData';
import {
  YTPlayerInstance,
  isRealYoutubeId,
  loadYouTubeIframeApi,
  resolvePlayableAudioUrl,
} from '../lib/audioEngine';

type TvModeView = 'web_tv' | 'android_tv_native';
type AndroidTvScreen = 'tv_home' | 'tv_room' | 'tv_summary';

export const TvModePage: React.FC = () => {
  const { code = 'PLAY42' } = useParams();
  const navigate = useNavigate();
  const {
    room,
    recentRooms,
    participants,
    loadRoomByCode,
    createRoom,
    updateRoom,
    nowPlaying,
    queue,
    played,
    floatingReactions,
    reactionCounts,
    skipCurrentTrack,
  } = usePartyPreview();

  const tvAudioRef = useRef<HTMLAudioElement | null>(null);
  const tvYtPlayerRef = useRef<YTPlayerInstance | null>(null);
  const tvGestureRef = useRef(false);

  const [tvSurface, setTvSurface] = useState<TvModeView>('web_tv');
  const [androidScreen, setAndroidScreen] = useState<AndroidTvScreen>('tv_room');
  const [dpadFocusIndex, setDpadFocusIndex] = useState(0);
  const [tvCodeInput, setTvCodeInput] = useState(code.toUpperCase());

  useEffect(() => {
    setTvCodeInput(code.toUpperCase());
    void loadRoomByCode(code);
  }, [code, loadRoomByCode]);

  const shouldTvPlayAudio = room.isPlaying && room.audioOutput === 'tv';

  useEffect(() => {
    const song = nowPlaying?.song;
    const isWebdriver = typeof navigator !== 'undefined' && navigator.webdriver === true;

    const stopTv = () => {
      tvAudioRef.current?.pause();
      try {
        tvYtPlayerRef.current?.pauseVideo();
      } catch {
        // ignore unready YT player
      }
    };

    if (!shouldTvPlayAudio || !song || (isWebdriver && !tvGestureRef.current)) {
      stopTv();
      return;
    }

    let cancelled = false;
    const startTvAudio = async () => {
      const startStream = async () => {
        const streamUrl = await resolvePlayableAudioUrl(song);
        if (cancelled || !streamUrl || !tvAudioRef.current) return;
        if (tvAudioRef.current.src !== streamUrl) {
          tvAudioRef.current.src = streamUrl;
          tvAudioRef.current.load();
        }
        tvAudioRef.current.volume = Math.min(1, Math.max(0, room.volumePercent / 100));
        await tvAudioRef.current.play().catch(() => {});
      };

      if (isRealYoutubeId(song.youtubeVideoId)) {
        tvAudioRef.current?.pause();
        await loadYouTubeIframeApi();
        if (cancelled || !window.YT?.Player) {
          await startStream();
          return;
        }
        try {
          tvYtPlayerRef.current?.destroy();
        } catch {
          // ignore
        }
        tvYtPlayerRef.current = new window.YT.Player('tv-yt-audio-only-mount', {
          videoId: song.youtubeVideoId,
          playerVars: { autoplay: 1, controls: 0, modestbranding: 1, playsinline: 1 },
          events: {
            onReady: (e) => {
              if (cancelled) return;
              e.target.setVolume(room.volumePercent);
              e.target.playVideo();
            },
            onStateChange: (e) => {
              if (e.data === 0 && !cancelled) skipCurrentTrack();
            },
            onError: () => {
              if (!cancelled) void startStream();
            },
          },
        });
        return;
      }

      await startStream();
    };

    void startTvAudio();
    return () => {
      cancelled = true;
      stopTv();
    };
  }, [nowPlaying?.id, nowPlaying?.song, shouldTvPlayAudio]);

  const joinUrl = `${window.location.origin}/join/${code.toUpperCase()}`;
  const coverUrl = nowPlaying?.song.imageUrl ?? '/covers/cover-synthwave.png';
  const topFive = queue.slice(0, 5);
  const topDjs = [...participants]
    .filter((p) => !p.isBanned)
    .sort((a, b) => b.djPoints - a.djPoints)
    .slice(0, 3);
  const currentDurationMs = nowPlaying?.song.durationMs ?? 204_000;
  const progressPercent = Math.min(100, Math.round((room.progressMs / currentDurationMs) * 100));

  const dpadActions = [
    {
      label: room.isPlaying ? 'Pausar' : 'Reproducir',
      icon: room.isPlaying ? Pause : Play,
      onClick: () => {
        tvGestureRef.current = true;
        updateRoom({ isPlaying: !room.isPlaying });
      },
    },
    {
      label: 'Siguiente Tema',
      icon: SkipForward,
      onClick: skipCurrentTrack,
    },
    {
      label: room.audioOutput === 'tv' ? 'Audio en TV (Activo)' : 'Pasar Audio a esta TV',
      icon: Speaker,
      onClick: () => {
        tvGestureRef.current = true;
        updateRoom({ audioOutput: room.audioOutput === 'tv' ? 'host_device' : 'tv' });
      },
    },
    {
      label: 'Ver Podio TV',
      icon: Trophy,
      onClick: () => setAndroidScreen('tv_summary'),
    },
  ];

  const handleTvConnectCode = async () => {
    const clean = tvCodeInput.trim().toUpperCase();
    if (clean.length < 4) {
      toast.error('Ingresa un código de sala válido');
      return;
    }
    const status = await loadRoomByCode(clean);
    if (status === 'not_found') {
      toast.error(`No se encontró ninguna sala con código ${clean}`);
      return;
    }
    navigate(`/room/${clean}/tv`);
    setAndroidScreen('tv_room');
  };

  const handleCreateTvRoom = async () => {
    tvGestureRef.current = true;
    const timeLabel = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    const newCode = await createRoom({
      name: `Sala Smart TV · ${timeLabel}`,
      activeProvider: 'youtube_music',
      maxPendingPerUser: 5,
      cooldownSeconds: 10,
      fallbackGenre: room.fallbackGenre || 'party_hits',
    });
    updateRoom({ audioOutput: 'tv', isPlaying: true });
    toast.success(`Sala ${newCode} creada en Smart TV`);
    navigate(`/room/${newCode}/tv`);
    setAndroidScreen('tv_room');
  };

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-3 py-4 sm:px-6 sm:py-6">
      <div className="sr-only" aria-hidden="true" data-tv-audio-active={String(shouldTvPlayAudio)}>
        <audio
          ref={tvAudioRef}
          className="sr-only"
          preload="none"
          crossOrigin="anonymous"
          onEnded={() => skipCurrentTrack()}
        />
        <div id="tv-yt-audio-only-mount" className="sr-only" />
      </div>
      {/* Cabecera limpia de Modo TV */}
      <div className="glass-card flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stroke p-3">
        <button
          type="button"
          onClick={() => navigate(`/room/${code.toUpperCase()}`)}
          className="flex min-h-[44px] items-center gap-1.5 rounded-full border border-stroke bg-elevated px-4 text-xs font-semibold text-ink hover:border-brand"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Volver a la Sala</span>
        </button>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setTvSurface('web_tv')}
            className={`flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-xs font-semibold transition-all ${
              tvSurface === 'web_tv'
                ? 'bg-brand-gradient shadow-sm'
                : 'bg-elevated text-muted hover:text-ink'
            }`}
          >
            <Monitor className="h-4 w-4" />
            <span>Modo TV Web</span>
          </button>

          <button
            type="button"
            onClick={() => setTvSurface('android_tv_native')}
            className={`flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-xs font-semibold transition-all ${
              tvSurface === 'android_tv_native'
                ? 'bg-brand-gradient shadow-sm'
                : 'bg-elevated text-muted hover:text-ink'
            }`}
          >
            <Tv className="h-4 w-4" />
            <span>App Smart TV (Android TV)</span>
          </button>
        </div>
      </div>

      {/* MODO 1: MODO TV WEB (/room/:code/tv) */}
      {tvSurface === 'web_tv' && (
        <section
          aria-label="Modo Pantalla Gigante TV Web"
          className="relative overflow-hidden rounded-3xl border border-stroke bg-card p-5 shadow-elevated sm:p-8"
        >
          <img
            src={coverUrl}
            alt=""
            aria-hidden="true"
            className="ambient-cover-blur pointer-events-none absolute inset-0 h-full w-full object-cover"
          />
          <div aria-hidden="true" className="ambient-scrim pointer-events-none absolute inset-0" />

          <div className="relative z-10 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
            <div className="relative space-y-5 lg:col-span-7">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-coral-soft px-3 py-1 font-mono text-xs font-bold uppercase text-coral">
                  <Radio className="h-3.5 w-3.5" />
                  {room.audioOutput === 'tv'
                    ? 'Audio en Smart TV · YouTube Music Sin Premium'
                    : 'Pantalla sincronizada · Audio en Host'}
                </span>
                <span className="font-mono text-xs text-muted">{room.name}</span>
              </div>

              <div className="flex flex-col items-center gap-6 sm:flex-row">
                <div className="relative w-56 shrink-0 sm:w-64">
                  <img
                    src={coverUrl}
                    alt={nowPlaying?.song.title ?? 'Portada'}
                    className="aspect-square w-full rounded-2xl border border-stroke object-cover shadow-elevated"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
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
                    <p className="text-xs font-bold uppercase tracking-widest text-coral">
                      Sonando Ahora · {nowPlaying?.proposedByAvatar} @{nowPlaying?.proposedByName}
                    </p>
                    <h1 className="mt-1 font-display text-2xl font-extrabold text-ink sm:text-4xl">
                      {nowPlaying?.song.title}
                    </h1>
                    <p className="mt-1 text-base text-muted sm:text-xl">{nowPlaying?.song.artist}</p>
                  </div>

                  <div className="space-y-1.5">
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-elevated">
                      <div
                        className="bg-brand-gradient h-full rounded-full"
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
                        className="inline-flex items-center gap-1.5 rounded-full border border-stroke bg-card/85 px-3 py-1.5 text-sm font-semibold text-ink backdrop-blur-sm"
                      >
                        <span>{emoji}</span>
                        <span className="tabular-nums-mono text-xs text-muted">{count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-5 lg:col-span-5">
              <div className="flex flex-col items-center gap-4 rounded-3xl border border-stroke bg-card/85 p-5 text-center backdrop-blur-md sm:flex-row sm:text-left">
                <div className="shrink-0 rounded-2xl border border-stroke bg-white p-3 shadow-sm">
                  <QRCodeSVG value={joinUrl} size={136} level="M" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-coral">
                    ¡Escaneá y votá la próxima!
                  </p>
                  <p className="mt-1 font-display text-4xl font-extrabold tracking-[0.18em] text-brand">
                    {code.toUpperCase()}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Entra desde el navegador de tu celu sin instalar nada.
                  </p>
                </div>
              </div>

              <div className="rounded-3xl border border-stroke bg-card/85 p-4 backdrop-blur-md">
                <h2 className="mb-3 font-display text-xs font-bold uppercase tracking-wider text-muted">
                  A continuación (Top 5 en vivo)
                </h2>
                <div className="space-y-2">
                  {topFive.map((item, idx) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-stroke bg-elevated/80 px-3 py-2"
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
                      <span className="shrink-0 font-mono text-xs font-bold tabular-nums-mono text-coral">
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

      {/* MODO 2: APP NATIVA ANDROID TV (100% coherente con el tema activo, cero mezcla dark/light) */}
      {tvSurface === 'android_tv_native' && (
        <section aria-label="App Nativa Android TV" className="space-y-4">
          <div className="glass-card flex flex-wrap gap-1.5 rounded-2xl border border-stroke p-2">
            {(
              [
                { id: 'tv_home', label: 'Inicio TV' },
                { id: 'tv_room', label: 'Reproductor TV' },
                { id: 'tv_summary', label: 'Podio TV' },
              ] as const
            ).map((scr) => (
              <button
                key={scr.id}
                type="button"
                onClick={() => setAndroidScreen(scr.id)}
                className={`min-h-[44px] rounded-full px-4 text-xs font-semibold transition-all ${
                  androidScreen === scr.id
                    ? 'bg-brand-gradient shadow-sm'
                    : 'bg-elevated text-muted hover:text-ink'
                }`}
              >
                {scr.label}
              </button>
            ))}
          </div>

          <div className="relative overflow-hidden rounded-3xl border border-stroke bg-card p-5 text-ink shadow-elevated sm:p-8">
            <img
              src={coverUrl}
              alt=""
              aria-hidden="true"
              className="ambient-cover-blur pointer-events-none absolute inset-0 h-full w-full object-cover"
            />
            <div aria-hidden="true" className="ambient-scrim pointer-events-none absolute inset-0" />

            <div className="relative z-10">
              {androidScreen === 'tv_home' && (
                <div className="space-y-7">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <PonelePlayLogo size="md" subtitle="App Smart TV · Control Remoto D-Pad" />
                    <p className="text-sm text-muted">Navegación por flechas del control (D-Pad)</p>
                  </div>

                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <div className="rounded-3xl border-2 border-brand bg-card/85 p-6 backdrop-blur-md">
                      <span className="font-mono text-xs font-bold uppercase text-brand">
                        Foco Control Remoto
                      </span>
                      <h2 className="mt-1 font-display text-2xl font-bold text-ink">Unirse con Código</h2>
                      <div className="mt-5 grid grid-cols-6 gap-2">
                        {tvCodeInput
                          .toUpperCase()
                          .padEnd(6, ' ')
                          .slice(0, 6)
                          .split('')
                          .map((char, idx) => (
                            <div
                              key={idx}
                              className={`flex h-14 items-center justify-center rounded-xl border-2 font-display text-2xl font-bold ${
                                idx === 0
                                  ? 'border-coral bg-coral-soft text-coral'
                                  : 'border-stroke bg-elevated text-ink'
                              }`}
                            >
                              {char}
                            </div>
                          ))}
                      </div>
                      <input
                        type="text"
                        maxLength={8}
                        value={tvCodeInput}
                        onChange={(e) => setTvCodeInput(e.target.value.toUpperCase())}
                        aria-label="Código de sala para Smart TV"
                        placeholder="PLAY42"
                        className="mt-3 min-h-[44px] w-full rounded-xl border border-stroke bg-elevated px-3 text-center font-mono text-sm font-bold uppercase tracking-[0.2em] text-ink focus:border-brand"
                      />
                      <button
                        type="button"
                        onClick={() => void handleTvConnectCode()}
                        className="bg-brand-gradient mt-3 flex min-h-[48px] w-full items-center justify-center rounded-full text-sm font-bold shadow-aurora"
                      >
                        OK · Conectar TV a Sala
                      </button>
                    </div>

                    <div className="flex flex-col justify-between rounded-3xl border border-stroke bg-card/85 p-6 backdrop-blur-md">
                      <div>
                        <h2 className="font-display text-2xl font-bold text-ink">Crear Sala desde esta TV</h2>
                        <p className="mt-2 text-sm text-muted">
                          Usa <strong className="text-ink">YouTube Music Sin Premium</strong> reproduciendo directo en los parlantes del televisor.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleCreateTvRoom()}
                        className="mt-5 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full border border-stroke bg-elevated text-sm font-bold text-ink hover:border-brand"
                      >
                        <PlusCircle className="h-5 w-5 text-brand" />
                        <span>Crear Sala con 1 Clic</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-3 font-display text-xs font-bold uppercase tracking-wider text-muted">
                      Salas Recientes
                    </h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {recentRooms.map((r) => (
                        <button
                          key={r.code}
                          type="button"
                          onClick={() => {
                            setTvCodeInput(r.code);
                            void loadRoomByCode(r.code);
                            navigate(`/room/${r.code}/tv`);
                            setAndroidScreen('tv_room');
                          }}
                          className="flex min-h-[64px] items-center justify-between rounded-2xl border border-stroke bg-card/85 px-5 py-4 text-left backdrop-blur-md hover:border-brand"
                        >
                          <div>
                            <p className="font-display text-lg font-bold text-ink">{r.name}</p>
                            <p className="font-mono text-xs text-coral">{r.code}</p>
                          </div>
                          <span className="rounded-full border border-stroke bg-elevated px-3 py-1 text-xs font-medium text-muted">
                            Abrir
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
                    <div className="flex flex-wrap items-center gap-3">
                      <PonelePlayLogo size="sm" showWordmark={false} />
                      <span className="rounded-full bg-coral-soft px-3 py-1 font-mono text-xs font-bold text-coral">
                        {room.audioOutput === 'tv'
                          ? 'AUDIO ACTIVO EN SMART TV'
                          : 'SOLO PANTALLA SINCRONIZADA'}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-muted">{room.name}</span>
                  </div>

                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-center">
                    <div className="flex flex-col items-center gap-6 sm:flex-row lg:col-span-7">
                      <img
                        src={coverUrl}
                        alt={nowPlaying?.song.title ?? 'Album'}
                        className="h-52 w-52 shrink-0 rounded-2xl border border-stroke object-cover shadow-elevated"
                      />
                      <div className="min-w-0 flex-1 space-y-3 text-center sm:text-left">
                        <p className="font-mono text-xs font-bold uppercase text-coral">
                          YouTube Music Audio · Solo Portada HD
                        </p>
                        <h2 className="font-display text-3xl font-extrabold leading-tight text-ink">
                          {nowPlaying?.song.title}
                        </h2>
                        <p className="text-lg text-muted">{nowPlaying?.song.artist}</p>
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-elevated">
                          <div
                            className="bg-brand-gradient h-full rounded-full"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                        <p className="font-mono text-xs text-muted">
                          {formatDurationMs(room.progressMs)} / {formatDurationMs(currentDurationMs)} · @{nowPlaying?.proposedByName}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3 rounded-3xl border border-stroke bg-card/85 p-5 backdrop-blur-md lg:col-span-5">
                      <div className="flex items-center gap-4">
                        <div className="rounded-xl border border-stroke bg-white p-2">
                          <QRCodeSVG value={joinUrl} size={96} level="M" />
                        </div>
                        <div>
                          <p className="text-xs uppercase text-muted">Escanea para votar</p>
                          <p className="font-display text-3xl font-extrabold tracking-widest text-brand">
                            {code.toUpperCase()}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-1.5 pt-2">
                        {topFive.slice(0, 3).map((item, idx) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between rounded-xl border border-stroke bg-elevated/80 px-3 py-2 text-xs"
                          >
                            <span className="truncate text-ink">
                              #{idx + 1} {item.song.title}
                            </span>
                            <span className="ml-2 font-mono font-bold text-coral">
                              +{item.netScore}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 border-t border-stroke pt-4">
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
                          className={`flex min-h-[48px] items-center gap-2 rounded-full px-5 text-xs font-bold transition-all ${
                            focused
                              ? 'bg-brand-gradient shadow-aurora'
                              : 'border border-stroke bg-card/85 text-ink hover:border-brand'
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
                  <Trophy className="mx-auto h-14 w-14 text-coral" />
                  <h2 className="font-display text-3xl font-bold text-ink sm:text-4xl">Fin de Fiesta en Smart TV</h2>
                  <p className="text-sm text-muted">
                    {played.length + 1} temas reproducidos · Podio de DJs de la noche
                  </p>
                  <div className="mx-auto grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
                    {topDjs.map((dj, idx) => {
                      const rankTitles = ['1º PUESTO ORO', '2º PUESTO PLATA', '3º PUESTO BRONCE'];
                      return (
                        <div
                          key={dj.id}
                          className={`rounded-2xl border bg-card/85 p-4 backdrop-blur-md ${
                            idx === 0 ? 'border-coral/50' : 'border-stroke'
                          }`}
                        >
                          <p
                            className={`font-mono text-xs font-bold ${
                              idx === 0 ? 'text-coral' : 'text-muted'
                            }`}
                          >
                            {rankTitles[idx] ?? `${idx + 1}º PUESTO`}
                          </p>
                          <p className="mt-1 text-2xl text-ink">
                            {dj.avatarEmoji} @{dj.displayName}
                          </p>
                          <p
                            className={`font-mono text-sm font-bold ${
                              idx === 0 ? 'text-brand' : 'text-ink'
                            }`}
                          >
                            {dj.djPoints} pts
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => setAndroidScreen('tv_home')}
                    className="bg-brand-gradient inline-flex min-h-[48px] items-center justify-center rounded-full px-6 text-sm font-bold shadow-aurora"
                  >
                    OK · Volver al Inicio de TV
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </main>
  );
};
