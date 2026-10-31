"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import QRCode from "qrcode";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUpRight,
  Music2,
  QrCode,
  Radio,
  ScanLine,
  SkipForward,
  Wifi,
  X,
} from "lucide-react";
import { BallChip } from "@/components/ball-chip";
import { BrandMark } from "@/components/brand";
import { SourceBadge } from "@/components/source-badge";
import { cn } from "@/lib/cn";
import {
  demoNowPlaying,
  demoQueue,
  demoVenue,
  formatVotes,
  type DemoNowPlaying,
  type DemoTrack,
} from "@/lib/demo-data";

const equalizer = [14, 26, 38, 20, 44, 30, 18, 34, 48, 22, 36, 16, 28, 42];

function toNowPlaying(track: DemoTrack): DemoNowPlaying {
  return { ...track, elapsed: "0:00", elapsedPct: 0 };
}

export function PlayerDemo({ slug }: { slug: string }) {
  const [now, setNow] = useState<DemoNowPlaying | null>(demoNowPlaying);
  const [queue, setQueue] = useState<DemoTrack[]>(demoQueue);
  const [clock, setClock] = useState("--:--");
  const [qr, setQr] = useState<string | null>(null);
  const [qrFocus, setQrFocus] = useState(false);

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

  useEffect(() => {
    let active = true;

    QRCode.toDataURL(`https://poneleplay.app/p/${slug}`, {
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

  function skip() {
    const [next] = queue;
    setQueue((current) => current.slice(1));
    setNow(next ? toNowPlaying(next) : null);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const key = event.key.toLowerCase();

      if (key === "s") {
        const [next] = queue;
        setQueue((current) => current.slice(1));
        setNow(next ? toNowPlaying(next) : null);
      }

      if (key === "q") {
        setQrFocus((value) => !value);
      }

      if (key === "escape") {
        setQrFocus(false);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [queue]);

  return (
    <div className="grain relative flex min-h-dvh flex-col overflow-hidden bg-felt-950 text-cream lg:h-dvh">
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

      <header className="relative z-10 flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8 lg:px-12 lg:py-6">
        <div className="flex items-center gap-3">
          <Link href="/" aria-label="Volver a la maqueta">
            <BrandMark className="size-10" />
          </Link>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-cream/35">
              PonelePlay en
            </p>
            <p className="font-display text-lg font-bold leading-tight">
              {demoVenue.name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full border border-mint/20 bg-mint/[0.06] px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider text-mint">
            <span className="size-1.5 animate-pulse rounded-full bg-mint" />
            Noche abierta
          </span>
          <span className="rounded-full border border-cream/10 bg-cream/5 px-3 py-1.5 font-mono text-xs tabular-nums text-cream/50">
            {clock}
          </span>
        </div>
      </header>

      <main className="relative z-10 grid flex-1 items-center gap-6 px-5 pb-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(300px,27%)] lg:gap-10 lg:px-12 lg:pb-4">
        <section className="min-w-0">
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-amber">
            <Radio className="size-3.5" aria-hidden="true" />
            Ahora suena
          </p>

          {now ? (
            <>
              <h1 className="mt-3 max-w-5xl font-display text-[clamp(2.5rem,7vw,6.4rem)] font-black leading-[0.88] tracking-[-0.045em]">
                {now.title}
              </h1>
              <p className="mt-3 text-lg text-cream/55 sm:text-xl">
                {now.artist}
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <SourceBadge source={now.source} />
                <span className="rounded-full border border-cream/10 bg-cream/5 px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-cream/45">
                  {formatVotes(now.votes)}
                </span>
                <span className="rounded-full border border-cream/10 bg-cream/5 px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-cream/45">
                  Elegida por el salón
                </span>
              </div>

              <div className="mt-6 flex max-w-xl items-center gap-3">
                <span className="font-mono text-[10px] tabular-nums text-cream/40">
                  {now.elapsed}
                </span>
                <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-cream/10">
                  <div
                    className="h-full rounded-full bg-amber"
                    style={{ width: `${now.elapsedPct}%` }}
                  />
                  <span
                    className="absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-cream shadow-[0_0_12px_rgba(255,183,3,0.8)]"
                    style={{ left: `calc(${now.elapsedPct}% - 5px)` }}
                  />
                </div>
                <span className="font-mono text-[10px] tabular-nums text-cream/40">
                  {now.duration}
                </span>
              </div>

              <div className="mt-7 flex h-14 items-end gap-1.5 sm:h-16" aria-hidden="true">
                {equalizer.map((height, index) => (
                  <span
                    key={index}
                    className={cn(
                      "eq-bar w-1.5 rounded-full sm:w-2",
                      index % 5 === 0 ? "bg-mint/70" : "bg-amber/80",
                    )}
                    style={{
                      height: `${height}px`,
                      animationDelay: `${index * 0.07}s`,
                      animationDuration: `${760 + (index % 5) * 80}ms`,
                    }}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              <h1 className="mt-3 max-w-4xl font-display text-[clamp(2.5rem,6vw,5.2rem)] font-black leading-[0.9] tracking-[-0.04em]">
                La cola quedó vacía.
              </h1>
              <p className="mt-3 max-w-lg text-lg text-cream/50">
                El reproductor pasa a la playlist de fondo. Escaneá el QR para
                proponer el próximo tema.
              </p>
              <button
                type="button"
                onClick={() => setQrFocus(true)}
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-amber px-5 py-3 font-display text-sm font-bold text-ink"
              >
                <QrCode className="size-4" aria-hidden="true" />
                Mostrar QR
              </button>
            </>
          )}
        </section>

        <aside className="grid gap-3">
          <button
            type="button"
            onClick={() => setQrFocus(true)}
            className="group rounded-3xl bg-cream p-4 text-left text-ink shadow-2xl shadow-black/30 sm:p-5"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink/50">
                  Escaneá y votá
                </p>
                <p className="mt-1 font-display text-xl font-black leading-tight">
                  Tu voto,
                  <br />
                  tu canción.
                </p>
              </div>
              <div className="relative size-28 shrink-0 overflow-hidden rounded-xl ring-1 ring-ink/10 sm:size-32">
                {qr ? (
                  <Image
                    src={qr}
                    alt="QR para votar desde el celular"
                    width={520}
                    height={520}
                    unoptimized
                    className="size-full object-cover"
                  />
                ) : (
                  <span className="grid size-full place-items-center bg-cream">
                    <QrCode className="size-10 text-ink/20" aria-hidden="true" />
                  </span>
                )}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-dashed border-ink/20 pt-3">
              <span className="font-mono text-[9px] uppercase tracking-wider text-ink/55">
                1 crédito = 1 voto
              </span>
              <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-ink/55 transition-colors group-hover:text-ink">
                <ScanLine className="size-3" aria-hidden="true" />
                Abrir QR
              </span>
            </div>
          </button>

          <div className="rounded-3xl border border-cream/10 bg-felt-900/70 p-4 backdrop-blur">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-cream/40">
                En la cola
              </p>
              <span className="font-mono text-[9px] text-amber/80">
                {queue.length} temas
              </span>
            </div>

            {queue.length ? (
              <ol className="mt-3 space-y-2.5">
                {queue.slice(0, 4).map((track, index) => (
                  <li key={track.id} className="flex items-center gap-2.5">
                    <BallChip n={index + 1} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">
                        {track.title}
                      </p>
                      <p className="truncate text-[10px] text-cream/40">
                        {track.artist}
                      </p>
                    </div>
                    <span className="font-mono text-[10px] tabular-nums text-amber">
                      {track.votes}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-dashed border-cream/15 px-3 py-4">
                <Music2 className="size-4 text-cream/25" aria-hidden="true" />
                <p className="text-[11px] text-cream/35">
                  Playlist de fondo en curso.
                </p>
              </div>
            )}

            {queue.length > 4 ? (
              <p className="mt-2 font-mono text-[8px] uppercase tracking-wider text-cream/25">
                +{queue.length - 4} temas más en pantalla
              </p>
            ) : null}

            <p className="mt-3 border-t border-cream/10 pt-2 font-mono text-[8px] uppercase tracking-wider text-cream/25">
              Por votos · desempate por hora
            </p>
          </div>
        </aside>
      </main>

      <footer className="relative z-10 flex flex-wrap items-center justify-between gap-2 border-t border-cream/10 px-5 py-3 sm:px-8 lg:px-12">
        <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.22em] text-cream/30">
          <Wifi className="size-3 text-mint/60" aria-hidden="true" />
          La música la elige la mesa
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={skip}
            className="flex items-center gap-1.5 rounded-full border border-cream/10 bg-cream/5 px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider text-cream/40 transition-colors hover:text-cream"
          >
            Saltar
            <SkipForward className="size-3" aria-hidden="true" />
          </button>
          <span className="hidden font-mono text-[8px] uppercase tracking-wider text-cream/20 sm:inline">
            Atajos demo: Q · S
          </span>
          <Link
            href={`/panel/${slug}`}
            className="flex items-center gap-1 rounded-full border border-cream/10 bg-cream/5 px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider text-cream/40 transition-colors hover:text-cream"
          >
            Panel
            <ArrowUpRight className="size-3" aria-hidden="true" />
          </Link>
        </div>
      </footer>

      <AnimatePresence>
        {qrFocus ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] grid place-items-center bg-felt-950/95 p-6 backdrop-blur-xl"
            onClick={() => setQrFocus(false)}
            role="dialog"
            aria-modal="true"
            aria-label="QR para votar"
          >
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setQrFocus(false);
              }}
              className="absolute right-5 top-5 grid size-10 place-items-center rounded-full border border-cream/15 bg-cream/5 text-cream/60 transition-colors hover:bg-cream/10 hover:text-cream"
              aria-label="Cerrar QR"
              autoFocus
            >
              <X className="size-4" aria-hidden="true" />
            </button>
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
              className="text-center"
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-amber">
                Escaneá con la cámara
              </p>
              <div className="mx-auto mt-4 w-[min(78vw,420px)] rounded-[2rem] bg-cream p-6 text-ink shadow-2xl">
                <div className="relative mx-auto aspect-square w-full overflow-hidden rounded-2xl bg-cream">
                  {qr ? (
                    <Image
                      src={qr}
                      alt="QR grande para votar"
                      width={520}
                      height={520}
                      unoptimized
                      className="size-full object-cover"
                    />
                  ) : (
                    <span className="grid size-full place-items-center">
                      <QrCode
                        className="size-24 text-ink/20"
                        aria-hidden="true"
                      />
                    </span>
                  )}
                </div>
                <p className="mt-4 font-display text-2xl font-black">
                  PonelePlay
                </p>
                <p className="font-mono text-[10px] uppercase tracking-wider text-ink/50">
                  poneleplay.app/p/{slug}
                </p>
              </div>
              <p className="mt-4 flex items-center justify-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-cream/35">
                <X className="size-3" aria-hidden="true" />
                Tocá en cualquier lado para cerrar
              </p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
