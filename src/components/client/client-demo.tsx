"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  BadgeCheck,
  Check,
  ChevronRight,
  Disc3,
  Info,
  ListMusic,
  Music2,
  Plus,
  Search,
  Ticket,
  X,
} from "lucide-react";
import { BallChip } from "@/components/ball-chip";
import { BrandMark, Wordmark } from "@/components/brand";
import { SourceBadge } from "@/components/source-badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { TicketCode } from "@/components/ticket-code";
import { cn } from "@/lib/cn";
import {
  demoNowPlaying,
  demoQueue,
  demoSearchCatalog as searchCatalog,
  demoSearchSuggestions,
  demoVenue,
  formatVotes,
  sortQueue,
  type DemoTrack,
} from "@/lib/demo-data";

type TabId = "cola" | "buscar" | "votos";

const tabs = [
  { id: "cola" as const, label: "La cola", icon: ListMusic },
  { id: "buscar" as const, label: "Proponer", icon: Search },
  { id: "votos" as const, label: "Mis votos", icon: Ticket },
];

export function ClientDemo({ slug }: { slug: string }) {
  const [tab, setTab] = useState<TabId>("cola");
  const [queue, setQueue] = useState<DemoTrack[]>(demoQueue);
  const [credits, setCredits] = useState(demoVenue.initialCredits);
  const [voted, setVoted] = useState<Set<string>>(() => new Set());
  const [myProposals, setMyProposals] = useState<Set<string>>(() => new Set());
  const [spent, setSpent] = useState(0);
  const [query, setQuery] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [usedCodes, setUsedCodes] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<{
    message: string;
    tone: "ok" | "error";
  } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return searchCatalog;
    return searchCatalog.filter((track) =>
      `${track.title} ${track.artist}`.toLowerCase().includes(term),
    );
  }, [query]);

  function notify(message: string, tone: "ok" | "error" = "ok") {
    setToast({ message, tone });
  }

  function openCodeSheet() {
    setSheetOpen(true);
  }

  function vote(track: DemoTrack) {
    if (voted.has(track.id)) {
      notify("Ya votaste este tema esta noche.", "error");
      return;
    }

    if (credits <= 0) {
      notify("Te quedaste sin votos. Canjeá un código.", "error");
      openCodeSheet();
      return;
    }

    setCredits((current) => current - 1);
    setSpent((current) => current + 1);
    setVoted((current) => new Set(current).add(track.id));
    setQueue((current) =>
      current
        .map((item) =>
          item.id === track.id ? { ...item, votes: item.votes + 1 } : item,
        )
        .sort(sortQueue),
    );
    notify(`Voto para «${track.title}». La cola se reacomodó.`);
  }

  function propose(track: DemoTrack) {
    const exists = queue.some(
      (item) => item.title === track.title && item.artist === track.artist,
    );

    if (exists) {
      notify("Ese tema ya está en la cola.", "error");
      return;
    }

    const proposed: DemoTrack = {
      ...track,
      id: `p-${track.id}-${Date.now()}`,
      votes: 0,
      proposedAt: Date.now(),
    };

    setQueue((current) => [...current, proposed]);
    setMyProposals((current) => new Set(current).add(proposed.id));
    setQuery("");
    setTab("cola");
    notify(`«${track.title}» entró a la cola.`);
  }

  function redeem(code: string) {
    const normalized = code.trim().toUpperCase();

    if (normalized.length !== 8) {
      return { ok: false as const, error: "El código tiene 8 caracteres." };
    }

    if (usedCodes.has(normalized)) {
      return { ok: false as const, error: "Ese código ya fue usado." };
    }

    if (normalized !== demoVenue.demoCode) {
      return {
        ok: false as const,
        error: "Código inválido o vencido. Pedile uno al mozo.",
      };
    }

    setUsedCodes((current) => new Set(current).add(normalized));
    setCredits((current) => current + 5);
    return { ok: true as const, credits: 5 };
  }

  const votedTracks = queue.filter((track) => voted.has(track.id));
  const proposedTracks = queue.filter((track) => myProposals.has(track.id));

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-th-canvas text-th-text">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-y-0 left-0 z-0 hidden w-[calc((100vw-32rem)/2)] items-center justify-center xl:flex"
      >
        <span className="rotate-180 font-mono text-[10px] uppercase tracking-[0.5em] text-th-muted/50 [writing-mode:vertical-rl]">
          La música la pone la gente
        </span>
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-y-0 right-0 z-0 hidden w-[calc((100vw-32rem)/2)] items-center justify-center xl:flex"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.5em] text-th-muted/50 [writing-mode:vertical-rl]">
          PonelePlay · {slug}
        </span>
      </div>

      <div className="relative z-10 mx-auto min-h-dvh w-full max-w-lg px-4 pb-28 pt-4">
        <header className="sticky top-0 z-30 -mx-4 mb-5 border-b border-th-border bg-th-shell/90 px-4 py-3 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <BrandMark className="size-9" />
              <div className="min-w-0">
                <Wordmark className="text-lg" />
                <p className="truncate font-mono text-[9px] uppercase tracking-[0.18em] text-th-muted">
                  {demoVenue.name}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden items-center gap-1.5 rounded-full border border-th-emerald/30 bg-th-emerald-soft px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-wider text-th-emerald sm:flex">
                <span className="size-1.5 animate-pulse rounded-full bg-th-emerald" />
                Noche abierta
              </span>
              <ThemeToggle variant="compact" />
              <button
                type="button"
                onClick={openCodeSheet}
                className="flex items-center gap-1.5 rounded-full bg-th-accent hover:bg-th-accent-hover px-3 py-2 font-mono text-[11px] font-bold text-th-on-accent transition-transform active:scale-95 tabular-nums"
                aria-label={`Tus votos: ${credits}. Canjear código`}
              >
                <Ticket className="size-3.5" aria-hidden="true" />
                {credits}
              </button>
            </div>
          </div>
        </header>

        {tab === "cola" ? (
          <motion.div
            key="cola"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <NowPlayingCard />

            <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-th-amber/30 bg-th-amber-soft px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-full bg-th-amber text-slate-950">
                  <Ticket className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-th-amber">
                    Tus votos
                  </p>
                  <p className="font-display text-xl font-bold leading-none text-th-text tabular-nums">
                    {credits}{" "}
                    <span className="text-sm font-medium text-th-secondary">
                      disponibles
                    </span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={openCodeSheet}
                className="flex items-center gap-1 rounded-full border border-th-amber/40 bg-th-card px-3 py-2 text-xs font-semibold text-th-amber transition-colors hover:bg-th-amber hover:text-slate-950"
              >
                Canjear
                <ChevronRight className="size-3.5" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-7 flex items-end justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-th-muted">
                  La cola
                </p>
                <h2 className="font-display text-2xl font-bold tracking-tight text-th-text">
                  Votá la próxima
                </h2>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-wider text-th-muted tabular-nums">
                {queue.length} temas
              </span>
            </div>

            <motion.ol layout className="mt-3 space-y-2 max-h-[420px] pr-1 ui-scroll-container">
              <AnimatePresence initial={false}>
                {queue.map((track, index) => (
                  <motion.li
                    layout
                    key={track.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  >
                    <QueueRow
                      track={track}
                      rank={index + 1}
                      voted={voted.has(track.id)}
                      onVote={() => vote(track)}
                    />
                  </motion.li>
                ))}
              </AnimatePresence>
            </motion.ol>

            <p className="mt-5 flex items-start gap-2 px-1 text-[11px] leading-relaxed text-th-muted">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              La cola se ordena por votos. Si hay empate, pasa primero la
              propuesta más antigua.
            </p>
          </motion.div>
        ) : null}

        {tab === "buscar" ? (
          <motion.div
            key="buscar"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-th-muted">
                  Sumá tu tema
                </p>
                <h1 className="font-display text-3xl font-extrabold tracking-tight text-th-text">
                  Poné tu canción
                </h1>
              </div>
              <span className="rounded-full border border-th-emerald/30 bg-th-emerald-soft px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-wider text-th-emerald">
                Gratis
              </span>
            </div>

            <label className="mt-5 flex items-center gap-2 rounded-2xl border border-th-border bg-th-card px-4 py-3 focus-within:border-th-accent shadow-xs">
              <Search
                className="size-4 shrink-0 text-th-muted"
                aria-hidden="true"
              />
              <span className="sr-only">Buscar en YouTube</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Artista o canción..."
                className="w-full bg-transparent text-sm text-th-text outline-none placeholder:text-th-muted"
                autoComplete="off"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="grid size-6 place-items-center rounded-full bg-th-recessed text-th-muted hover:text-th-text"
                  aria-label="Borrar búsqueda"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </label>

            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {demoSearchSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setQuery(suggestion)}
                  className="shrink-0 rounded-full border border-th-border bg-th-card px-3 py-1.5 text-[11px] font-medium text-th-secondary transition-colors hover:border-th-accent hover:text-th-accent"
                >
                  {suggestion}
                </button>
              ))}
            </div>

            <div className="mt-6 flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-th-muted">
                Resultados de YouTube
              </p>
              <span className="font-mono text-[9px] text-th-muted tabular-nums">
                {results.length}
              </span>
            </div>

            <ul className="mt-2 space-y-2 max-h-[380px] pr-1 ui-scroll-container">
              {results.map((track) => {
                const exists = queue.some(
                  (item) =>
                    item.title === track.title && item.artist === track.artist,
                );

                return (
                  <li
                    key={track.id}
                    className="flex items-center gap-3 rounded-2xl border border-th-border bg-th-card p-2.5 shadow-xs"
                  >
                    <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-th-recessed border border-th-border">
                      <Music2
                        className="size-5 text-th-muted"
                        aria-hidden="true"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-th-text">
                        {track.title}
                      </p>
                      <p className="truncate text-[11px] text-th-muted">
                        {track.artist} · {track.duration}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => propose(track)}
                      disabled={exists}
                      className={cn(
                        "flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-[11px] font-bold transition-colors",
                        exists
                          ? "cursor-default bg-th-recessed text-th-muted"
                          : "bg-th-accent text-th-on-accent hover:bg-th-accent-hover",
                      )}
                    >
                      {exists ? (
                        <>
                          <Check
                            className="size-3.5"
                            aria-hidden="true"
                          />
                          En la cola
                        </>
                      ) : (
                        <>
                          <Plus className="size-3.5" aria-hidden="true" />
                          Proponer
                        </>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            {results.length === 0 ? (
              <div className="mt-10 flex flex-col items-center text-center">
                <Music2
                  className="size-8 text-th-muted"
                  aria-hidden="true"
                />
                <p className="mt-3 font-display text-lg font-bold text-th-text">
                  No encontramos ese tema
                </p>
                <p className="mt-1 max-w-xs text-xs text-th-muted">
                  Probá con el nombre del artista o pegá el link del video.
                </p>
              </div>
            ) : null}

            <p className="mt-5 flex items-start gap-2 px-1 text-[11px] leading-relaxed text-th-muted">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Las propuestas entran directo a la cola. Máximo 3 por noche y una
              cada 30 segundos. No se repiten temas.
            </p>
          </motion.div>
        ) : null}

        {tab === "votos" ? (
          <motion.div
            key="votos"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-th-muted">
                  Tu noche
                </p>
                <h1 className="font-display text-3xl font-extrabold tracking-tight text-th-text">
                  Mis votos
                </h1>
              </div>
              <button
                type="button"
                onClick={openCodeSheet}
                className="flex items-center gap-1.5 rounded-full bg-th-accent hover:bg-th-accent-hover px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-th-on-accent"
              >
                <Ticket className="size-3.5" aria-hidden="true" />
                Canjear
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <div className="card-panel rounded-2xl p-4">
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-th-muted">
                  Votos disponibles
                </p>
                <p className="mt-2 font-display text-4xl font-extrabold text-th-accent tabular-nums">
                  {credits}
                </p>
              </div>
              <div className="card-panel rounded-2xl p-4">
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-th-muted">
                  Votos emitidos
                </p>
                <p className="mt-2 font-display text-4xl font-extrabold text-th-text tabular-nums">
                  {spent}
                </p>
              </div>
            </div>

            <section className="mt-7">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-th-muted">
                Temas que votaste
              </h2>
              {votedTracks.length ? (
                <ul className="mt-2 space-y-2">
                  {votedTracks.map((track) => (
                    <li
                      key={track.id}
                      className="flex items-center gap-3 rounded-xl border border-th-emerald/25 bg-th-emerald-soft px-3 py-2.5"
                    >
                      <Check
                        className="size-4 shrink-0 text-th-emerald"
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-th-text">
                          {track.title}
                        </p>
                        <p className="truncate text-[11px] text-th-muted">
                          {track.artist}
                        </p>
                      </div>
                      <span className="font-mono text-[10px] font-bold text-th-emerald">
                        {formatVotes(track.votes)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-th-muted">
                  Todavía no votaste ningún tema.
                </p>
              )}
            </section>

            <section className="mt-6">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-th-muted">
                Temas que propusiste
              </h2>
              {proposedTracks.length ? (
                <ul className="mt-2 space-y-2">
                  {proposedTracks.map((track) => (
                    <li
                      key={track.id}
                      className="flex items-center gap-3 rounded-xl border border-th-border bg-th-card px-3 py-2.5"
                    >
                      <Music2
                        className="size-4 shrink-0 text-th-muted"
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-th-text">
                          {track.title}
                        </p>
                        <p className="truncate text-[11px] text-th-muted">
                          {track.artist}
                        </p>
                      </div>
                      <SourceBadge
                        source={track.source}
                        label={false}
                        className="shrink-0"
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-th-muted">
                  Todavía no propusiste ningún tema.
                </p>
              )}
            </section>

            {!votedTracks.length && !proposedTracks.length ? (
              <div className="mt-10 flex flex-col items-center rounded-3xl border border-dashed border-th-border px-6 py-10 text-center">
                <Disc3
                  className="size-10 text-th-muted"
                  aria-hidden="true"
                />
                <p className="mt-3 font-display text-xl font-bold text-th-text">
                  Todavía no moviste la aguja
                </p>
                <p className="mt-1 max-w-xs text-xs leading-relaxed text-th-muted">
                  Votá un tema de la cola o proponé el que quieras escuchar.
                </p>
                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTab("cola")}
                    className="rounded-full bg-th-accent px-4 py-2 text-xs font-bold text-th-on-accent"
                  >
                    Ver la cola
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("buscar")}
                    className="rounded-full border border-th-border bg-th-card px-4 py-2 text-xs font-semibold text-th-secondary hover:text-th-text"
                  >
                    Proponer
                  </button>
                </div>
              </div>
            ) : null}
          </motion.div>
        ) : null}

        <BottomNav tab={tab} onChange={setTab} />
      </div>

      <Toast toast={toast} />

      <AnimatePresence>
        {sheetOpen ? (
          <RedeemSheet
            key="redeem"
            venueName={demoVenue.name}
            onClose={() => setSheetOpen(false)}
            onRedeem={redeem}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function NowPlayingCard() {
  return (
    <section className="card-panel relative overflow-hidden rounded-[2rem] p-5">
      <div
        aria-hidden="true"
        className="absolute -right-12 -top-16 size-48 rounded-full border border-th-accent/15 bg-th-accent-soft/40"
      />
      <div
        aria-hidden="true"
        className="absolute -right-2 -top-6 size-24 rounded-full border border-th-accent/10"
      />

      <div className="relative flex items-center justify-between">
        <span className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-th-accent">
          <span className="flex size-4 items-center justify-center rounded-full bg-th-danger-soft">
            <span className="size-1.5 animate-pulse rounded-full bg-th-danger" />
          </span>
          Suena ahora
        </span>
        <SourceBadge source={demoNowPlaying.source} />
      </div>

      <div className="relative mt-4 flex items-center gap-4">
        <div className="relative size-24 shrink-0">
          <div
            className="spin-slow absolute inset-0 rounded-full ring-1 ring-th-border-strong shadow-md"
            style={{
              background:
                "repeating-radial-gradient(circle at center, #0b0b0b 0 2px, #1b1b1b 2px 4px)",
            }}
          >
            <span className="absolute left-1/2 top-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-th-accent font-display text-[10px] font-black text-th-on-accent">
              PP
            </span>
          </div>
          <span className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-950" />
        </div>

        <div className="min-w-0">
          <h1 className="font-display text-[2rem] font-extrabold leading-[0.92] tracking-[-0.03em] text-th-text">
            {demoNowPlaying.title}
          </h1>
          <p className="mt-1.5 text-sm text-th-secondary">
            {demoNowPlaying.artist}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Equalizer />
            <span className="text-[11px] text-th-muted">
              La eligió la gente
            </span>
          </div>
        </div>
      </div>

      <div className="relative mt-5 flex items-center gap-3">
        <span className="font-mono text-[10px] text-th-muted tabular-nums">
          {demoNowPlaying.elapsed}
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-th-recessed">
          <div
            className="h-full rounded-full bg-th-accent"
            style={{ width: `${demoNowPlaying.elapsedPct}%` }}
          />
        </div>
        <span className="font-mono text-[10px] text-th-muted tabular-nums">
          {demoNowPlaying.duration}
        </span>
      </div>
    </section>
  );
}

function QueueRow({
  track,
  rank,
  voted,
  onVote,
}: {
  track: DemoTrack;
  rank: number;
  voted: boolean;
  onVote: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border p-3 transition-colors shadow-xs",
        rank === 1
          ? "border-th-accent/40 bg-th-accent-soft"
          : "border-th-border bg-th-card",
      )}
    >
      <BallChip n={rank} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-sm font-semibold text-th-text">{track.title}</p>
          {rank === 1 ? (
            <span className="shrink-0 rounded-full bg-th-accent px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-th-on-accent">
              próxima
            </span>
          ) : null}
        </div>
        <p className="truncate text-[11px] text-th-muted">
          {track.artist} · {track.duration}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        <span className="font-mono text-[11px] font-semibold text-th-secondary tabular-nums">
          {track.votes}
        </span>
        <button
          type="button"
          onClick={onVote}
          aria-label={
            voted ? `Ya votaste por ${track.title}` : `Votar por ${track.title}`
          }
          className={cn(
            "grid size-10 place-items-center rounded-full border transition-all active:scale-90",
            voted
              ? "border-th-emerald/35 bg-th-emerald-soft text-th-emerald"
              : "border-th-accent bg-th-accent text-th-on-accent hover:bg-th-accent-hover",
          )}
        >
          {voted ? (
            <Check className="size-4" aria-hidden="true" />
          ) : (
            <Plus className="size-5" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}

function Equalizer() {
  return (
    <span className="flex h-4 items-end gap-[3px]" aria-hidden="true">
      {[0.55, 1, 0.4, 0.8, 0.6].map((scale, index) => (
        <span
          key={index}
          className="eq-bar w-[3px] rounded-full bg-th-accent"
          style={{
            height: `${Math.round(scale * 16)}px`,
            animationDelay: `${index * 120}ms`,
          }}
        />
      ))}
    </span>
  );
}

function BottomNav({
  tab,
  onChange,
}: {
  tab: TabId;
  onChange: (tab: TabId) => void;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40">
      <div className="mx-auto w-full max-w-lg border-t border-th-border bg-th-shell/95 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl">
        <div className="grid grid-cols-3 gap-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              aria-current={tab === id ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl py-2 font-mono text-[9px] font-semibold uppercase tracking-wider transition-colors",
                tab === id
                  ? "bg-th-accent text-th-on-accent"
                  : "text-th-muted hover:text-th-text",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}

function RedeemSheet({
  venueName,
  onClose,
  onRedeem,
}: {
  venueName: string;
  onClose: () => void;
  onRedeem: (
    code: string,
  ) => { ok: true; credits: number } | { ok: false; error: string };
}) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ code: string; credits: number } | null>(
    null,
  );

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = original;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = onRedeem(input);

    if (result.ok) {
      setSuccess({ code: input.trim().toUpperCase(), credits: result.credits });
      setError(null);
      setInput("");
      return;
    }

    setError(result.error);
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="redeem-title"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/65 backdrop-blur-sm"
      />

      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 360, damping: 32 }}
        className="card-panel relative w-full max-w-lg rounded-t-[2rem] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-[2rem]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-th-amber">
              Canjeá tus votos
            </p>
            <h2
              id="redeem-title"
              className="mt-1 font-display text-2xl font-extrabold tracking-tight text-th-text"
            >
              {success ? "Listo, tenés más votos" : "Pedí tu código en la barra"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-full border border-th-border bg-th-recessed text-th-muted hover:text-th-text"
            aria-label="Cerrar"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        {success ? (
          <div className="mt-5">
            <div className="flex items-center gap-2 rounded-xl border border-th-emerald/30 bg-th-emerald-soft px-3 py-2 text-sm text-th-emerald font-medium">
              <BadgeCheck className="size-4" aria-hidden="true" />
              Código aceptado. Se sumaron {success.credits} votos.
            </div>
            <TicketCode
              code={success.code}
              credits={success.credits}
              venueName={venueName}
              notchColor="var(--bg-card)"
              className="mt-4"
            />
            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full rounded-full bg-th-accent hover:bg-th-accent-hover px-5 py-3 font-display text-sm font-bold text-th-on-accent transition-transform active:scale-[0.99]"
            >
              Empezar a votar
            </button>
            <button
              type="button"
              onClick={() => {
                setSuccess(null);
                setError(null);
              }}
              className="mt-2 w-full rounded-full py-2 text-xs font-semibold text-th-muted hover:text-th-text"
            >
              Canjear otro código
            </button>
          </div>
        ) : (
          <>
            <p className="mt-3 text-sm leading-relaxed text-th-secondary">
              Con cada consumición te damos un código de un uso. Los votos
              vencen cuando cierra la noche.
            </p>

            <form onSubmit={handleSubmit} className="mt-5">
              <label
                htmlFor="vote-code"
                className="ui-label"
              >
                Código de 8 caracteres
              </label>
              <input
                id="vote-code"
                value={input}
                onChange={(event) => {
                  setInput(
                    event.target.value
                      .toUpperCase()
                      .replace(/[^A-Z2-9]/g, "")
                      .slice(0, 8),
                  );
                  setError(null);
                }}
                placeholder="MESAPLAY"
                className="ui-input mt-2 px-4 py-3 font-mono text-xl font-bold tracking-[0.3em] uppercase"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                autoFocus
              />

              {error ? (
                <p
                  role="alert"
                  className="mt-2 flex items-center gap-1.5 text-xs text-th-danger"
                >
                  <Info className="size-3.5" aria-hidden="true" />
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-th-accent hover:bg-th-accent-hover px-5 py-3 font-display text-sm font-bold text-th-on-accent transition-transform active:scale-[0.99]"
              >
                <Ticket className="size-4" aria-hidden="true" />
                Canjear código
              </button>
            </form>

            <p className="mt-3 text-center font-mono text-[9px] uppercase tracking-[0.16em] text-th-muted">
              Demo: MESAPLAY
            </p>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

function Toast({
  toast,
}: {
  toast: { message: string; tone: "ok" | "error" } | null;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4">
      <AnimatePresence>
        {toast ? (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            className={cn(
              "card-panel flex max-w-sm items-center gap-2 rounded-full border px-4 py-2.5 text-center text-xs text-th-text shadow-xl",
              toast.tone === "ok"
                ? "border-th-emerald/35"
                : "border-th-danger/35",
            )}
            role="status"
          >
            {toast.tone === "ok" ? (
              <BadgeCheck
                className="size-4 shrink-0 text-th-emerald"
                aria-hidden="true"
              />
            ) : (
              <Info
                className="size-4 shrink-0 text-th-danger"
                aria-hidden="true"
              />
            )}
            {toast.message}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
