"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  BadgeCheck,
  Disc3,
  Info,
  ListMusic,
  Search,
  Ticket,
} from "lucide-react";
import { BrandMark, Wordmark } from "@/components/brand";
import { ensureAnonymousParticipant } from "@/lib/api/anon";
import { createNightStateSource } from "@/lib/api/night-state";
import { deriveNightPhase } from "@/lib/api/contracts";
import { castVote, voteErrorMessage } from "@/lib/api/votes";
import { useNightState } from "@/hooks/use-night-state";
import { OfflineBanner } from "./parts/offline-banner";
import { ClosedState } from "./parts/closed-state";
import { NowPlayingCard } from "./parts/now-playing-card";
import { BalanceCard } from "./parts/balance-card";
import { QueueRow } from "./parts/queue-row";
import { RedeemSheet } from "./parts/redeem-sheet";
import { ProposalSearch } from "./parts/proposal-search";
import { cn } from "@/lib/cn";

type TabId = "cola" | "buscar" | "votos";

const tabs = [
  { id: "cola" as const, label: "La cola", icon: ListMusic },
  { id: "buscar" as const, label: "Proponer", icon: Search },
  { id: "votos" as const, label: "Mis votos", icon: Ticket },
];

export function ClientNight({ slug }: { slug: string }) {
  const source = useMemo(() => createNightStateSource(slug), [slug]);
  const { state, loading, offline, refresh } = useNightState(source);

  const [tab, setTab] = useState<TabId>("cola");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingVotes, setPendingVotes] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<{
    message: string;
    tone: "ok" | "error" | "info";
  } | null>(null);

  useEffect(() => {
    void ensureAnonymousParticipant(slug).catch(() => {
      // Handled via offline/night state
    });
  }, [slug]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  function notify(message: string, tone: "ok" | "error" | "info" = "info") {
    setToast({ message, tone });
  }

  const credits = state?.me?.credits ?? 0;
  const queue = state?.queue ?? [];

  async function handleVote(queueItemId: string) {
    if (credits <= 0) {
      notify("Te quedaste sin votos. Canjeá un código.", "error");
      setSheetOpen(true);
      return;
    }

    setPendingVotes((prev) => new Set(prev).add(queueItemId));
    try {
      const res = await castVote(queueItemId);
      if (res.ok) {
        notify("¡Voto computado! La cola se actualizó.", "ok");
        await refresh();
      } else {
        notify(voteErrorMessage(res.error), "error");
        if (res.error === "no_credits") {
          setSheetOpen(true);
        }
      }
    } catch {
      notify("Error de red al votar. Reintentá en unos segundos.", "error");
    } finally {
      setPendingVotes((prev) => {
        const next = new Set(prev);
        next.delete(queueItemId);
        return next;
      });
    }
  }

  if (loading && !state) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-felt-950 px-4 text-cream">
        <BrandMark className="size-12 animate-pulse text-amber" />
        <p className="mt-4 font-mono text-xs uppercase tracking-widest text-cream/40">
          Cargando PonelePlay...
        </p>
      </div>
    );
  }

  const phase = state ? deriveNightPhase(state) : "closed";

  if (!state || phase === "closed") {
    return (
      <div className="relative min-h-dvh bg-felt-950 px-4 text-cream">
        {offline ? <OfflineBanner /> : null}
        <ClosedState
          venueName={state?.venue.name ?? slug}
          joinMessage={state?.venue.joinMessage}
        />
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-felt-950 text-cream">
      {offline ? <OfflineBanner /> : null}

      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-y-0 left-0 z-0 hidden w-[calc((100vw-32rem)/2)] items-center justify-center xl:flex"
      >
        <span className="rotate-180 font-mono text-[10px] uppercase tracking-[0.5em] text-cream/15 [writing-mode:vertical-rl]">
          La música la pone la gente
        </span>
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-y-0 right-0 z-0 hidden w-[calc((100vw-32rem)/2)] items-center justify-center xl:flex"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.5em] text-cream/15 [writing-mode:vertical-rl]">
          PonelePlay · {state.venue.slug}
        </span>
      </div>

      <div className="relative z-10 mx-auto min-h-dvh w-full max-w-lg px-4 pb-28 pt-4">
        {/* Sticky Header */}
        <header className="sticky top-0 z-30 -mx-4 mb-5 border-b border-cream/10 bg-felt-950/85 px-4 py-3 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <BrandMark className="size-9" />
              <div className="min-w-0">
                <Wordmark className="text-lg" />
                <p className="truncate font-mono text-[9px] uppercase tracking-[0.18em] text-cream/40">
                  {state.venue.name}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden items-center gap-1.5 rounded-full border border-mint/25 bg-mint/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-mint sm:flex">
                <span className="size-1.5 animate-pulse rounded-full bg-mint" />
                Noche abierta
              </span>
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                className="flex items-center gap-1.5 rounded-full bg-amber px-3 py-2 font-mono text-[11px] font-bold text-ink transition-transform active:scale-95"
                aria-label={`Tus votos: ${credits}. Canjear código`}
              >
                <Ticket className="size-3.5" aria-hidden="true" />
                {credits}
              </button>
            </div>
          </div>
        </header>

        {/* Tab 1: La cola */}
        {tab === "cola" ? (
          <motion.div
            key="cola"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <NowPlayingCard item={state.nowPlaying} />

            <div className="mt-4">
              <BalanceCard
                credits={credits}
                onOpenRedeem={() => setSheetOpen(true)}
              />
            </div>

            <div className="mt-7 flex items-end justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-cream/40">
                  La cola
                </p>
                <h2 className="font-display text-2xl font-bold tracking-tight">
                  Votá la próxima
                </h2>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-wider text-cream/35">
                {queue.length} {queue.length === 1 ? "tema" : "temas"}
              </span>
            </div>

            {queue.length === 0 ? (
              <div className="mt-6 flex flex-col items-center rounded-3xl border border-dashed border-cream/15 px-6 py-10 text-center">
                <Disc3 className="size-10 text-cream/25" aria-hidden="true" />
                <p className="mt-3 font-display text-xl font-bold">
                  La cola está vacía
                </p>
                <p className="mt-1 max-w-xs text-xs leading-relaxed text-cream/40">
                  Sé el primero en proponer una canción para que empiece a sonar.
                </p>
                <button
                  type="button"
                  onClick={() => setTab("buscar")}
                  className="mt-4 rounded-full bg-amber px-4 py-2 font-display text-xs font-bold text-ink"
                >
                  Proponer canción
                </button>
              </div>
            ) : (
              <motion.ol layout className="mt-3 space-y-2">
                <AnimatePresence initial={false}>
                  {queue.map((item, index) => (
                    <motion.li
                      layout
                      key={item.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -24 }}
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    >
                      <QueueRow
                        item={item}
                        rank={index + 1}
                        disabled={pendingVotes.has(item.id)}
                        onVote={() => void handleVote(item.id)}
                      />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </motion.ol>
            )}

            <p className="mt-5 flex items-start gap-2 px-1 text-[11px] leading-relaxed text-cream/35">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              La cola se ordena por votos. Si hay empate, pasa primero la propuesta más antigua.
            </p>
          </motion.div>
        ) : null}

        {/* Tab 2: Proponer */}
        {tab === "buscar" ? (
          <motion.div
            key="buscar"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <ProposalSearch
              queue={queue}
              proposalsEnabled={state.settings.proposalsEnabled}
              proposalsUsed={state.me?.proposalsUsed ?? 0}
              maxProposals={state.settings.maxProposalsPerParticipant}
              onProposed={async () => {
                await refresh();
                setTab("cola");
              }}
              onNotify={notify}
            />
          </motion.div>
        ) : null}

        {/* Tab 3: Mis votos */}
        {tab === "votos" ? (
          <motion.div
            key="votos"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-cream/40">
                  Tu noche
                </p>
                <h1 className="font-display text-3xl font-extrabold tracking-tight">
                  Mis votos
                </h1>
              </div>
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                className="flex items-center gap-1.5 rounded-full bg-amber px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-ink"
              >
                <Ticket className="size-3.5" aria-hidden="true" />
                Canjear
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-cream/10 bg-white/[0.025] p-4">
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-cream/40">
                  Votos disponibles
                </p>
                <p className="mt-2 font-display text-4xl font-extrabold text-amber">
                  {credits}
                </p>
              </div>
              <div className="rounded-2xl border border-cream/10 bg-white/[0.025] p-4">
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-cream/40">
                  Propuestas usadas
                </p>
                <p className="mt-2 font-display text-4xl font-extrabold">
                  {state.me?.proposalsUsed ?? 0}
                </p>
              </div>
            </div>

            <p className="mt-6 text-center text-xs text-cream/40">
              Cada voto suma 1 crédito para ordenar las canciones de la noche.
            </p>
          </motion.div>
        ) : null}

        {/* Bottom Navigation */}
        <nav className="fixed inset-x-0 bottom-0 z-40">
          <div className="mx-auto w-full max-w-lg border-t border-cream/10 bg-felt-950/90 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl">
            <div className="grid grid-cols-3 gap-1">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  aria-current={tab === id ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl py-2 font-mono text-[9px] uppercase tracking-wider transition-colors",
                    tab === id
                      ? "bg-amber text-ink"
                      : "text-cream/45 hover:text-cream/80",
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </nav>
      </div>

      {/* Redeem Bottom Sheet */}
      <AnimatePresence>
        {sheetOpen ? (
          <RedeemSheet
            venueName={state.venue.name}
            onClose={() => setSheetOpen(false)}
            onSuccess={async () => {
              await refresh();
            }}
          />
        ) : null}
      </AnimatePresence>

      {/* Toast Feedback */}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4">
        <AnimatePresence>
          {toast ? (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              className={cn(
                "flex max-w-sm items-center gap-2 rounded-full border px-4 py-2.5 text-center text-xs shadow-2xl",
                toast.tone === "ok"
                  ? "border-mint/30 bg-felt-800 text-cream"
                  : toast.tone === "error"
                    ? "border-coral/40 bg-felt-800 text-cream"
                    : "border-amber/30 bg-felt-800 text-cream",
              )}
              role="status"
            >
              {toast.tone === "ok" ? (
                <BadgeCheck className="size-4 shrink-0 text-mint" aria-hidden="true" />
              ) : (
                <Info className="size-4 shrink-0 text-coral" aria-hidden="true" />
              )}
              {toast.message}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
