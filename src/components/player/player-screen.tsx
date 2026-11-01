"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import {
  Maximize2,
  Minimize2,
  Music2,
  Radio,
  X,
} from "lucide-react";
import { BallChip } from "@/components/ball-chip";
import { BrandMark } from "@/components/brand";
import { SourceBadge } from "@/components/source-badge";
import { PlayerRuntime } from "@/components/player/player-runtime";
import { createYoutubeEngine } from "@/components/player/youtube-engine";
import type { PlaybackEngine } from "@/components/player/engine";
import type { PlayerStateResponse, PlayerTrack } from "@/lib/api/player";
import { demoNowPlaying, demoQueue, formatVotes } from "@/lib/demo-data";

const equalizer = [14, 26, 38, 20, 44, 30, 18, 34, 48, 22, 36, 16, 28, 42];

interface PlayerScreenProps {
  slug: string;
}

export function PlayerScreen({ slug }: PlayerScreenProps) {
  const searchParams = useSearchParams();
  const [token, setToken] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [isDemo, setIsDemo] = useState(false);
  const [playerState, setPlayerState] = useState<PlayerStateResponse | null>(null);

  const [clock, setClock] = useState("--:--");
  const [qr, setQr] = useState<string | null>(null);
  const [qrFocus, setQrFocus] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Check token from search params or localStorage
  useEffect(() => {
    const fromParam = searchParams.get("token");
    if (fromParam) {
      setToken(fromParam);
      localStorage.setItem(`poneleplay.player.${slug}`, fromParam);
      return;
    }

    const saved = localStorage.getItem(`poneleplay.player.${slug}`);
    if (saved) {
      setToken(saved);
    }
  }, [searchParams, slug]);

  // Live clock
  useEffect(() => {
    const update = () =>
      setClock(
        new Intl.DateTimeFormat("es-AR", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(new Date()),
      );

    update();
    const interval = window.setInterval(update, 15000);
    return () => window.clearInterval(interval);
  }, []);

  // QR Code generator
  useEffect(() => {
    let active = true;
    const clientUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/p/${slug}`
        : `https://poneleplay.app/p/${slug}`;

    QRCode.toDataURL(clientUrl, {
      margin: 1,
      width: 520,
      errorCorrectionLevel: "M",
      color: { dark: "#041611", light: "#f5e9d6" },
    })
      .then((url) => {
        if (active) setQr(url);
      })
      .catch(() => {
        if (active) setQr(null);
      });

    return () => {
      active = false;
    };
  }, [slug]);

  // Fullscreen state listener
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if (key === "f") {
        toggleFullscreen();
      }
      if (key === "q") {
        setQrFocus((val) => !val);
      }
      if (key === "escape") {
        setQrFocus(false);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Playback engine
  const engine: PlaybackEngine = useMemo(() => {
    return createYoutubeEngine("yt-player-target");
  }, []);

  // Now playing and queue derived from live state or demo
  const nowPlaying: PlayerTrack | null = useMemo(() => {
    if (playerState?.nowPlaying) return playerState.nowPlaying;
    if (isDemo) {
      return {
        itemId: demoNowPlaying.id,
        trackId: demoNowPlaying.id,
        title: demoNowPlaying.title,
        artist: demoNowPlaying.artist,
        source: demoNowPlaying.source,
        durationSeconds: 207,
        thumbnailUrl: null,
        voteCount: demoNowPlaying.votes,
      };
    }
    return null;
  }, [playerState, isDemo]);

  const queue: PlayerTrack[] = useMemo(() => {
    if (playerState?.queue) return playerState.queue;
    if (isDemo) {
      return demoQueue.map((item) => ({
        itemId: item.id,
        trackId: item.id,
        title: item.title,
        artist: item.artist,
        source: item.source,
        durationSeconds: 252,
        thumbnailUrl: null,
        voteCount: item.votes,
      }));
    }
    return [];
  }, [playerState, isDemo]);

  // Pairing gate
  if (!token && !isDemo) {
    return (
      <div className="grain relative flex min-h-dvh flex-col items-center justify-center bg-felt-950 p-6 text-cream">
        <div className="w-full max-w-md rounded-3xl border border-cream/15 bg-felt-900/80 p-8 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-3">
            <BrandMark className="size-10" />
            <div>
              <h1 className="font-display text-xl font-bold">
                Pantalla del Salón
              </h1>
              <p className="text-xs text-cream/50">PonelePlay TV</p>
            </div>
          </div>

          <p className="mt-6 text-sm text-cream/70 leading-relaxed">
            Esta pantalla requiere vincularse con un dispositivo autorizado
            desde el panel de control del bar.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (tokenInput.trim()) {
                setToken(tokenInput.trim());
                localStorage.setItem(
                  `poneleplay.player.${slug}`,
                  tokenInput.trim(),
                );
              }
            }}
            className="mt-6 space-y-4"
          >
            <div>
              <label
                htmlFor="player-token-input"
                className="block font-mono text-[11px] uppercase tracking-wider text-cream/50"
              >
                Pegá el token de la pantalla
              </label>
              <input
                id="player-token-input"
                type="text"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Token de 64 caracteres..."
                className="mt-2 w-full rounded-2xl border border-cream/15 bg-white/5 px-4 py-3 font-mono text-xs text-cream placeholder:text-cream/25 focus:border-amber focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={!tokenInput.trim()}
              className="w-full rounded-2xl bg-amber py-3 font-display text-sm font-bold text-[#041611] hover:bg-amber/90 disabled:opacity-50"
            >
              Conectar pantalla
            </button>
          </form>

          <div className="mt-6 flex items-center justify-between border-t border-cream/10 pt-5 text-xs">
            <Link
              href={`/panel/${slug}`}
              className="text-cream/50 hover:text-cream underline"
            >
              Abrir panel de control
            </Link>
            <button
              type="button"
              onClick={() => setIsDemo(true)}
              className="text-amber hover:underline font-semibold"
            >
              Probar en modo demo
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grain relative flex min-h-dvh flex-col overflow-hidden bg-felt-950 text-cream lg:h-dvh">
      {/* Hidden YouTube container for actual playback */}
      <div id="yt-player-target" className="hidden" aria-hidden="true" />

      {/* Runtime coordinator if connected with token */}
      {token ? (
        <PlayerRuntime
          token={token}
          slug={slug}
          engine={engine}
          onStateChange={(st) => setPlayerState(st)}
        />
      ) : null}

      {/* Background ambient glows */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 top-1/4 size-[28rem] rounded-full bg-amber/[0.07] blur-[120px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 -top-32 size-[34rem] rounded-full bg-mint/[0.05] blur-[130px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-felt-950 to-transparent"
      />

      {/* Header */}
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8 lg:px-12 lg:py-6">
        <div className="flex items-center gap-3">
          <Link href="/" aria-label="Volver">
            <BrandMark className="size-10" />
          </Link>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-cream/35">
              PonelePlay en
            </p>
            <p className="font-display text-lg font-bold leading-tight">
              {playerState?.venue.name || "Billar Aurora"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleFullscreen}
            className="grid size-9 place-items-center rounded-full border border-cream/10 bg-cream/5 text-cream/60 hover:text-cream"
            aria-label="Pantalla completa"
          >
            {isFullscreen ? (
              <Minimize2 className="size-4" />
            ) : (
              <Maximize2 className="size-4" />
            )}
          </button>

          <span className="flex items-center gap-1.5 rounded-full border border-mint/20 bg-mint/[0.06] px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider text-mint">
            <span className="size-1.5 animate-pulse rounded-full bg-mint" />
            {isDemo ? "Modo Demo" : "Noche abierta"}
          </span>

          <span className="rounded-full border border-cream/10 bg-cream/5 px-3 py-1.5 font-mono text-xs tabular-nums text-cream/50">
            {clock}
          </span>
        </div>
      </header>

      {/* Main layout: Now playing (left) + Up next (right) */}
      <main className="relative z-10 grid flex-1 items-center gap-6 px-5 pb-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(300px,27%)] lg:gap-10 lg:px-12 lg:pb-4">
        <section className="min-w-0">
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-amber">
            <Radio className="size-3.5" aria-hidden="true" />
            Ahora suena
          </p>

          {nowPlaying ? (
            <>
              <h1 className="mt-3 max-w-5xl font-display text-[clamp(2.5rem,7vw,6.4rem)] font-black leading-[0.88] tracking-[-0.045em] text-cream">
                {nowPlaying.title}
              </h1>

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-base text-cream/75 sm:text-xl lg:text-2xl">
                <span className="font-semibold text-cream">
                  {nowPlaying.artist}
                </span>
                <span className="text-cream/25">·</span>
                <SourceBadge source={nowPlaying.source} />
                <span className="text-cream/25">·</span>
                <span className="font-mono text-sm text-amber font-bold">
                  {formatVotes(nowPlaying.voteCount)}
                </span>
              </div>
            </>
          ) : (
            <div className="mt-8 rounded-3xl border border-dashed border-cream/15 p-12 text-center">
              <Music2 className="mx-auto size-12 text-cream/25" />
              <h2 className="mt-4 font-display text-2xl font-bold">
                Esperando la próxima canción...
              </h2>
              <p className="mt-2 text-sm text-cream/50">
                Escaneá el código QR para sumar tu tema a la cola.
              </p>
            </div>
          )}

          {/* Equalizer animation */}
          <div
            aria-hidden="true"
            className="mt-8 flex h-12 items-end gap-1.5 sm:gap-2"
          >
            {equalizer.map((height, index) => (
              <span
                key={index}
                className="w-1.5 rounded-full bg-gradient-to-t from-amber to-mint sm:w-2"
                style={{
                  height: `${height}px`,
                  animation: `pulse 1.4s ease-in-out ${index * 0.1}s infinite alternate`,
                }}
              />
            ))}
          </div>
        </section>

        {/* Up Next column */}
        <section className="flex flex-col rounded-3xl border border-cream/10 bg-white/[0.02] p-5 backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-cream/10 pb-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-cream/45">
              A continuación ({queue.length})
            </p>
            <span className="font-mono text-[10px] text-cream/35">
              Por votos
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {queue.slice(0, 4).map((item, index) => (
              <div
                key={item.itemId}
                className="flex items-center gap-3 rounded-2xl border border-cream/5 bg-white/[0.015] p-3"
              >
                <BallChip n={index + 1} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-cream">
                    {item.title}
                  </p>
                  <p className="truncate text-xs text-cream/45">
                    {item.artist}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-xs font-bold text-amber">
                  {formatVotes(item.voteCount)}
                </span>
              </div>
            ))}

            {queue.length === 0 ? (
              <p className="py-6 text-center text-xs text-cream/40">
                No hay temas en cola de espera.
              </p>
            ) : null}
          </div>
        </section>
      </main>

      {/* Floating QR Pill */}
      <aside
        className={
          qrFocus
            ? "fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-6"
            : "fixed bottom-5 right-5 z-20 flex items-center gap-4 rounded-3xl border border-cream/15 bg-felt-900/90 p-4 shadow-2xl backdrop-blur-md sm:bottom-8 sm:right-8"
        }
      >
        {qr ? (
          <div
            onClick={() => setQrFocus(!qrFocus)}
            className="cursor-pointer transition-transform hover:scale-105"
          >
            <Image
              src={qr}
              alt="QR para votar"
              width={qrFocus ? 320 : 84}
              height={qrFocus ? 320 : 84}
              className="rounded-2xl"
              unoptimized
            />
          </div>
        ) : null}

        {!qrFocus ? (
          <div className="hidden sm:block">
            <p className="font-display text-sm font-bold text-cream">
              ¡Pedí tu tema!
            </p>
            <p className="font-mono text-[10px] text-cream/50">
              Escaneá el QR con tu celular
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setQrFocus(false)}
            className="absolute top-6 right-6 text-cream/60 hover:text-cream"
          >
            <X className="size-8" />
          </button>
        )}
      </aside>
    </div>
  );
}

