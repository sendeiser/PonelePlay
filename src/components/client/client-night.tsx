"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  BadgeCheck,
  Disc3,
  Info,
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
import { QueueRow } from "./parts/queue-row";
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

export function ClientNight({ slug }: { slug: string }) {
  const source = useMemo(() => createNightStateSource(slug), [slug]);
  const { state, loading, offline, refresh } = useNightState(source);

  const [tab, setTab] = useState<TabId>("vivo");
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
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  function notify(message: string, tone: "ok" | "error" | "info" = "info") {
    setToast({ message, tone });
  }

  const credits = state?.me?.credits ?? 0;
  const queue = state?.queue ?? [];

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
        notify("¡Voto computado con éxito! La cola se actualizó.", "ok");
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
      <div className="w-full max-w-md mx-auto min-h-screen flex flex-col border-x border-[#1E2538]/50 relative pb-28">
        {/* TOP APP BAR (Stitch Shared Component) */}
        <header className="bg-[#0D1220] border-b border-[#1E2538] sticky top-0 z-40">
          <div className="flex justify-between items-center w-full px-4 py-2.5 max-w-md mx-auto">
            {/* Brand & Venue Identity */}
            <div className="flex items-center gap-2">
              <BrandMark className="size-8" />
              <div>
                <div className="flex items-center gap-1.5">
                  <Wordmark className="text-base" />
                  <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/15 text-[#c0c1ff] border border-indigo-500/25">
                    Live
                  </span>
                </div>
                <p className="truncate font-mono text-[10px] text-slate-400">
                  {state.venue.name}
                </p>
              </div>
            </div>

            {/* Live Badges: Sala Activa & Credits Balance */}
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-1 bg-[#181b25] px-2 py-0.5 rounded-full border border-[#232b42]">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                <span className="font-mono text-[10px] text-cyan-300">Sala Activa</span>
              </div>

              {/* Credits counter pill (navigates to Canjear) */}
              <button
                type="button"
                onClick={() => setTab("canjear")}
                className="flex items-center gap-1.5 bg-[#181F33] hover:bg-[#202944] text-[#c0c1ff] px-3 py-1.5 rounded-full border border-indigo-500/30 shadow-sm active:scale-95 transition-all"
                title="Canjear o cargar créditos"
              >
                <span className="material-symbols-outlined text-[16px] text-amber-400" style={{ fontVariationSettings: "'FILL' 1" }}>
                  confirmation_number
                </span>
                <span className="font-mono text-xs font-bold text-white">
                  {credits}
                </span>
                <span className="font-mono text-[10px] text-slate-400 uppercase hidden xs:inline">
                  {credits === 1 ? "voto" : "votos"}
                </span>
              </button>
            </div>
          </div>
        </header>

        {/* MAIN SCROLLABLE CONTENT CANVAS */}
        <main className="flex-1 px-4 pt-3 space-y-4">
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
                        ¿Querés poner tu tema?
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Buscá en YouTube y sumalo con 1 crédito
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-center size-7 rounded-full bg-[#131826] text-indigo-400 border border-[#232B42] shrink-0">
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </div>
                </button>
              </section>

              {/* UPCOMING QUEUE SECTION */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between px-0.5">
                  <div>
                    <h3 className="text-sm text-white font-bold tracking-tight">
                      A continuación en la cola
                    </h3>
                    <p className="text-xs text-slate-400">
                      Ordenado por votos y antigüedad
                    </p>
                  </div>
                  <span className="font-mono text-[11px] bg-[#131826] px-2.5 py-1 rounded-full text-indigo-300 border border-[#1E2538] flex items-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping" />
                    {queue.length} {queue.length === 1 ? "en espera" : "en espera"}
                  </span>
                </div>

                {queue.length === 0 ? (
                  <div className="flex flex-col items-center rounded-2xl border border-dashed border-[#232b42] px-6 py-10 text-center bg-[#131826]/40">
                    <Disc3 className="size-10 text-slate-600 animate-spin-vinyl" aria-hidden="true" />
                    <p className="mt-3 text-base font-bold text-white">
                      La cola está vacía
                    </p>
                    <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-400">
                      Sé el primero en proponer una canción desde la mesa.
                    </p>
                    <button
                      type="button"
                      onClick={() => setTab("proponer")}
                      className="mt-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 font-mono text-xs font-bold text-white shadow-md shadow-indigo-600/30"
                    >
                      Proponer canción
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {queue.map((item, index) => (
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
                queue={queue}
                proposalsEnabled={state.settings.proposalsEnabled}
                proposalsUsed={state.me?.proposalsUsed ?? 0}
                maxProposals={state.settings.maxProposalsPerParticipant}
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
                queue={queue}
                nowPlaying={state.nowPlaying}
                onGoToRedeem={() => setTab("canjear")}
                onGoToPropose={() => setTab("proponer")}
              />
            </motion.div>
          )}
        </main>

        {/* BOTTOM NAVIGATION BAR (Glassmorphism Dock) */}
        <nav className="fixed inset-x-0 bottom-0 z-40 bg-[#0D1220] border-t border-[#1E2538] shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
          <div className="max-w-md mx-auto grid grid-cols-4 px-2 py-1.5">
            {navigationTabs.map(({ id, label, icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center justify-center py-1.5 transition-all duration-150 active:scale-95",
                    active
                      ? "text-[#c0c1ff] font-semibold"
                      : "text-slate-400 hover:text-white",
                  )}
                >
                  <span
                    className="material-symbols-outlined text-[22px]"
                    style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
                  >
                    {icon}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-tight mt-0.5">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      {/* Toast Notification */}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4">
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              className={cn(
                "flex max-w-sm items-center gap-2 rounded-xl border px-4 py-2.5 text-center text-xs shadow-2xl font-mono",
                toast.tone === "ok"
                  ? "border-emerald-500/40 bg-[#131b26] text-emerald-200"
                  : toast.tone === "error"
                    ? "border-rose-500/40 bg-[#1f131a] text-rose-200"
                    : "border-indigo-500/40 bg-[#181b29] text-[#c0c1ff]",
              )}
              role="status"
            >
              {toast.tone === "ok" ? (
                <BadgeCheck className="size-4 shrink-0 text-emerald-400" aria-hidden="true" />
              ) : (
                <Info className="size-4 shrink-0 text-rose-400" aria-hidden="true" />
              )}
              <span>{toast.message}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
