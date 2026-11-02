"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  BadgeCheck,
  Disc3,
  Download,
  Info,
} from "lucide-react";
import { BrandMark, Wordmark } from "@/components/brand";
import { usePwa } from "@/components/pwa-provider";
import { ensureAnonymousParticipant } from "@/lib/api/anon";
import { createNightStateSource } from "@/lib/api/night-state";
import { deriveNightPhase } from "@/lib/api/contracts";
import { castVote, voteErrorMessage } from "@/lib/api/votes";
import { useNightState } from "@/hooks/use-night-state";
import {
  partitionQueueAndProposals,
  MIN_VOTES_FOR_QUEUE,
  PROPOSAL_COOLDOWN_SECONDS,
} from "@/lib/domain/queue";
import { OfflineBanner } from "./parts/offline-banner";
import { ClosedState } from "./parts/closed-state";
import { NowPlayingCard } from "./parts/now-playing-card";
import { QueueRow } from "./parts/queue-row";
import { CandidateRow } from "./parts/candidate-row";
import { ProposalSearch } from "./parts/proposal-search";
import { RedeemTab } from "./parts/redeem-tab";
import { ActivityTab } from "./parts/activity-tab";
import { cn } from "@/lib/cn";

type TabId = "vivo" | "proponer" | "canjear" | "actividad";

const navigationTabs = [
  { id: "vivo" as const, label: "En Vivo", icon: "graphic_eq" },
  { id: "proponer" as const, label: "Proponer", icon: "queue_music" },
  { id: "canjear" as const, label: "Canjear", icon: "confirmation_number" },
  { id: "actividad" as const, label: "Mi Mesa", icon: "person" },
];

const LAST_PROPOSAL_KEY = "poneleplay_last_proposal_timestamp";

export function ClientNight({ slug }: { slug: string }) {
  const { isInstallable, isInstalled, promptInstall } = usePwa();
  const source = useMemo(() => createNightStateSource(slug), [slug]);
  const { state, loading, offline, refresh } = useNightState(source);

  const [tab, setTab] = useState<TabId>("vivo");
  const [pendingVotes, setPendingVotes] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<{
    message: string;
    tone: "ok" | "error" | "info";
  } | null>(null);

  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Load and tick 2-minute cooldown
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAST_PROPOSAL_KEY);
      if (saved) {
        const elapsed = (Date.now() - parseInt(saved, 10)) / 1000;
        const remaining = Math.max(0, Math.ceil(PROPOSAL_COOLDOWN_SECONDS - elapsed));
        if (remaining > 0) {
          setCooldownSeconds(remaining);
        }
      }
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  useEffect(() => {
    void ensureAnonymousParticipant(slug).catch(() => {
      // Handled via offline/night state
    });
  }, [slug]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  function notify(message: string, tone: "ok" | "error" | "info" = "info") {
    setToast({ message, tone });
  }

  const credits = state?.me?.credits ?? 0;
  const stateQueue = state?.queue;
  const stateCandidates = state?.candidates;

  // Partition queue into active playback queue and candidate proposals
  const { activeQueue, candidateProposals } = useMemo(() => {
    return partitionQueueAndProposals(stateQueue ?? [], stateCandidates ?? []);
  }, [stateQueue, stateCandidates]);

  async function handleVote(queueItemId: string) {
    if (credits <= 0) {
      notify("Te quedaste sin créditos. Canjeá un código para sumar votos.", "error");
      setTab("canjear");
      return;
    }

    setPendingVotes((prev) => new Set(prev).add(queueItemId));
    try {
      const res = await castVote(queueItemId);
      if (res.ok) {
        notify("¡Voto computado con éxito! La lista se actualizó.", "ok");
        await refresh();
      } else {
        notify(voteErrorMessage(res.error), "error");
        if (res.error === "no_credits") {
          setTab("canjear");
        }
      }
    } catch {
      notify("Error de conexión al votar. Reintentá en unos segundos.", "error");
    } finally {
      setPendingVotes((prev) => {
        const next = new Set(prev);
        next.delete(queueItemId);
        return next;
      });
    }
  }

  const formatRemainingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
  };

  if (loading && !state) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-[#090D16] px-4 text-[#dfe2ef]">
        <BrandMark className="size-12 animate-pulse" />
        <p className="mt-4 font-mono text-xs uppercase tracking-widest text-slate-400">
          Cargando PonelePlay...
        </p>
      </div>
    );
  }

  const phase = state ? deriveNightPhase(state) : "closed";

  if (!state || phase === "closed") {
    return (
      <div className="relative min-h-dvh bg-[#090D16] px-4 text-[#dfe2ef]">
        {offline ? <OfflineBanner /> : null}
        <ClosedState
          venueName={state?.venue.name ?? slug}
          joinMessage={state?.venue.joinMessage}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090D16] relative flex flex-col shadow-2xl text-[#dfe2ef]">
      {offline ? <OfflineBanner /> : null}

      {/* Container Mobile Shell Frame */}
      <div className="w-full max-w-md mx-auto min-h-screen flex flex-col border-x border-[#1E2538]/50 relative pb-32">
        {/* TOP APP BAR */}
        <header className="bg-[#0D1220]/95 backdrop-blur-md border-b border-[#1E2538] sticky top-0 z-40 pt-[env(safe-area-inset-top,0px)]">
          <div className="flex justify-between items-center w-full px-3.5 py-2.5 max-w-md mx-auto">
            {/* Brand & Venue Identity */}
            <div className="flex items-center gap-2 min-w-0">
              <BrandMark className="size-8 shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <Wordmark className="text-base" />
                  <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/15 text-[#c0c1ff] border border-indigo-500/25 shrink-0">
                    Live
                  </span>
                </div>
                <p className="truncate font-mono text-[10px] text-slate-400">
                  {state.venue.name}
                </p>
              </div>
            </div>

            {/* Live Badges: Install App & Credits Balance */}
            <div className="flex items-center gap-2 shrink-0">
              {isInstallable && !isInstalled && (
                <button
                  type="button"
                  onClick={() => void promptInstall()}
                  aria-label="Instalar app en tu pantalla de inicio"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 font-mono text-[11px] font-bold active:scale-95 transition-all shadow-sm"
                  title="Instalar PonelePlay en tu celular"
                >
                  <Download className="size-3 text-indigo-400" />
                  <span className="hidden xs:inline">Instalar</span>
                </button>
              )}

              {/* Credits Pill */}
              <button
                type="button"
                onClick={() => setTab("canjear")}
                aria-label={`Tenés ${credits} créditos de votación. Tocá para canjear más.`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-500/15 to-violet-500/15 border border-indigo-500/30 hover:border-indigo-400 active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-sm text-indigo-400" style={{ fontVariationSettings: "'FILL' 1" }}>
                  token
                </span>
                <span className="font-mono text-xs font-bold text-white">
                  {credits}
                </span>
                <span className="text-[10px] font-mono uppercase text-slate-400 font-semibold">
                  {credits === 1 ? "voto" : "votos"}
                </span>
              </button>
            </div>
          </div>
        </header>

        {/* NOTIFICATION TOAST */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="fixed top-16 inset-x-4 max-w-md mx-auto z-50 pointer-events-none"
            >
              <div
                className={cn(
                  "rounded-xl px-4 py-3 text-xs font-mono font-medium shadow-2xl flex items-center gap-2.5 border",
                  toast.tone === "ok" &&
                    "bg-emerald-950/90 text-emerald-200 border-emerald-500/40",
                  toast.tone === "error" &&
                    "bg-rose-950/90 text-rose-200 border-rose-500/40",
                  toast.tone === "info" &&
                    "bg-indigo-950/90 text-indigo-200 border-indigo-500/40",
                )}
              >
                {toast.tone === "ok" && (
                  <BadgeCheck className="size-4 shrink-0 text-emerald-400" />
                )}
                {toast.tone === "error" && (
                  <Info className="size-4 shrink-0 text-rose-400" />
                )}
                {toast.tone === "info" && (
                  <Info className="size-4 shrink-0 text-indigo-400" />
                )}
                <span className="flex-1 leading-snug">{toast.message}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* MAIN BODY CONTENT AREA */}
        <main className="flex-1 p-3.5 space-y-4">
          {/* TAB 1: EN VIVO */}
          {tab === "vivo" && (
            <motion.div
              key="vivo"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* NOW PLAYING HERO CARD */}
              <NowPlayingCard item={state.nowPlaying} slug={slug} />

              {/* PROPOSE SONG CTA BANNER */}
              <section className="relative bg-[#131826] rounded-xl p-1.5 border border-[#1E2538] shadow-md hover:border-indigo-500/40 transition-colors">
                <button
                  type="button"
                  onClick={() => setTab("proponer")}
                  className="w-full flex items-center justify-between gap-3 bg-[#181F33] hover:bg-[#1C253D] px-4 py-3 rounded-lg border border-[#232B42] active:scale-[0.98] transition-all text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center font-bold shadow-md shadow-indigo-600/30 shrink-0">
                      <span className="material-symbols-outlined text-[20px]">queue_music</span>
                    </div>
                    <div>
                      <p className="text-sm text-white font-bold leading-tight">
                        ¿Querés proponer una canción?
                      </p>
                      {cooldownSeconds > 0 ? (
                        <p className="text-xs text-amber-300 mt-0.5 font-mono flex items-center gap-1 font-semibold">
                          <span>⏳ Podrás proponer en {formatRemainingTime(cooldownSeconds)}</span>
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400 mt-0.5">
                          Proponé libremente · Con 5 votos pasa a la TV
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-center size-7 rounded-full bg-[#131826] text-indigo-400 border border-[#232B42] shrink-0">
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </div>
                </button>
              </section>

              {/* ================= SECTION 1: COLA DE REPRODUCCIÓN (SALÓN) ================= */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between px-0.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm text-white font-bold tracking-tight">
                        Cola de Reproducción
                      </h3>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono text-[9px] uppercase font-bold tracking-wider">
                        En Salón
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Temas listos para sonar · Votá para que suban de puesto
                    </p>
                  </div>
                  <span className="font-mono text-[11px] bg-[#131826] px-2.5 py-1 rounded-full text-indigo-300 border border-[#1E2538] flex items-center gap-1.5 shrink-0">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {activeQueue.length} {activeQueue.length === 1 ? "en cola" : "en cola"}
                  </span>
                </div>

                {activeQueue.length === 0 ? (
                  <div className="flex flex-col items-center rounded-2xl border border-dashed border-[#232b42] px-6 py-7 text-center bg-[#131826]/40">
                    <Disc3 className="size-8 text-slate-600 animate-spin-vinyl" aria-hidden="true" />
                    <p className="mt-2 text-sm font-bold text-white">
                      No hay canciones en la cola activa
                    </p>
                    <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-400">
                      Las canciones propuestas necesitan <strong>{MIN_VOTES_FOR_QUEUE} votos</strong> para entrar aquí y sonar en la TV.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {activeQueue.map((item, index) => (
                      <QueueRow
                        key={item.id}
                        item={item}
                        rank={index + 1}
                        disabled={pendingVotes.has(item.id)}
                        onVote={() => void handleVote(item.id)}
                      />
                    ))}
                  </div>
                )}
              </section>

              {/* ================= SECTION 2: PROPUESTAS EN VOTACIÓN POPULAR ================= */}
              <section className="space-y-2.5 pt-2">
                <div className="flex items-center justify-between px-0.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm text-white font-bold tracking-tight">
                        Propuestas en Votación
                      </h3>
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono text-[9px] uppercase font-bold tracking-wider">
                        Pre-Cola
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Pedidos del público · Necesitan <strong>{MIN_VOTES_FOR_QUEUE} votos</strong> para pasar a la TV
                    </p>
                  </div>
                  <span className="font-mono text-[11px] bg-[#131826] px-2.5 py-1 rounded-full text-amber-300 border border-[#1E2538] flex items-center gap-1.5 shrink-0">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
                    {candidateProposals.length} {candidateProposals.length === 1 ? "candidata" : "candidatas"}
                  </span>
                </div>

                {candidateProposals.length === 0 ? (
                  <div className="flex flex-col items-center rounded-2xl border border-dashed border-[#232b42] px-6 py-7 text-center bg-[#131826]/40">
                    <span className="material-symbols-outlined text-2xl text-slate-600">how_to_vote</span>
                    <p className="mt-2 text-sm font-bold text-white">
                      No hay propuestas en votación
                    </p>
                    <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-400">
                      ¿Querés escuchar tu música favorita? Proponé una canción para que todos la voten.
                    </p>
                    <button
                      type="button"
                      onClick={() => setTab("proponer")}
                      className="mt-3 rounded-xl bg-gradient-to-r from-amber-600 to-indigo-600 px-4 py-2 font-mono text-xs font-bold text-white shadow-md shadow-amber-600/20"
                    >
                      Proponer canción
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {candidateProposals.map((item, index) => (
                      <CandidateRow
                        key={item.id}
                        item={item}
                        rank={index + 1}
                        disabled={pendingVotes.has(item.id)}
                        onVote={() => void handleVote(item.id)}
                      />
                    ))}
                  </div>
                )}
              </section>
            </motion.div>
          )}

          {/* TAB 2: PROPONER */}
          {tab === "proponer" && (
            <motion.div
              key="proponer"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <ProposalSearch
                queue={activeQueue}
                candidates={candidateProposals}
                proposalsEnabled={state.settings.proposalsEnabled}
                onProposed={async () => {
                  await refresh();
                  setTab("vivo");
                }}
                onNotify={notify}
                onVoteExisting={(queueItemId) => void handleVote(queueItemId)}
              />
            </motion.div>
          )}

          {/* TAB 3: CANJEAR */}
          {tab === "canjear" && (
            <motion.div
              key="canjear"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <RedeemTab
                venueName={state.venue.name}
                credits={credits}
                onSuccess={async () => {
                  await refresh();
                }}
                onNotify={notify}
              />
            </motion.div>
          )}

          {/* TAB 4: MI MESA / ACTIVIDAD */}
          {tab === "actividad" && (
            <motion.div
              key="actividad"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <ActivityTab
                venueName={state.venue.name}
                credits={credits}
                proposalsUsed={state.me?.proposalsUsed ?? 0}
                maxProposals={state.settings.maxProposalsPerParticipant}
                queue={activeQueue}
                nowPlaying={state.nowPlaying}
                onGoToRedeem={() => setTab("canjear")}
                onGoToPropose={() => setTab("proponer")}
              />
            </motion.div>
          )}
        </main>

        {/* BOTTOM NAVIGATION BAR */}
        <nav className="fixed inset-x-0 bottom-0 z-40 bg-[#0D1220]/95 backdrop-blur-md border-t border-[#1E2538] shadow-[0_-4px_20px_rgba(0,0,0,0.5)] pb-[env(safe-area-inset-bottom,0px)]">
          <div className="max-w-md mx-auto grid grid-cols-4 px-2 py-1">
            {navigationTabs.map(({ id, label, icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center justify-center min-h-[52px] py-1 transition-all duration-150 active:scale-95 touch-manipulation",
                    active
                      ? "text-indigo-400 font-bold"
                      : "text-slate-400 hover:text-white",
                  )}
                >
                  <div
                    className={cn(
                      "size-8 rounded-xl flex items-center justify-center transition-all",
                      active && "bg-indigo-600/20 text-indigo-300 shadow-sm",
                    )}
                  >
                    <span
                      className="material-symbols-outlined text-lg"
                      style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
                    >
                      {icon}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono tracking-tight mt-0.5">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
