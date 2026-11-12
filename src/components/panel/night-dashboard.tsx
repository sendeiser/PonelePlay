"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BallChip } from "@/components/ball-chip";
import { partitionQueueAndProposals } from "@/lib/domain/queue";
import {
  DEFAULT_BAR_PARTY_CONFIG,
  resolveEffectiveQueueThreshold,
  type PartyConfig,
} from "@/lib/domain/party";
import {
  fetchServerPartyConfig,
  getStoredPartyConfig,
  resetPartyGuestVotes,
  updatePartyConfig,
} from "@/lib/api/party-control";
import { PartyModeControlBar } from "./party-mode-control-bar";
import { createNightStateSource } from "@/lib/api/night-state";
import { useNightState } from "@/hooks/use-night-state";
import {
  closeNight,
  openNight,
  resolveVotingRound,
  setProposalsEnabled,
  vetoItem,
} from "@/lib/api/panel-actions";
import { nightPhase } from "@/lib/domain/night";
import { type PanelRole } from "@/lib/domain/permissions";
import { PairPlayerDialog } from "./pair-player";
import { ManualPlaybackModal } from "./manual-playback-modal";
import { TvDevicesManagerModal } from "./tv-devices-manager-modal";
import { PrintQrModal } from "./print-qr-modal";

interface NightDashboardProps {
  slug: string;
  role: PanelRole;
  staffToken?: string;
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function NightDashboard({ slug, role, staffToken }: NightDashboardProps) {
  const searchParams = useSearchParams();
  const source = useMemo(() => createNightStateSource(slug), [slug]);
  const { state, loading, refresh } = useNightState(source);

  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmVetoId, setConfirmVetoId] = useState<string | null>(null);
  const [pairDialogOpen, setPairDialogOpen] = useState(false);
  const [tvManagerOpen, setTvManagerOpen] = useState(() => {
    return Boolean(searchParams?.get("pair_code"));
  });
  const [initialPairCode, setInitialPairCode] = useState<string | null>(() => {
    return searchParams?.get("pair_code") || null;
  });
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Booth Audio & Playback Controls
  const [isPaused, setIsPaused] = useState(false);
  const [volume, setVolume] = useState(85);
  const [isMuted, setIsMuted] = useState(false);
  const [karaokeMode, setKaraokeMode] = useState(false);
  const [isTvFullscreen, setIsTvFullscreen] = useState(false);
  const [playerResetMsg, setPlayerResetMsg] = useState<string | null>(null);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [printQrModalOpen, setPrintQrModalOpen] = useState(false);
  const [lastTvProgressAt, setLastTvProgressAt] = useState<number>(0);
  const [roundSecondsLeft, setRoundSecondsLeft] = useState<number>(180);
  const [partyConfig, setPartyConfig] = useState<PartyConfig>(DEFAULT_BAR_PARTY_CONFIG);
  const [cabinaQueueTab, setCabinaQueueTab] = useState<"queue" | "candidates">("queue");
  const [queueFilter, setQueueFilter] = useState("");

  // Sync party config from localStorage and server state
  useEffect(() => {
    setPartyConfig(getStoredPartyConfig(slug, state?.settings?.partyConfig));
    void fetchServerPartyConfig(slug).then(({ partyConfig: serverCfg }) => {
      setPartyConfig(serverCfg);
    });
    const onPartyChange = (e: Event) => {
      const detail = (e as CustomEvent<{ slug?: string; config?: PartyConfig }>).detail;
      if (!detail?.slug || detail.slug === slug) {
        setPartyConfig(detail?.config ?? getStoredPartyConfig(slug, state?.settings?.partyConfig));
      }
    };
    window.addEventListener("poneleplay:party-config-changed", onPartyChange);
    return () => window.removeEventListener("poneleplay:party-config-changed", onPartyChange);
  }, [slug, state?.settings?.partyConfig]);

  const handlePartyConfigChange = useCallback(
    async (patch: Partial<PartyConfig>) => {
      const next = await updatePartyConfig(slug, patch);
      setPartyConfig(next);
    },
    [slug],
  );

  const handleReloadPartyVotes = useCallback(async () => {
    await resetPartyGuestVotes(slug, partyConfig.votesPerGuest);
  }, [slug, partyConfig.votesPerGuest]);

  // Sync remaining seconds from voting round
  useEffect(() => {
    if (state?.votingRound?.remainingSeconds !== undefined) {
      setRoundSecondsLeft(state.votingRound.remainingSeconds);
    }
  }, [state?.votingRound?.remainingSeconds]);

  // Auto-dismiss operational error messages after 6 seconds
  useEffect(() => {
    if (!errorMsg) return;
    const timer = setTimeout(() => setErrorMsg(null), 6000);
    return () => clearTimeout(timer);
  }, [errorMsg]);

  // Local ticker for round seconds
  useEffect(() => {
    if (!state?.votingRound?.enabled) return;
    const interval = setInterval(() => {
      setRoundSecondsLeft((prev) => {
        if (prev <= 1) {
          void refresh();
          return state?.votingRound?.durationSeconds ?? 180;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [state?.votingRound?.enabled, state?.votingRound?.durationSeconds, refresh]);

  const handleResolveRound = async () => {
    setActionLoading(true);
    try {
      const res = await resolveVotingRound(slug, true);
      if (res.promoted && res.promotedItem) {
        setPlayerResetMsg(`🎉 ¡Ronda resuelta! "${res.promotedItem.title}" ingresó a la cola de la TV.`);
      } else {
        setPlayerResetMsg("⏱️ Ronda reiniciada para el próximo ciclo.");
      }
      setTimeout(() => setPlayerResetMsg(null), 3500);
      await refresh();
    } catch {
      setErrorMsg("Error al resolver ronda");
      setTimeout(() => setErrorMsg(null), 3000);
    } finally {
      setActionLoading(false);
    }
  };

  // Sync initial playback state from backend and listen to Realtime
  useEffect(() => {
    let active = true;
    let channel: import("@supabase/supabase-js").RealtimeChannel | null = null;

    void import("@/lib/api/master-control").then(({ fetchPlaybackState }) => {
      fetchPlaybackState(slug)
        .then((st) => {
          if (!active) return;
          setIsPaused(st.isPaused);
          setVolume(st.volume);
          setIsMuted(st.isMuted);
          setKaraokeMode(st.karaokeMode);
        })
        .catch(() => {});
    });

    void import("@/lib/api/supabase/browser").then(({ createBrowserSupabase }) => {
      if (!active) return;
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
      try {
        const supabase = createBrowserSupabase();
        const existing = supabase.getChannels().find(
          (c) =>
            c.topic === `realtime:dashboard-playback:${slug}` ||
            c.topic === `dashboard-playback:${slug}`,
        );
        if (existing) {
          void supabase.removeChannel(existing);
        }

        channel = supabase
          .channel(`dashboard-playback:${slug}`)
          .on(
            "broadcast",
            { event: "playback_command" },
            (msg: { payload?: { command?: string; payload?: Record<string, unknown> } }) => {
              if (!active) return;
              const cmd = msg.payload?.command;
              const p = msg.payload?.payload || {};
              if (cmd === "pause") setIsPaused(true);
              else if (cmd === "resume") setIsPaused(false);
              else if (cmd === "toggle_pause") setIsPaused((prev) => !prev);
              else if (cmd === "set_volume") {
                setVolume(Number(p.volume ?? 85));
                setIsMuted(false);
              } else if (cmd === "mute") setIsMuted(true);
              else if (cmd === "unmute") setIsMuted(false);
              else if (cmd === "toggle_mute") setIsMuted((prev) => !prev);
              else if (cmd === "set_karaoke_mode") setKaraokeMode(Boolean(p.enabled));
              else if (cmd === "toggle_fullscreen") setIsTvFullscreen((prev) => !prev);
              else if (cmd === "set_fullscreen") setIsTvFullscreen(Boolean(p.isFullscreen));
            },
          )
          .on(
            "broadcast",
            { event: "tv_playback_progress" },
            (msg: { payload?: { isVideoFullscreen?: boolean; isPaused?: boolean } }) => {
              if (!active || !msg.payload) return;
              setLastTvProgressAt(Date.now());
              if (typeof msg.payload.isVideoFullscreen === "boolean") {
                setIsTvFullscreen(msg.payload.isVideoFullscreen);
              }
              if (typeof msg.payload.isPaused === "boolean") {
                setIsPaused(msg.payload.isPaused);
              }
            },
          )
          .subscribe();
      } catch {
        // Non-blocking fallback in test or offline environments
      }
    });

    return () => {
      active = false;
      if (channel) {
        void import("@/lib/api/supabase/browser").then(({ createBrowserSupabase }) => {
          const supabase = createBrowserSupabase();
          void supabase.removeChannel(channel!);
        });
      }
    };
  }, [slug]);

  const handleTogglePause = useCallback(async () => {
    const next = !isPaused;
    setIsPaused(next);
    try {
      const { togglePausePlayback } = await import("@/lib/api/master-control");
      await togglePausePlayback(slug);
    } catch {
      // Non-blocking fallback
    }
  }, [isPaused, slug]);

  const handleVolumeChange = useCallback(async (newVol: number) => {
    setVolume(newVol);
    if (isMuted) setIsMuted(false);
    try {
      const { setPlaybackVolume } = await import("@/lib/api/master-control");
      await setPlaybackVolume(slug, newVol);
    } catch {
      // Non-blocking fallback
    }
  }, [isMuted, slug]);

  const handleToggleMute = useCallback(async () => {
    const next = !isMuted;
    setIsMuted(next);
    try {
      const { toggleMutePlayback } = await import("@/lib/api/master-control");
      await toggleMutePlayback(slug);
    } catch {
      // Non-blocking fallback
    }
  }, [isMuted, slug]);

  const handleKaraokeToggle = useCallback(async () => {
    const next = !karaokeMode;
    setKaraokeMode(next);
    try {
      const { setKaraokeMode: setKm } = await import("@/lib/api/master-control");
      await setKm(slug, next);
    } catch {
      // Non-blocking fallback
    }
  }, [karaokeMode, slug]);

  const handleToggleTvFullscreen = useCallback(async () => {
    const next = !isTvFullscreen;
    setIsTvFullscreen(next);
    try {
      const { setFullscreenPlayback } = await import("@/lib/api/master-control");
      await setFullscreenPlayback(slug, next);
    } catch {
      setIsTvFullscreen(!next);
    }
  }, [isTvFullscreen, slug]);

  const handleSkip = useCallback(async () => {
    setActionLoading(true);
    setErrorMsg(null);
    try {
      const { skipPlayback } = await import("@/lib/api/master-control");
      await skipPlayback(slug);
      await refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Error al saltear canción");
    } finally {
      setActionLoading(false);
    }
  }, [slug, refresh]);

  // Keyboard shortcuts for staff (F4: Tickets, Space: Play/Pause, S: Skip, M: Mute)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.key === "F4") {
        e.preventDefault();
        window.location.href = `/panel/${slug}/tickets`;
      } else if (e.key.toLowerCase() === "m") {
        void handleToggleMute();
      } else if (e.key === " ") {
        e.preventDefault();
        void handleTogglePause();
      } else if (e.key.toLowerCase() === "s" && state?.nowPlaying) {
        e.preventDefault();
        void handleSkip();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [slug, state?.nowPlaying, handleSkip, handleToggleMute, handleTogglePause]);

  async function handleRestartPlayer() {
    setPlayerResetMsg("Enviando orden de reinicio a pantallas TV...");
    try {
      const { reloadPlayback } = await import("@/lib/api/master-control");
      await reloadPlayback(slug);
      setPlayerResetMsg("¡Comando de reinicio ejecutado!");
    } catch {
      setPlayerResetMsg("Comando de reinicio enviado.");
    }
    void refresh();
    setTimeout(() => setPlayerResetMsg(null), 3500);
  }

  const phase = nightPhase(state);
  const isOpen = phase === "open";

  async function handleOpenNight() {
    setActionLoading(true);
    setErrorMsg(null);
    try {
      await openNight(staffToken);
      setConfirmOpen(false);
      await refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Error al abrir la noche");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCloseNight() {
    setActionLoading(true);
    setErrorMsg(null);
    try {
      await closeNight(staffToken);
      setConfirmClose(false);
      await refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Error al cerrar la noche");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleToggleProposals() {
    if (!state) return;
    setActionLoading(true);
    setErrorMsg(null);
    try {
      await setProposalsEnabled(
        !state.settings.proposalsEnabled,
        state.venue.id,
        staffToken,
      );
      await refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Error al cambiar propuestas");
    } finally {
      setActionLoading(false);
    }
  }


  async function handleVeto(itemId: string) {
    setActionLoading(true);
    setErrorMsg(null);
    try {
      if (nowPlaying && itemId === nowPlaying.id) {
        const { skipPlayback } = await import("@/lib/api/master-control");
        await skipPlayback(slug);
      } else {
        await vetoItem(itemId, staffToken);
      }
      setConfirmVetoId(null);
      await refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Error al vetar canción");
    } finally {
      setActionLoading(false);
    }
  }

  const stateQueue = state?.queue;
  const stateCandidates = state?.candidates;
  const effectiveThreshold = useMemo(
    () => resolveEffectiveQueueThreshold(partyConfig),
    [partyConfig],
  );
  const { activeQueue, candidateProposals } = useMemo(
    () => partitionQueueAndProposals(stateQueue ?? [], stateCandidates ?? [], effectiveThreshold),
    [stateQueue, stateCandidates, effectiveThreshold],
  );
  const allPoolItems = useMemo(
    () => [...activeQueue, ...candidateProposals],
    [activeQueue, candidateProposals],
  );
  const queue = activeQueue;
  const normalizedFilter = queueFilter.trim().toLowerCase();
  const filteredActiveQueue = useMemo(() => {
    if (!normalizedFilter) return activeQueue;
    return activeQueue.filter(
      (item) =>
        item.title.toLowerCase().includes(normalizedFilter) ||
        item.artist.toLowerCase().includes(normalizedFilter) ||
        (item.guestName && item.guestName.toLowerCase().includes(normalizedFilter)),
    );
  }, [activeQueue, normalizedFilter]);
  const filteredCandidates = useMemo(() => {
    if (!normalizedFilter) return candidateProposals;
    return candidateProposals.filter(
      (item) =>
        item.title.toLowerCase().includes(normalizedFilter) ||
        item.artist.toLowerCase().includes(normalizedFilter) ||
        (item.guestName && item.guestName.toLowerCase().includes(normalizedFilter)),
    );
  }, [candidateProposals, normalizedFilter]);
  const nowPlaying = state?.nowPlaying ?? null;
  const isPlayerConnected =
    Boolean(state?.player?.lastSeenAt) || (lastTvProgressAt > 0 && Date.now() - lastTvProgressAt < 6000);

  if (loading && !state) {
    return (
      <div className="flex h-64 items-center justify-center text-th-text-2 font-mono text-xs">
        <span className="inline-block size-4 border-2 border-th-accent border-t-transparent rounded-full animate-spin mr-2" />
        Cargando panel de control y telemetría nocturna...
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24 md:pb-32">
      {/* ==================== TOP OPERATIONAL STATUS BAR ==================== */}
      <section className="card-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 min-w-0">
          <div className="flex flex-col">
            <h1 className="text-lg font-display font-bold text-th-text tracking-tight">
              Cabina en Vivo
            </h1>
            <p className="font-mono text-[11px] text-th-muted">
              {state?.venue.name} · Perfil {role}
            </p>
          </div>

          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-mono text-[11px] font-bold uppercase tracking-wider border ${
              isOpen
                ? "bg-th-emerald-soft border-th-emerald/30 text-th-emerald"
                : "bg-th-recessed text-th-muted border-th-border"
            }`}
          >
            <span
              className={`size-2 rounded-full ${
                isOpen ? "bg-th-emerald pulse-dot" : "bg-th-muted"
              }`}
            />
            <span>{isOpen ? "Noche Abierta" : "Noche Cerrada"}</span>
          </div>

          <div className="h-5 w-px bg-th-border hidden sm:block" />

          <div className="flex flex-wrap items-center gap-3 text-xs text-th-text-2">
            <div className="flex items-center gap-1.5">
              <span className="text-th-muted">Cola:</span>
              <span className="font-mono font-bold text-th-text tabular-nums">{queue.length}</span>
            </div>
            <span className="text-th-border-strong hidden sm:inline">·</span>
            <div className="flex items-center gap-1.5">
              <span className="text-th-muted">Votando:</span>
              <span className="font-mono font-bold text-th-amber tabular-nums">{candidateProposals.length}</span>
            </div>
            <span className="text-th-border-strong hidden sm:inline">·</span>
            <div className="flex items-center gap-1.5">
              <span className="text-th-muted">Ingreso:</span>
              <span className="font-mono font-bold text-th-accent tabular-nums">
                {effectiveThreshold} {effectiveThreshold === 1 ? "voto" : "votos"}
              </span>
            </div>
          </div>
        </div>

        {/* Operational Control Toggles & Close Shift Button */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <div className="relative">
              <input
                type="checkbox"
                id="toggle-proposals"
                checked={state?.settings.proposalsEnabled ?? false}
                onChange={() => void handleToggleProposals()}
                disabled={actionLoading || !isOpen}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-th-recessed border border-th-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-th-accent after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:shadow-xs after:rounded-full after:size-[18px] after:transition-all" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-th-text">
                Propuestas de Clientes
              </span>
              <span
                className={`text-[10px] font-mono ${
                  state?.settings.proposalsEnabled ? "text-th-emerald font-bold" : "text-th-muted"
                }`}
              >
                {state?.settings.proposalsEnabled ? "Habilitadas" : "Pausadas"}
              </span>
            </div>
          </label>

          <div className="h-6 w-px bg-th-border hidden sm:block" />

          {isOpen ? (
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => setConfirmClose(true)}
              className="inline-flex items-center gap-1.5 h-9 bg-th-danger-soft hover:bg-th-danger text-th-danger hover:text-white px-3.5 rounded-xl text-xs font-semibold border border-th-danger/30 active:scale-95 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">power_settings_new</span>
              <span>Cerrar Noche</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => setConfirmOpen(true)}
              className="inline-flex items-center gap-1.5 h-9 bg-th-emerald hover:opacity-90 text-white px-4 rounded-xl text-xs font-semibold active:scale-95 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">play_arrow</span>
              <span>Abrir Noche</span>
            </button>
          )}
        </div>
      </section>

      {/* ==================== HARDWARE & QUICK UTILITIES BAR ==================== */}
      <section className="recessed-panel rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-th-teal">desktop_windows</span>
            <span className="text-th-text-2">TV Salón:</span>
            {isPlayerConnected ? (
              <span className="text-th-emerald font-semibold flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-th-emerald animate-pulse" />
                <span>Conectado (Sync 100%)</span>
              </span>
            ) : (
              <span className="text-th-amber font-semibold flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-th-amber" />
                <span>Esperando TV</span>
              </span>
            )}
          </div>
          <span className="text-th-border-strong hidden sm:inline">·</span>
          <div className="flex items-center gap-1.5 text-th-muted">
            <span className="material-symbols-outlined text-base text-th-accent">volume_up</span>
            <span>Audio Cabina + TV</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPrintQrModalOpen(true)}
            className="inline-flex items-center gap-1.5 h-8 bg-th-card hover:bg-th-hover text-th-text-2 hover:text-th-text px-3 rounded-xl border border-th-border text-xs font-medium transition-colors cursor-pointer"
            title="Imprimir cartel con código QR para las mesas o barra"
          >
            <span className="material-symbols-outlined text-sm text-th-accent">qr_code_scanner</span>
            <span>QR Mesas (PDF)</span>
          </button>

          <button
            type="button"
            onClick={() => setTvManagerOpen(true)}
            className="inline-flex items-center gap-1.5 h-8 bg-th-card hover:bg-th-hover text-th-text-2 hover:text-th-text px-3 rounded-xl border border-th-border text-xs font-medium transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm text-th-teal">tv</span>
            <span>Pantallas TV</span>
          </button>

          <button
            type="button"
            onClick={() => setPairDialogOpen(true)}
            className="hidden sm:inline-flex items-center gap-1 h-8 px-2.5 rounded-xl text-th-muted hover:text-th-text hover:bg-th-card text-xs transition-colors cursor-pointer"
            title="Vincular mediante token manual"
          >
            <span className="material-symbols-outlined text-sm">key</span>
            <span>Token</span>
          </button>

          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-xl text-th-muted hover:text-th-text hover:bg-th-card text-xs transition-colors cursor-pointer"
            title="Actualizar datos"
          >
            <span className="material-symbols-outlined text-sm">refresh</span>
            <span>Actualizar</span>
          </button>
        </div>
      </section>

      {/* ==================== PARTY MODE CONTROL BAR ==================== */}
      {partyConfig.venueType === "party" && (
        <PartyModeControlBar
          slug={slug}
          venueName={state?.venue.name}
          config={partyConfig}
          queueItems={allPoolItems}
          onConfigChange={handlePartyConfigChange}
          onReloadGuestVotes={handleReloadPartyVotes}
          onOpenQrInvite={() => setPrintQrModalOpen(true)}
        />
      )}

      {errorMsg && (
        <div
          role="alert"
          className="rounded-xl border border-th-danger/30 bg-th-danger-soft p-3 text-xs text-th-danger flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2 font-medium">
            <span className="material-symbols-outlined text-base">error</span>
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="p-1 rounded-lg hover:bg-th-card transition-colors cursor-pointer"
            title="Cerrar mensaje"
          >
            <span className="material-symbols-outlined text-base leading-none">close</span>
          </button>
        </div>
      )}

      {/* ==================== 2-COLUMN OPERATIONAL STAGE ==================== */}
      <div className="grid grid-cols-12 gap-5 items-start">
        {/* ==================== LEFT COLUMN (5 COLS): NOW PLAYING & QUICK CONTROLS ==================== */}
        <section className="col-span-12 lg:col-span-5 flex flex-col gap-4">
          {/* Now Playing Hero Deck */}
          <div className="hero-panel rounded-2xl p-5 relative overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div className="inline-flex items-center gap-2 bg-th-danger-soft border border-th-danger/30 px-2.5 py-1 rounded-full text-th-danger">
                <span className="size-2 rounded-full bg-th-danger pulse-dot" />
                <span className="font-mono text-[10px] font-bold tracking-wider uppercase">
                  Sonando Ahora
                </span>
              </div>
              <div className="inline-flex items-center gap-1.5 font-mono text-xs text-th-accent bg-th-card px-2.5 py-1 rounded-full border border-th-border font-bold">
                <span
                  className="material-symbols-outlined text-sm"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  {nowPlaying && (nowPlaying.voteCount >= 9999 || nowPlaying.voteCount === 0) ? "stars" : "thumb_up"}
                </span>
                <span>
                  {nowPlaying && (nowPlaying.voteCount >= 9999 || nowPlaying.voteCount === 0)
                    ? "Selección Bar"
                    : `${nowPlaying?.voteCount ?? 0} votos`}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4 my-1">
              <div className="relative size-24 shrink-0">
                <div className="size-24 rounded-2xl overflow-hidden border border-th-border shadow-md bg-th-card flex items-center justify-center">
                  {nowPlaying?.thumbnailUrl ? (
                    <Image
                      src={nowPlaying.thumbnailUrl}
                      alt={nowPlaying.title}
                      width={96}
                      height={96}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <span className="material-symbols-outlined text-th-muted text-3xl">music_note</span>
                  )}
                </div>
              </div>

              <div className="flex flex-col min-w-0 flex-1">
                <span className="font-mono text-[11px] text-th-accent font-bold uppercase tracking-wider truncate">
                  {nowPlaying?.artist || "Playlist Local"}
                </span>
                <h2 className="text-lg font-display font-bold text-th-text tracking-tight truncate leading-snug mt-0.5">
                  {nowPlaying?.title || "Música de fondo activa"}
                </h2>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className="px-2 py-0.5 rounded-md bg-th-card text-xs text-th-text-2 border border-th-border flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs text-th-accent">table_bar</span>
                    <span>
                      {nowPlaying?.guestName
                        ? `Pedido por ${nowPlaying.guestName}`
                        : "Pedido por Mesa"}
                    </span>
                  </span>
                  {nowPlaying?.isKaraoke && (
                    <span className="px-2 py-0.5 rounded-md bg-th-accent-soft font-mono text-[10px] text-th-accent font-bold">
                      Karaoke
                    </span>
                  )}
                  <span className="font-mono text-[11px] text-th-muted tabular-nums">
                    {formatDuration(nowPlaying?.durationSeconds ?? 0)}
                  </span>
                </div>
                {nowPlaying?.dedication && (
                  <p className="mt-2 text-xs font-medium text-th-text bg-th-card border border-th-border rounded-xl px-2.5 py-1.5 truncate">
                    “{nowPlaying.dedication}”
                  </p>
                )}
              </div>
            </div>

            {nowPlaying && (
              <div className="mt-4 pt-3.5 border-t border-th-border flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => void handleSkip()}
                  className="flex-1 h-9 px-3 rounded-xl bg-th-accent hover:bg-th-accent-hover text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-base">skip_next</span>
                  <span>Saltear Tema</span>
                </button>

                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => setConfirmVetoId(nowPlaying.id)}
                  className="h-9 px-3.5 rounded-xl bg-th-danger-soft hover:bg-th-danger text-th-danger hover:text-white border border-th-danger/30 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-base">block</span>
                  <span>Vetar</span>
                </button>
              </div>
            )}
          </div>

          {/* Control Maestro & Audio Card */}
          <div className="card-panel rounded-2xl p-4 sm:p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-th-border pb-2.5">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-th-accent text-lg">settings_remote</span>
                <h3 className="text-xs font-display font-bold text-th-text uppercase tracking-wider">
                  Control Maestro de Cabina
                </h3>
              </div>
              <span className="text-[11px] font-mono text-th-emerald font-bold flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-th-emerald animate-pulse" />
                <span>En Vivo</span>
              </span>
            </div>

            <button
              type="button"
              onClick={() => setManualModalOpen(true)}
              className="w-full h-10 flex items-center justify-center gap-2 bg-th-accent hover:bg-th-accent-hover text-white rounded-xl text-xs font-semibold transition-all active:scale-95 cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">queue_music</span>
              <span>+ Poner Canción Manualmente</span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void handleTogglePause()}
                className="h-9 flex items-center justify-center gap-1.5 bg-th-recessed hover:bg-th-hover text-th-text px-3 rounded-xl text-xs font-semibold border border-th-border transition-colors active:scale-95 cursor-pointer"
              >
                <span className="material-symbols-outlined text-base text-th-accent">
                  {isPaused ? "play_circle" : "pause_circle"}
                </span>
                <span>{isPaused ? "Reanudar" : "Pausar"}</span>
              </button>

              <button
                type="button"
                disabled={actionLoading || (!nowPlaying && queue.length === 0)}
                onClick={() => void handleSkip()}
                className="h-9 flex items-center justify-center gap-1.5 bg-th-danger-soft hover:bg-th-danger text-th-danger hover:text-white px-3 rounded-xl text-xs font-semibold border border-th-danger/25 transition-colors active:scale-95 disabled:opacity-40 cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">skip_next</span>
                <span>Saltar Tema</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void handleKaraokeToggle()}
                className={`h-9 flex items-center justify-between px-3 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                  karaokeMode
                    ? "bg-th-accent-soft border-th-accent text-th-accent"
                    : "bg-th-recessed border-th-border text-th-text-2 hover:text-th-text"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base">mic_external_on</span>
                  <span>Karaoke</span>
                </span>
                <span className="font-mono text-[10px] font-bold">
                  {karaokeMode ? "ON" : "OFF"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => void handleToggleTvFullscreen()}
                className={`h-9 flex items-center justify-between px-3 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                  isTvFullscreen
                    ? "bg-th-teal-soft border-th-teal text-th-teal"
                    : "bg-th-recessed border-th-border text-th-text-2 hover:text-th-text"
                }`}
                title={isTvFullscreen ? "Desactivar pantalla completa en TV" : "Activar pantalla completa en TV"}
              >
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base">fullscreen</span>
                  <span>TV Full</span>
                </span>
                <span className="font-mono text-[10px] font-bold">
                  {isTvFullscreen ? "ON" : "OFF"}
                </span>
              </button>
            </div>

            {/* Volume Well */}
            <div className="recessed-panel p-3.5 rounded-xl flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-th-text-2 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-th-accent text-base">volume_up</span>
                  Volumen Salón
                </span>
                <span className="font-mono text-xs text-th-text font-bold tabular-nums">
                  {isMuted ? "0%" : `${volume}%`}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleToggleMute()}
                  className="text-th-muted hover:text-th-accent transition-colors cursor-pointer"
                  title="Silenciar / Activar Sonido (M)"
                >
                  <span className="material-symbols-outlined text-sm">
                    {isMuted ? "volume_off" : "volume_mute"}
                  </span>
                </button>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => void handleVolumeChange(Number(e.target.value))}
                  className="w-full accent-th-accent h-1.5 bg-th-border rounded-lg cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => void handleVolumeChange(100)}
                  className="text-th-muted hover:text-th-accent transition-colors cursor-pointer"
                  title="Volumen al máximo"
                >
                  <span className="material-symbols-outlined text-sm">volume_up</span>
                </button>
              </div>

              <div className="pt-1.5 flex items-center justify-between border-t border-th-border">
                <button
                  type="button"
                  onClick={() => void handleToggleMute()}
                  className="flex items-center gap-1 text-[11px] font-medium text-th-danger hover:underline cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">mic_off</span>
                  <span>{isMuted ? "Restablecer Audio" : "Corte de Emergencia"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleRestartPlayer()}
                  className="text-[11px] font-medium text-th-accent hover:underline cursor-pointer"
                >
                  Reiniciar TV
                </button>
              </div>
              {playerResetMsg && (
                <p className="text-th-emerald text-[11px] font-mono">{playerResetMsg}</p>
              )}
            </div>

            <Link
              href={`/panel/${slug}/tickets`}
              className="w-full h-10 flex items-center justify-between bg-th-recessed hover:bg-th-hover text-th-text border border-th-border px-4 rounded-xl text-xs font-semibold transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-base text-th-accent">confirmation_number</span>
                <span>Emitir Código Térmico</span>
              </div>
              <span className="text-[10px] bg-th-card border border-th-border px-2 py-0.5 rounded font-mono text-th-muted">F4</span>
            </Link>
          </div>

          {/* Parámetros de Turno */}
          <div className="card-panel rounded-2xl p-4 space-y-2.5">
            <h3 className="text-xs font-display font-bold text-th-text uppercase tracking-wider flex items-center gap-2">
              <span className="material-symbols-outlined text-th-accent text-base">tune</span>
              Parámetros de Turno
            </h3>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="recessed-panel rounded-xl p-2.5 text-center">
                <p className="text-[10px] font-mono uppercase text-th-muted">Límite cola</p>
                <p className="font-mono text-sm font-bold text-th-text tabular-nums mt-0.5">
                  {state?.settings.maxQueueSize ?? 20}
                </p>
              </div>
              <div className="recessed-panel rounded-xl p-2.5 text-center">
                <p className="text-[10px] font-mono uppercase text-th-muted">Ticket Base</p>
                <p className="font-mono text-sm font-bold text-th-accent tabular-nums mt-0.5">
                  {state?.settings.defaultCreditsPerCode ?? 3} votos
                </p>
              </div>
              <div className="recessed-panel rounded-xl p-2.5 text-center">
                <p className="text-[10px] font-mono uppercase text-th-muted">Filtro</p>
                <p className="font-mono text-sm font-bold text-th-emerald mt-0.5">
                  {state?.settings.explicitFilterEnabled ? "Activo" : "Libre"}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ==================== RIGHT COLUMN (7 COLS): BOUNDED SCROLLABLE QUEUE & PLAYLIST CONTAINER ==================== */}
        <section className="col-span-12 lg:col-span-7 card-panel rounded-2xl p-5 flex flex-col gap-4">
          {/* Header & Quick Add */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-display font-bold text-th-text tracking-tight flex items-center gap-2">
                <span className="material-symbols-outlined text-th-accent text-xl">queue_music</span>
                <span>Playlist & Cola en Vivo de Cabina</span>
              </h2>
              <p className="text-xs text-th-text-2 mt-0.5">
                Ordenada por votos · Contenedor con scroll interno independiente
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-th-accent bg-th-accent-soft px-2.5 py-1 rounded-full tabular-nums">
                {activeQueue.length + candidateProposals.length} temas
              </span>
              <button
                type="button"
                onClick={() => setManualModalOpen(true)}
                className="h-9 px-3 rounded-xl bg-th-accent hover:bg-th-accent-hover text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-base">add</span>
                <span>Poner Tema</span>
              </button>
            </div>
          </div>

          {/* Segmented Tabs + Inline Filter Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-th-border">
            <div className="inline-flex items-center rounded-xl bg-th-recessed border border-th-border p-1 gap-1 self-start">
              <button
                type="button"
                onClick={() => setCabinaQueueTab("queue")}
                className={`h-8 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  cabinaQueueTab === "queue"
                    ? "bg-th-card text-th-text shadow-xs"
                    : "text-th-text-2 hover:text-th-text"
                }`}
              >
                <span>Cola Activa</span>
                <span className="font-mono text-[11px] px-1.5 py-0.2 rounded-full bg-th-accent-soft text-th-accent tabular-nums">
                  {activeQueue.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setCabinaQueueTab("candidates")}
                className={`h-8 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  cabinaQueueTab === "candidates"
                    ? "bg-th-card text-th-text shadow-xs"
                    : "text-th-text-2 hover:text-th-text"
                }`}
              >
                <span>Propuestas</span>
                <span
                  className={`font-mono text-[11px] px-1.5 py-0.2 rounded-full tabular-nums ${
                    candidateProposals.length > 0
                      ? "bg-th-amber-soft text-th-amber font-bold"
                      : "bg-th-recessed text-th-muted"
                  }`}
                >
                  {candidateProposals.length}
                </span>
              </button>
            </div>

            <div className="relative flex-1 sm:max-w-[240px]">
              <span className="material-symbols-outlined text-base text-th-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                search
              </span>
              <input
                type="search"
                value={queueFilter}
                onChange={(e) => setQueueFilter(e.target.value)}
                placeholder="Filtrar tema o mesa..."
                aria-label="Filtrar temas en cola"
                className="ui-input h-9 pl-9 pr-3 text-xs"
              />
            </div>
          </div>

          {/* Proposals Voting Round Controls Bar when Candidates Tab Active */}
          {cabinaQueueTab === "candidates" && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-th-amber-soft border border-th-amber/25 px-3.5 py-2.5 text-xs">
              <div className="flex items-center gap-2 text-th-text">
                <span className="material-symbols-outlined text-base text-th-amber">how_to_vote</span>
                <span>
                  Meta: <strong className="font-mono">{effectiveThreshold} {effectiveThreshold === 1 ? "voto" : "votos"}</strong> para subir directo a la TV
                </span>
              </div>
              <div className="flex items-center gap-2">
                {state?.votingRound?.enabled && (
                  <span className="font-mono text-[11px] text-th-amber bg-th-card px-2.5 py-1 rounded-full border border-th-amber/30 flex items-center gap-1 tabular-nums">
                    <span className="material-symbols-outlined text-xs">timer</span>
                    <span>Ronda #{state.votingRound.roundNumber}: {formatDuration(roundSecondsLeft)}</span>
                  </span>
                )}
                {candidateProposals.length > 0 && (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={handleResolveRound}
                    className="h-7 px-2.5 rounded-lg bg-th-amber text-white text-xs font-semibold transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                    title="Promueve inmediatamente el tema líder a la cola sin esperar que termine el temporizador"
                  >
                    <span className="material-symbols-outlined text-sm">bolt</span>
                    <span>Resolver Ronda</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* BOUNDED INTERNAL SCROLLABLE CONTAINER */}
          <div className="max-h-[430px] lg:max-h-[500px] min-h-[260px] rounded-xl bg-th-recessed border border-th-border p-2.5 ui-scroll-container space-y-2">
            {cabinaQueueTab === "queue" ? (
              filteredActiveQueue.length === 0 ? (
                <div className="py-12 text-center text-xs text-th-muted space-y-2">
                  <span className="material-symbols-outlined text-3xl text-th-muted/60">playlist_remove</span>
                  <p className="font-medium text-th-text-2">
                    {normalizedFilter
                      ? "Ningún tema coincide con tu búsqueda."
                      : `No hay canciones en la cola en este momento.`}
                  </p>
                </div>
              ) : (
                filteredActiveQueue.map((item, index) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl bg-th-card border border-th-border flex items-center justify-between gap-3 hover:border-th-border-strong transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <BallChip n={index + 1} size="md" />
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-display font-bold text-th-text truncate">
                          {item.title}
                        </h4>
                        <p className="text-xs text-th-text-2 truncate mt-0.5">
                          {item.artist}{" "}
                          {item.durationSeconds ? (
                            <span className="font-mono tabular-nums text-th-muted">
                              · {formatDuration(item.durationSeconds)}
                            </span>
                          ) : ""}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-1 font-mono text-[11px] text-th-muted">
                          <span className="text-th-accent font-bold tabular-nums">
                            {item.voteCount >= 9999 || item.voteCount === 0 ? "Selección Cabina" : `${item.voteCount} votos`}
                          </span>
                          <span>·</span>
                          <span>
                            {item.guestName
                              ? item.guestName
                              : item.voteCount >= 9999 || item.voteCount === 0
                                ? "Operador"
                                : "Mesa en vivo"}
                          </span>
                          {item.isKaraoke && (
                            <span className="text-th-accent font-bold bg-th-accent-soft px-1.5 py-0.5 rounded text-[10px]">
                              Karaoke
                            </span>
                          )}
                        </div>
                        {item.dedication && (
                          <p className="mt-1 text-xs text-th-text-2 italic truncate">
                            “{item.dedication}”
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => setConfirmVetoId(item.id)}
                        className="h-8 px-3 rounded-lg bg-th-danger-soft hover:bg-th-danger text-th-danger hover:text-white border border-th-danger/25 text-xs font-semibold flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                        title="Vetar de la cola"
                      >
                        <span className="material-symbols-outlined text-sm">block</span>
                        <span>Vetar</span>
                      </button>
                    </div>
                  </div>
                ))
              )
            ) : filteredCandidates.length === 0 ? (
              <div className="py-12 text-center text-xs text-th-muted space-y-2">
                <span className="material-symbols-outlined text-3xl text-th-muted/60">how_to_vote</span>
                <p className="font-medium text-th-text-2">
                  {normalizedFilter
                    ? "Ninguna propuesta coincide con tu búsqueda."
                    : "No hay propuestas esperando votos en este momento."}
                </p>
              </div>
            ) : (
              filteredCandidates.map((item, index) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-th-card border border-th-border flex items-center justify-between gap-3 hover:border-th-border-strong transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex items-center justify-center size-8 rounded-lg bg-th-amber-soft text-th-amber font-mono text-xs font-bold shrink-0 tabular-nums">
                      #{index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-display font-bold text-th-text truncate">
                          {item.title}
                        </h4>
                        {index === 0 && (
                          <span className="shrink-0 text-[10px] font-mono font-bold bg-th-amber-soft text-th-amber px-2 py-0.5 rounded-full">
                            Líder Ronda
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-th-text-2 truncate mt-0.5">
                        {item.artist}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-1 font-mono text-[11px] text-th-muted">
                        <span className="text-th-amber font-bold tabular-nums">
                          {item.voteCount} / {effectiveThreshold} votos
                        </span>
                        <span>·</span>
                        <span>
                          Faltan {Math.max(0, effectiveThreshold - item.voteCount)} para cola
                        </span>
                        {item.guestName && (
                          <span className="text-th-accent font-semibold">· {item.guestName}</span>
                        )}
                      </div>
                      {item.dedication && (
                        <p className="mt-1 text-xs text-th-text-2 italic truncate">
                          “{item.dedication}”
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => setConfirmVetoId(item.id)}
                      className="h-8 px-3 rounded-lg bg-th-danger-soft hover:bg-th-danger text-th-danger hover:text-white border border-th-danger/25 text-xs font-semibold flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                      title="Vetar propuesta"
                    >
                      <span className="material-symbols-outlined text-sm">block</span>
                      <span>Vetar</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        open={confirmOpen}
        title="¿Abrir la noche?"
        description="Los clientes podrán empezar a proponer canciones y votar desde sus mesas."
        confirmLabel="Sí, abrir noche"
        onConfirm={() => void handleOpenNight()}
        onCancel={() => setConfirmOpen(false)}
      />

      <ConfirmDialog
        open={confirmClose}
        title="¿Cerrar la sesión de la noche?"
        description="Se detendrán los votos activos y la sesión actual finalizará para el balance de caja."
        confirmLabel="Sí, cerrar noche"
        onConfirm={() => void handleCloseNight()}
        onCancel={() => setConfirmClose(false)}
      />

      <ConfirmDialog
        open={Boolean(confirmVetoId)}
        title="¿Vetar esta canción?"
        description="La canción será removida inmediatamente de la cola y no se reproducirá."
        confirmLabel="Sí, vetar"
        onConfirm={() => {
          if (confirmVetoId) void handleVeto(confirmVetoId);
        }}
        onCancel={() => setConfirmVetoId(null)}
      />

      {/* Pair Player Dialog (Legacy Token) */}
      <PairPlayerDialog
        open={pairDialogOpen}
        venueId={state?.venue.id || ""}
        slug={slug}
        onClose={() => setPairDialogOpen(false)}
      />

      {/* Modern Smart TV Devices Manager (6-Digit Code / QR / Status) */}
      <TvDevicesManagerModal
        isOpen={tvManagerOpen}
        onClose={() => {
          setTvManagerOpen(false);
          setInitialPairCode(null);
        }}
        slug={slug}
        initialCode={initialPairCode}
      />

      {/* Printable QR / Table Tent PDF Modal */}
      <PrintQrModal
        isOpen={printQrModalOpen}
        onClose={() => setPrintQrModalOpen(false)}
        slug={slug}
        venueName={state?.venue.name}
      />

      {/* Manual Track Selection & Master Playback Modal */}
      <ManualPlaybackModal
        isOpen={manualModalOpen}
        onClose={() => setManualModalOpen(false)}
        slug={slug}
        defaultKaraoke={karaokeMode}
        onActionComplete={() => void refresh()}
      />
    </div>
  );
}
