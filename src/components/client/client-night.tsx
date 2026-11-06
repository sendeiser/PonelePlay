"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  BadgeCheck,
  Disc3,
  Download,
  Flame,
  Info,
  MessageSquareHeart,
  Sparkles,
  Swords,
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
  PROPOSAL_COOLDOWN_SECONDS,
} from "@/lib/domain/queue";
import {
  DEFAULT_BAR_PARTY_CONFIG,
  canGuestCastVote,
  resolveActiveSkipVoteForTrack,
  resolveEffectiveQueueThreshold,
  type PartyConfig,
  type PartySkipVoteState,
} from "@/lib/domain/party";
import {
  castPartyDuelVote,
  castPartyTurboVote,
  castPartyVote,
  castSkipTrackVote,
  fetchServerPartyConfig,
  getStoredPartyConfig,
  type PartyDuelState,
} from "@/lib/api/party-control";
import { OfflineBanner } from "./parts/offline-banner";
import { ClosedState } from "./parts/closed-state";
import { NowPlayingCard } from "./parts/now-playing-card";
import { QueueRow } from "./parts/queue-row";
import { CandidateRow } from "./parts/candidate-row";
import { ProposalSearch } from "./parts/proposal-search";
import { RedeemTab } from "./parts/redeem-tab";
import { ActivityTab } from "./parts/activity-tab";
import { SendDedicationModal } from "./parts/send-dedication-modal";
import { cn } from "@/lib/cn";

type TabId = "vivo" | "proponer" | "canjear" | "actividad";

const barNavigationTabs = [
  { id: "vivo" as const, label: "En Vivo", icon: "graphic_eq" },
  { id: "proponer" as const, label: "Proponer", icon: "queue_music" },
  { id: "canjear" as const, label: "Canjear", icon: "confirmation_number" },
  { id: "actividad" as const, label: "Mi Mesa", icon: "person" },
];

const partyNavigationTabs = [
  { id: "vivo" as const, label: "En Vivo", icon: "graphic_eq" },
  { id: "proponer" as const, label: "Pedir Tema", icon: "queue_music" },
  { id: "actividad" as const, label: "Mi Fiesta", icon: "celebration" },
];

const LAST_PROPOSAL_KEY = "poneleplay_last_proposal_timestamp";const GUEST_NAME_KEY_PREFIX = "poneleplay.guestName.";
const GUEST_VOTES_USED_KEY_PREFIX = "poneleplay.partyVotesUsed.";
const GUEST_LAST_TURBO_KEY_PREFIX = "poneleplay.lastTurboVote.";

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
  const [partyConfig, setPartyConfig] = useState<PartyConfig>(DEFAULT_BAR_PARTY_CONFIG);
  const [guestName, setGuestName] = useState<string>("");
  const [guestVotesUsed, setGuestVotesUsed] = useState<number>(0);
  const [turboCooldownLeft, setTurboCooldownLeft] = useState<number>(0);
  const [activeDuel, setActiveDuel] = useState<PartyDuelState | null>(null);
  const [duelVotedChoice, setDuelVotedChoice] = useState<"A" | "B" | null>(null);
  const [activeSkipVote, setActiveSkipVote] = useState<PartySkipVoteState | null>(null);
  const [votedSkipTrackId, setVotedSkipTrackId] = useState<string | null>(null);
  const [skipPending, setSkipPending] = useState(false);

  const [showDedicationModal, setShowDedicationModal] = useState(false);

  const isParty = partyConfig.venueType === "party";

  // Sync PartyConfig, guestName, and local vote quota
  useEffect(() => {
    setPartyConfig(getStoredPartyConfig(slug, state?.settings?.partyConfig));
    void fetchServerPartyConfig(slug).then(({ partyConfig: serverCfg }) => {
      setPartyConfig(serverCfg);
      setActiveSkipVote(serverCfg.activeSkipVote ?? null);
      if (serverCfg.activeDuel) {
        const duelObj = serverCfg.activeDuel as unknown as PartyDuelState;
        const startedMs = new Date(duelObj.startedAt).getTime();
        if (Date.now() - startedMs < (duelObj.durationSeconds || 30) * 1000) {
          setActiveDuel(duelObj);
        }
      }
    });
    try {
      const savedName = localStorage.getItem(`${GUEST_NAME_KEY_PREFIX}${slug}`);
      if (savedName) setGuestName(savedName);
      const savedUsed = parseInt(localStorage.getItem(`${GUEST_VOTES_USED_KEY_PREFIX}${slug}`) || "0", 10);
      if (!Number.isNaN(savedUsed)) setGuestVotesUsed(savedUsed);
    } catch {
      // Ignore storage errors
    }

    const onPartyChange = (e: Event) => {
      const detail = (e as CustomEvent<{ slug?: string; config?: PartyConfig }>).detail;
      if (!detail?.slug || detail.slug === slug) {
        setPartyConfig(detail?.config ?? getStoredPartyConfig(slug, state?.settings?.partyConfig));
      }
    };

    const onVotesReloaded = (e: Event) => {
      const detail = (e as CustomEvent<{ slug?: string }>).detail;
      if (!detail?.slug || detail.slug === slug) {
        setGuestVotesUsed(0);
        try {
          localStorage.setItem(`${GUEST_VOTES_USED_KEY_PREFIX}${slug}`, "0");
        } catch {
          // Ignore
        }
        setToast({
          message: "🔄 ¡El anfitrión recargó los votos para todos!",
          tone: "ok",
        });
      }
    };

    const onPartyEvent = (e: Event) => {
      const detail = (e as CustomEvent<{ type?: string; duel?: PartyDuelState }>).detail;
      if (detail?.type === "party_duel_start" && detail.duel) {
        setActiveDuel(detail.duel);
        setDuelVotedChoice(null);
      }
    };

    window.addEventListener("poneleplay:party-config-changed", onPartyChange);
    window.addEventListener("poneleplay:party-votes-reloaded", onVotesReloaded);
    window.addEventListener("poneleplay:party-event", onPartyEvent);

    return () => {
      window.removeEventListener("poneleplay:party-config-changed", onPartyChange);
      window.removeEventListener("poneleplay:party-votes-reloaded", onVotesReloaded);
      window.removeEventListener("poneleplay:party-event", onPartyEvent);
    };
  }, [slug, state?.settings?.partyConfig]);

  // Listen to Realtime party_event broadcasts from Cabina
  useEffect(() => {
    let active = true;
    let channel: import("@supabase/supabase-js").RealtimeChannel | null = null;

    void import("@/lib/api/supabase/browser").then(({ createBrowserSupabase }) => {
      if (!active) return;
      try {
        const supabase = createBrowserSupabase();
        channel = supabase
          .channel(`guest-party:${slug}`)
          .on(
            "broadcast",
            { event: "party_event" },
            (msg: { payload?: Record<string, unknown> }) => {
              if (!active || !msg.payload) return;
              const p = msg.payload;
              if (p.type === "party_config_updated" && p.partyConfig) {
                setPartyConfig(p.partyConfig as PartyConfig);
              } else if (p.type === "party_votes_reloaded") {
                setGuestVotesUsed(0);
                try {
                  localStorage.setItem(`${GUEST_VOTES_USED_KEY_PREFIX}${slug}`, "0");
                } catch {
                  // Ignore
                }
                setToast({
                  message: "🔄 ¡El anfitrión recargó tus votos disponibles!",
                  tone: "ok",
                });
              } else if (p.type === "party_duel_start" && p.duel) {
                setActiveDuel(p.duel as PartyDuelState);
                setDuelVotedChoice(null);
              } else if (p.type === "party_skip_vote_updated") {
                if (p.skipped || !p.activeSkipVote) {
                  setActiveSkipVote(null);
                  setVotedSkipTrackId(null);
                } else {
                  setActiveSkipVote(p.activeSkipVote as PartySkipVoteState);
                }
              } else if (p.type === "party_skip_vote_passed") {
                setActiveSkipVote(null);
                setVotedSkipTrackId(null);
                setToast({
                  message: "⏭️ ¡La votación alcanzó los votos! Cambiando a la siguiente canción...",
                  tone: "ok",
                });
                void refresh();
              }
            },
          )
          .subscribe();
      } catch {
        // Non-blocking fallback
      }
    });

    return () => {
      active = false;
      if (channel) {
        void import("@/lib/api/supabase/browser").then(({ createBrowserSupabase }) => {
          try {
            const supabase = createBrowserSupabase();
            void supabase.removeChannel(channel!);
          } catch {
            // Ignore
          }
        });
      }
    };
  }, [slug]);

  // Auto-dismiss duel overlay after durationSeconds
  useEffect(() => {
    if (!activeDuel) return;
    const timer = setTimeout(() => {
      setActiveDuel(null);
      setDuelVotedChoice(null);
    }, (activeDuel.durationSeconds || 30) * 1000);
    return () => clearTimeout(timer);
  }, [activeDuel]);

  // Turbo vote cooldown ticker
  useEffect(() => {
    if (turboCooldownLeft <= 0) return;
    const timer = setInterval(() => {
      setTurboCooldownLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [turboCooldownLeft]);

  // Load and tick 2-minute cooldown
  useEffect(() => {
    if (isParty) {
      setCooldownSeconds(0);
      return;
    }
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
  }, [isParty]);

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

  const rawCredits = state?.me?.credits ?? 0;
  const democraticVotesRemaining = useMemo(() => {
    if (!isParty) return rawCredits;
    if (partyConfig.partyMode === "democratic" && partyConfig.votesPerGuest > 0) {
      return Math.max(0, partyConfig.votesPerGuest - guestVotesUsed);
    }
    return 99999;
  }, [isParty, partyConfig.partyMode, partyConfig.votesPerGuest, guestVotesUsed, rawCredits]);

  const credits = isParty ? democraticVotesRemaining : rawCredits;
  const stateQueue = state?.queue;
  const stateCandidates = state?.candidates;

  const [clientRoundSeconds, setClientRoundSeconds] = useState<number>(180);
  useEffect(() => {
    if (state?.votingRound?.remainingSeconds !== undefined) {
      setClientRoundSeconds(state.votingRound.remainingSeconds);
    }
  }, [state?.votingRound?.remainingSeconds]);

  useEffect(() => {
    if (!state?.votingRound?.enabled) return;
    const interval = setInterval(() => {
      setClientRoundSeconds((prev) => {
        if (prev <= 1) {
          void refresh();
          return state?.votingRound?.durationSeconds ?? 180;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [state?.votingRound?.enabled, state?.votingRound?.durationSeconds, refresh]);

  const effectiveThreshold = useMemo(
    () => resolveEffectiveQueueThreshold(partyConfig),
    [partyConfig],
  );

  // Partition queue into active playback queue and candidate proposals
  const { activeQueue, candidateProposals } = useMemo(() => {
    return partitionQueueAndProposals(stateQueue ?? [], stateCandidates ?? [], effectiveThreshold);
  }, [stateQueue, stateCandidates, effectiveThreshold]);

  async function handleVote(queueItemId: string) {
    if (isParty) {
      const check = canGuestCastVote(partyConfig, democraticVotesRemaining);
      if (!check.allowed) {
        notify(check.reason ?? "Alcanzaste el límite de votos por persona.", "error");
        return;
      }
    } else if (credits <= 0) {
      notify("Te quedaste sin créditos. Canjeá un código para sumar votos.", "error");
      setTab("canjear");
      return;
    }

    setPendingVotes((prev) => new Set(prev).add(queueItemId));
    try {
      const res = isParty
        ? await castPartyVote(slug, queueItemId)
        : await castVote(queueItemId, slug);
      if (res.ok) {
        if (isParty && partyConfig.partyMode === "democratic" && partyConfig.votesPerGuest > 0) {
          const nextUsed = guestVotesUsed + 1;
          setGuestVotesUsed(nextUsed);
          try {
            localStorage.setItem(`${GUEST_VOTES_USED_KEY_PREFIX}${slug}`, String(nextUsed));
          } catch {
            // Ignore
          }
        }
        const wasCandidate = candidateProposals.some((c) => c.id === queueItemId);
        const newVotes = Number(res.voteCount ?? 1);
        if (wasCandidate && effectiveThreshold > 1) {
          if (newVotes >= effectiveThreshold) {
            notify(
              `🎉 ¡Alcanzó ${newVotes}/${effectiveThreshold} votos y entró a la Cola Principal!`,
              "ok",
            );
          } else {
            notify(
              `🗳️ ¡Voto sumado en Pre-Cola! (${newVotes}/${effectiveThreshold} votos para entrar a la cola)`,
              "ok",
            );
          }
        } else {
          notify("¡Voto computado con éxito! La lista se actualizó.", "ok");
        }
        await refresh();
      } else {
        notify(
          voteErrorMessage(
            (res.error as Parameters<typeof voteErrorMessage>[0]) || "unknown",
          ),
          "error",
        );
        if (!isParty && res.error === "no_credits") {
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

  async function handleTurboVote(queueItemId: string) {
    if (turboCooldownLeft > 0) {
      notify(`⏳ Tu Fueguito Turbo se recarga en ${turboCooldownLeft}s.`, "info");
      return;
    }

    setPendingVotes((prev) => new Set(prev).add(queueItemId));
    try {
      await castPartyTurboVote(slug, queueItemId);
      const cooldown = partyConfig.turboCooldownSeconds || 180;
      setTurboCooldownLeft(cooldown);
      try {
        localStorage.setItem(`${GUEST_LAST_TURBO_KEY_PREFIX}${slug}`, String(Date.now()));
      } catch {
        // Ignore
      }
      notify("🔥 ¡Fueguito Turbo activado! Sumaste +3 votos de golpe.", "ok");
      await refresh();
    } catch {
      notify("Error al lanzar Fueguito Turbo.", "error");
    } finally {
      setPendingVotes((prev) => {
        const next = new Set(prev);
        next.delete(queueItemId);
        return next;
      });
    }
  }

  async function handleDuelChoice(choice: "A" | "B") {
    if (!activeDuel || duelVotedChoice) return;
    setDuelVotedChoice(choice);
    const chosenTrack = choice === "A" ? activeDuel.trackA : activeDuel.trackB;
    try {
      await castPartyDuelVote(slug, activeDuel.duelId, choice, chosenTrack.id);
      if (isParty) {
        await castPartyVote(slug, chosenTrack.id);
      } else {
        await castVote(chosenTrack.id, slug);
      }
      notify(`⚡ ¡Votaste por «${chosenTrack.title}» en el Duelo!`, "ok");
      await refresh();
    } catch {
      notify("Voto de duelo enviado.", "info");
    }
  }

  async function handleVoteSkipCurrentTrack() {
    if (!state?.nowPlaying || skipPending) return;
    const currentKey = state.nowPlaying.trackId || state.nowPlaying.id;
    setSkipPending(true);
    try {
      let voterId = guestName.trim();
      if (!voterId) {
        try {
          voterId = localStorage.getItem("poneleplay.voterId") || "";
          if (!voterId) {
            voterId = `guest-${Math.random().toString(36).slice(2, 10)}`;
            localStorage.setItem("poneleplay.voterId", voterId);
          }
        } catch {
          voterId = `guest-${Date.now()}`;
        }
      }

      const res = await castSkipTrackVote(
        slug,
        currentKey,
        state.nowPlaying.title,
        voterId,
      );
      setVotedSkipTrackId(currentKey);
      if (res.skipped) {
        setActiveSkipVote(null);
        notify("⏭️ ¡Votación completada! Cambiando a la siguiente canción...", "ok");
        await refresh();
      } else if (res.activeSkipVote) {
        setActiveSkipVote(res.activeSkipVote);
        notify(
          `🗳️ Voto registrado (${res.activeSkipVote.votes}/${res.activeSkipVote.threshold} para cambiar tema).`,
          "ok",
        );
      }
    } catch {
      notify("No se pudo registrar el voto para cambiar canción.", "error");
    } finally {
      setSkipPending(false);
    }
  }

  const handleSaveGuestName = (val: string) => {
    setGuestName(val);
    try {
      localStorage.setItem(`${GUEST_NAME_KEY_PREFIX}${slug}`, val);
    } catch {
      // Ignore
    }
  };

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

  const navigationTabs = isParty ? partyNavigationTabs : barNavigationTabs;
  const showTurboButtons = isParty && partyConfig.partyMode === "hybrid_turbo";

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
                  <span
                    className={cn(
                      "font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0",
                      isParty
                        ? "bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-400/40"
                        : "bg-indigo-500/15 text-[#c0c1ff] border border-indigo-500/25",
                    )}
                  >
                    {isParty ? "🎉 Fiesta" : "Live"}
                  </span>
                </div>
                <p className="truncate font-mono text-[10px] text-slate-400">
                  {state.venue.name}
                </p>
              </div>
            </div>

            {/* Live Badges: Install App & Credits / Party Status */}
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

              {isParty ? (
                partyConfig.partyMode === "democratic" && partyConfig.votesPerGuest > 0 ? (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/15 border border-cyan-400/40">
                    <span className="text-xs">🗳️</span>
                    <span className="font-mono text-xs font-bold text-white">
                      {democraticVotesRemaining}
                    </span>
                    <span className="text-[10px] font-mono uppercase text-cyan-200 font-semibold">
                      votos disp.
                    </span>
                  </div>
                ) : partyConfig.partyMode === "hybrid_turbo" ? (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-400/40">
                    <Flame className="size-3.5 text-amber-400" />
                    <span className="font-mono text-[11px] font-bold text-amber-200">
                      {turboCooldownLeft > 0 ? `Turbo ${turboCooldownLeft}s` : "🔥 Turbo Listo"}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-fuchsia-500/15 border border-fuchsia-400/40">
                    <span className="font-mono text-[11px] font-bold text-fuchsia-200">
                      ♾️ Votos Libres
                    </span>
                  </div>
                )
              ) : (
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
              )}
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

        {/* LIVE 1v1 DUEL MODAL OVERLAY FOR GUESTS */}
        {activeDuel && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl border-2 border-amber-400/60 bg-gradient-to-b from-[#1a132c] to-[#0e121f] p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 border border-amber-400/40 px-3 py-1 text-xs font-mono font-extrabold text-amber-300">
                  <Swords className="size-3.5" />
                  ⚡ DUELO 1 vs 1 EN VIVO
                </span>
                <button
                  type="button"
                  onClick={() => setActiveDuel(null)}
                  className="text-xs font-mono text-slate-400 hover:text-white"
                >
                  Cerrar ✕
                </button>
              </div>
              <p className="text-xs text-slate-300">
                ¡Elegí cuál de estos dos temas tiene que sonar ahora en la fiesta!
              </p>
              <div className="grid grid-cols-1 gap-3">
                <button
                  type="button"
                  disabled={Boolean(duelVotedChoice)}
                  onClick={() => void handleDuelChoice("A")}
                  className={cn(
                    "p-3.5 rounded-xl border text-left transition-all flex items-center justify-between",
                    duelVotedChoice === "A"
                      ? "border-emerald-400 bg-emerald-500/20 text-white"
                      : "border-cyan-400/40 bg-cyan-500/10 hover:bg-cyan-500/20 text-white",
                  )}
                >
                  <div className="min-w-0 pr-2">
                    <span className="text-[10px] font-mono font-bold text-cyan-300 uppercase">
                      Esquina A
                    </span>
                    <h4 className="text-sm font-extrabold truncate">{activeDuel.trackA.title}</h4>
                    <p className="text-xs text-slate-300 truncate">{activeDuel.trackA.artist}</p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-mono font-extrabold text-slate-950">
                    {duelVotedChoice === "A" ? "✓ Votado" : "Votar A"}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={Boolean(duelVotedChoice)}
                  onClick={() => void handleDuelChoice("B")}
                  className={cn(
                    "p-3.5 rounded-xl border text-left transition-all flex items-center justify-between",
                    duelVotedChoice === "B"
                      ? "border-emerald-400 bg-emerald-500/20 text-white"
                      : "border-fuchsia-400/40 bg-fuchsia-500/10 hover:bg-fuchsia-500/20 text-white",
                  )}
                >
                  <div className="min-w-0 pr-2">
                    <span className="text-[10px] font-mono font-bold text-fuchsia-300 uppercase">
                      Esquina B
                    </span>
                    <h4 className="text-sm font-extrabold truncate">{activeDuel.trackB.title}</h4>
                    <p className="text-xs text-slate-300 truncate">{activeDuel.trackB.artist}</p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-fuchsia-400 px-3 py-1.5 text-xs font-mono font-extrabold text-slate-950">
                    {duelVotedChoice === "B" ? "✓ Votado" : "Votar B"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MAIN BODY CONTENT AREA */}
        <main className="flex-1 p-3.5 space-y-4">
          {/* PARTY WELCOME & NICKNAME BAR */}
          {isParty && tab === "vivo" && (
            <section className="rounded-xl border border-fuchsia-500/35 bg-gradient-to-r from-fuchsia-950/35 via-[#141829] to-amber-950/25 p-3 flex items-center justify-between gap-2.5">
              <div className="min-w-0 flex-1">
                <span className="block text-[10px] font-mono font-bold uppercase tracking-wider text-fuchsia-300">
                  🎉 Modo Fiesta Desbloqueado · Sin Códigos
                </span>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="text"
                    maxLength={28}
                    value={guestName}
                    onChange={(e) => handleSaveGuestName(e.target.value)}
                    placeholder="Tu nombre o apodo para la TV..."
                    className="w-full rounded-lg bg-[#0c101b]/90 border border-white/15 px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-fuchsia-400 focus:outline-none"
                  />
                </div>
              </div>
            </section>
          )}

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
              <NowPlayingCard
                item={state.nowPlaying}
                slug={slug}
                skipVoteEnabled={partyConfig.skipVoteEnabled ?? true}
                skipVotesThreshold={partyConfig.skipVotesThreshold ?? 3}
                activeSkipVote={resolveActiveSkipVoteForTrack(
                  activeSkipVote,
                  state.nowPlaying as unknown as Record<string, unknown> | null,
                )}
                hasVotedSkip={
                  Boolean(
                    state.nowPlaying &&
                      votedSkipTrackId &&
                      (votedSkipTrackId === state.nowPlaying.trackId ||
                        votedSkipTrackId === state.nowPlaying.id),
                  )
                }
                skipPending={skipPending}
                onVoteSkip={() => void handleVoteSkipCurrentTrack()}
              />

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
                        {isParty ? "¿Qué tema querés escuchar o dedicar?" : "¿Querés proponer una canción?"}
                      </p>
                      {!isParty && cooldownSeconds > 0 ? (
                        <p className="text-xs text-amber-300 mt-0.5 font-mono flex items-center gap-1 font-semibold">
                          <span>⏳ Podrás proponer en {formatRemainingTime(cooldownSeconds)}</span>
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400 mt-0.5">
                          {isParty
                            ? effectiveThreshold <= 1
                              ? "Pedí gratis + Dedicatoria en TV y Karaoke 🎤"
                              : `Pedí gratis · Con ${effectiveThreshold} votos sube a la cola`
                            : "Proponé libremente · Con 5 votos pasa a la TV"}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-center size-7 rounded-full bg-[#131826] text-indigo-400 border border-[#232B42] shrink-0">
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </div>
                </button>
              </section>

              {/* DEDICATION CTA BANNER (Visible for all, not just party mode) */}
              {partyConfig.allowDedications && (
                <section className="relative bg-[#131826] rounded-xl p-1.5 border border-[#1E2538] shadow-md hover:border-pink-500/40 transition-colors">
                  <button
                    type="button"
                    onClick={() => setShowDedicationModal(true)}
                    className="w-full flex items-center justify-between gap-3 bg-gradient-to-r from-[#1a1030]/80 via-[#181F33] to-[#1a1030]/80 hover:from-pink-950/40 hover:via-[#1C253D] hover:to-fuchsia-950/40 px-4 py-3 rounded-lg border border-pink-500/20 active:scale-[0.98] transition-all text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-600 to-fuchsia-700 text-white flex items-center justify-center font-bold shadow-md shadow-pink-600/30 shrink-0">
                        <MessageSquareHeart className="size-5" />
                      </div>
                      <div>
                        <p className="text-sm text-white font-bold leading-tight flex items-center gap-1.5">
                          Enviar Dedicatoria a la Pantalla
                          <Sparkles className="size-3.5 text-pink-400" />
                        </p>
                        <p className="text-xs text-pink-200/70 mt-0.5">
                          Tu mensaje aparecerá cruzando la TV del salón en vivo
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-center size-7 rounded-full bg-[#131826] text-pink-400 border border-pink-500/30 shrink-0">
                      <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                    </div>
                  </button>
                </section>
              )}

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
                    {activeQueue.length} en cola
                  </span>
                </div>

                {activeQueue.length === 0 ? (
                  <div className="flex flex-col items-center rounded-2xl border border-dashed border-[#232b42] px-6 py-7 text-center bg-[#131826]/40">
                    <Disc3 className="size-8 text-slate-600 animate-spin-vinyl" aria-hidden="true" />
                    <p className="mt-2 text-sm font-bold text-white">
                      No hay canciones en la cola activa
                    </p>
                    <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-400">
                      {effectiveThreshold <= 1 ? (
                        "Pedí el primer tema de la noche para que empiece la fiesta."
                      ) : (
                        <>
                          Las canciones propuestas necesitan <strong>{effectiveThreshold} votos</strong> para entrar aquí y sonar en la TV.
                        </>
                      )}
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
                        onTurboVote={showTurboButtons ? () => void handleTurboVote(item.id) : undefined}
                        turboAvailable={turboCooldownLeft <= 0}
                      />
                    ))}
                  </div>
                )}
              </section>

              {/* ================= SECTION 2: PROPUESTAS EN VOTACIÓN POPULAR ================= */}
              {(effectiveThreshold > 1 || candidateProposals.length > 0) && (
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
                        Pedidos del público · Con {effectiveThreshold} votos pasan a la cola activa
                      </p>
                    </div>
                    <span className="font-mono text-[11px] bg-[#131826] px-2.5 py-1 rounded-full text-amber-300 border border-[#1E2538] flex items-center gap-1.5 shrink-0">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
                      {candidateProposals.length} {candidateProposals.length === 1 ? "candidata" : "candidatas"}
                    </span>
                  </div>

                  {/* Voting Round Live Banner for Customers */}
                  {state?.votingRound?.enabled && (
                    <div className="p-3 rounded-xl bg-gradient-to-r from-amber-500/15 via-rose-500/10 to-indigo-500/15 border border-amber-500/30 flex items-center justify-between gap-3 text-xs font-mono">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="material-symbols-outlined text-amber-400 text-lg animate-pulse shrink-0">timer</span>
                        <div className="min-w-0">
                          <span className="font-bold text-white block truncate">
                            Ronda #{state.votingRound?.roundNumber ?? 1} en Vivo
                          </span>
                          <span className="text-[10px] text-slate-300 block truncate">
                            ¡Votá tu favorita! Al terminar, la más votada entra a sonar en la TV.
                          </span>
                        </div>
                      </div>
                      <span className="shrink-0 font-bold px-2.5 py-1 rounded-lg bg-amber-500/25 text-amber-300 border border-amber-500/40 text-xs">
                        {Math.floor(clientRoundSeconds / 60)}:{(clientRoundSeconds % 60).toString().padStart(2, "0")}
                      </span>
                    </div>
                  )}

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
                          targetVotes={effectiveThreshold}
                          disabled={pendingVotes.has(item.id)}
                          allowRepeatVotes={isParty}
                          onVote={() => void handleVote(item.id)}
                          onTurboVote={showTurboButtons ? () => void handleTurboVote(item.id) : undefined}
                          turboAvailable={turboCooldownLeft <= 0}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}
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
                slug={slug}
                queue={activeQueue}
                candidates={candidateProposals}
                proposalsEnabled={state.settings.proposalsEnabled}
                isPartyMode={isParty}
                defaultGuestName={guestName}
                allowDedications={partyConfig.allowDedications}
                allowGuestKaraoke={partyConfig.allowGuestKaraoke}
                minVotesToQueue={effectiveThreshold}
                onProposed={async () => {
                  await refresh();
                  setTab("vivo");
                }}
                onNotify={notify}
                onVoteExisting={(queueItemId) => void handleVote(queueItemId)}
              />
            </motion.div>
          )}

          {/* TAB 3: CANJEAR (SOLO BAR) */}
          {tab === "canjear" && !isParty && (
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
                onGoToRedeem={() => setTab(isParty ? "proponer" : "canjear")}
                onGoToPropose={() => setTab("proponer")}
              />
            </motion.div>
          )}
        </main>

        {/* BOTTOM NAVIGATION BAR */}
        <nav className="fixed inset-x-0 bottom-0 z-40 bg-[#0D1220]/95 backdrop-blur-md border-t border-[#1E2538] shadow-[0_-4px_20px_rgba(0,0,0,0.5)] pb-[env(safe-area-inset-bottom,0px)]">
          <div
            className={cn(
              "max-w-md mx-auto grid px-2 py-1",
              isParty ? "grid-cols-3" : "grid-cols-4",
            )}
          >
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

      {/* Dedication Modal — available as standalone feature */}
      <SendDedicationModal
        isOpen={showDedicationModal}
        slug={slug}
        defaultGuestName={guestName}
        nowPlayingTitle={state?.nowPlaying?.title ?? null}
        onClose={() => setShowDedicationModal(false)}
        onSuccess={(ded) => {
          notify(`💬 Dedicatoria enviada: "${ded.slice(0, 40)}${ded.length > 40 ? "…" : ""}"`, "ok");
        }}
        onNotify={(msg, type) => {
          notify(msg, type === "success" ? "ok" : type === "error" ? "error" : "info");
        }}      />
    </div>
  );
}
