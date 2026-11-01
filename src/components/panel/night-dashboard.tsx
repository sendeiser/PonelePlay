"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BallChip } from "@/components/ball-chip";
import { createNightStateSource } from "@/lib/api/night-state";
import { useNightState } from "@/hooks/use-night-state";
import {
  closeNight,
  openNight,
  setProposalsEnabled,
  skipCurrent,
  vetoItem,
} from "@/lib/api/panel-actions";
import { nightPhase } from "@/lib/domain/night";
import { type PanelRole } from "@/lib/domain/permissions";
import { PairPlayerDialog } from "./pair-player";
import { ManualPlaybackModal } from "./manual-playback-modal";
import { TvDevicesManagerModal } from "./tv-devices-manager-modal";

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
      if (state?.nowPlaying) {
        await skipCurrent(state.nowPlaying.id, staffToken);
      }
      await refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Error al saltear canción");
    } finally {
      setActionLoading(false);
    }
  }, [slug, state?.nowPlaying, staffToken, refresh]);

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
      await vetoItem(itemId, staffToken);
      setConfirmVetoId(null);
      await refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Error al vetar canción");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading && !state) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400 font-mono text-xs">
        <span className="inline-block size-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mr-2" />
        Cargando panel de control y telemetría nocturna...
      </div>
    );
  }

  const queue = state?.queue ?? [];
  const nowPlaying = state?.nowPlaying ?? null;
  const isPlayerConnected = Boolean(state?.player?.lastSeenAt);

  return (
    <div className="space-y-6">
      {/* ==================== TOP OPERATIONAL STATUS BAR ==================== */}
      <section className="card-panel rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        {/* Session Live Meta */}
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <h1 className="text-base font-bold text-white tracking-tight">
              Control de la Noche
            </h1>
            <p className="font-mono text-[10px] text-slate-400">
              {state?.venue.name} · Modo {role}
            </p>
          </div>
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-mono text-xs font-bold uppercase tracking-wider ${
              isOpen
                ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                : "bg-slate-800 text-slate-400 border border-slate-700"
            }`}
          >
            <span
              className={`size-2 rounded-full ${
                isOpen ? "bg-emerald-400 pulse-dot" : "bg-slate-500"
              }`}
            />
            <span>{isOpen ? "Noche Abierta" : "Noche Cerrada"}</span>
          </div>

          <div className="h-4 w-px bg-[#1E2333] hidden sm:block" />

          <div className="flex items-center gap-4 text-xs font-mono text-slate-300">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-slate-500 text-base">schedule</span>
              <span className="text-slate-400">Estado:</span>
              <span className="font-bold text-white">
                {isOpen ? "Sesión Activa" : "Cerrado"}
              </span>
            </div>
            <span className="text-slate-600">•</span>
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-indigo-400 text-base">group</span>
              <span className="text-white font-semibold">{queue.length} temas</span>
              <span className="text-slate-400">en cola</span>
            </div>
            <span className="text-slate-600">•</span>
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-cyan-400 text-base">verified_user</span>
              <span className="text-white font-semibold uppercase">{role}</span>
            </div>
          </div>
        </div>

        {/* Operational Control Toggles & Close Shift Button */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 sm:gap-6">
          {/* Switch Toggle: Aceptar Propuestas de Clientes */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div className="relative">
              <input
                type="checkbox"
                id="toggle-proposals"
                checked={state?.settings.proposalsEnabled ?? false}
                onChange={() => void handleToggleProposals()}
                disabled={actionLoading || !isOpen}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-[#181b25] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white peer-checked:bg-indigo-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#1E2333] after:border after:rounded-full after:size-5 after:transition-all" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-white">
                Aceptar Propuestas de Clientes
              </span>
              <span
                className={`text-[10px] font-mono ${
                  state?.settings.proposalsEnabled ? "text-emerald-400" : "text-slate-400"
                }`}
              >
                {state?.settings.proposalsEnabled
                  ? "ON · Clientes pueden proponer temas"
                  : "OFF · Propuestas pausadas"}
              </span>
            </div>
          </label>

          <div className="h-6 w-px bg-[#1E2333] hidden sm:block" />

          {/* Botón: Cerrar Noche / Abrir Noche */}
          {isOpen ? (
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => setConfirmClose(true)}
              className="flex items-center gap-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 px-4 py-2 rounded-lg text-xs font-mono font-bold border border-rose-500/30 active:scale-95 duration-150 transition-all"
            >
              <span className="material-symbols-outlined text-base">power_settings_new</span>
              <span>Cerrar Noche (Fin de Turno)</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => setConfirmOpen(true)}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-mono font-bold active:scale-95 duration-150 transition-all shadow-md shadow-emerald-600/30"
            >
              <span className="material-symbols-outlined text-base">play_arrow</span>
              <span>Abrir Noche</span>
            </button>
          )}
        </div>
      </section>

      {/* ==================== HARDWARE & CONNECTIVITY BANNER ==================== */}
      <section className="recessed-dark rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-indigo-300">
            <span className="material-symbols-outlined text-base text-cyan-400">desktop_windows</span>
            <span className="text-slate-300">Reproductor TV PC:</span>
            {isPlayerConnected ? (
              <span className="text-emerald-400 font-bold">Conectado (Sync Activo)</span>
            ) : (
              <span className="text-amber-400 font-bold">Esperando vinculación</span>
            )}
          </div>
          <span className="text-slate-600">|</span>
          <div className="flex items-center gap-2 text-slate-400">
            <span className="material-symbols-outlined text-base text-indigo-400">volume_up</span>
            <span>Canal Audio Principal Salón</span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-slate-400">
          <button
            type="button"
            onClick={() => setTvManagerOpen(true)}
            className="flex items-center gap-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 hover:text-white px-3 py-1.5 rounded-lg border border-indigo-500/40 text-xs font-mono font-bold transition-all shadow-sm"
          >
            <span className="material-symbols-outlined text-sm text-cyan-400">tv</span>
            <span>Pantallas TV (PIN / QR)</span>
          </button>
          <button
            type="button"
            onClick={() => setPairDialogOpen(true)}
            className="hover:text-slate-300 text-slate-400 text-xs transition-colors hidden sm:flex items-center gap-1"
            title="Vincular mediante token manual"
          >
            <span className="material-symbols-outlined text-xs">key</span>
            <span>Token</span>
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            className="hover:text-white text-slate-400 text-xs flex items-center gap-1"
            title="Actualizar datos"
          >
            <span className="material-symbols-outlined text-sm">refresh</span>
            <span>Actualizar</span>
          </button>
        </div>
      </section>

      {errorMsg && (
        <div
          role="alert"
          className="rounded-xl border border-red-500/40 bg-red-950/60 p-3 text-xs text-red-200 flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-base text-red-400">error</span>
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ==================== 2-COLUMN CENTRAL OPERATIONAL PANEL ==================== */}
      <div className="grid grid-cols-12 gap-6 items-start">
        {/* ==================== COLUMNA IZQUIERDA: AHORA SUENA & CONTROLES STAFF (5 COLS) ==================== */}
        <section className="col-span-12 lg:col-span-5 flex flex-col gap-5">
          {/* Tarjeta Prominente: Ahora Suena */}
          <div className="hero-panel rounded-2xl p-5 relative overflow-hidden border border-[#2a3148] shadow-2xl">
            {/* Ambient Neon Top Glow */}
            <div className="absolute -top-12 -right-12 size-48 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />

            {/* Header badge ON AIR */}
            <div className="flex items-center justify-between mb-4 relative z-10">
              <div className="flex items-center gap-2 bg-rose-500/15 border border-rose-500/40 px-3 py-1 rounded-full text-rose-400">
                <span className="size-2 rounded-full bg-rose-500 pulse-dot" />
                <span className="font-mono text-[10px] font-bold tracking-wider">
                  EN AIRE · JUKEBOX SALÓN
                </span>
              </div>
              <div className="flex items-center gap-1.5 font-mono text-xs text-indigo-300 bg-[#0a0e17]/80 px-2.5 py-1 rounded-lg border border-[#1E2333]">
                <span className="material-symbols-outlined text-sm text-indigo-400" style={{ fontVariationSettings: "'FILL' 1" }}>
                  thumb_up
                </span>
                <span>{nowPlaying?.voteCount ?? 0} votos</span>
              </div>
            </div>

            {/* Vinyl Showcase & Song Details */}
            <div className="flex items-center gap-4 my-2 relative z-10">
              {/* Vinyl Record Artwork Graphic */}
              <div className="relative size-28 shrink-0">
                <div className="absolute inset-0 rounded-xl overflow-hidden border border-[#2a3148] shadow-lg z-10 bg-[#181b25] flex items-center justify-center">
                  {nowPlaying?.thumbnailUrl ? (
                    <Image
                      src={nowPlaying.thumbnailUrl}
                      alt={nowPlaying.title}
                      width={112}
                      height={112}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <span className="material-symbols-outlined text-slate-500 text-3xl">music_note</span>
                  )}
                </div>
                {/* Vinyl Record Disc Sliding Out */}
                <div className="absolute -right-4 -top-1 size-24 rounded-full bg-[#07090e] border border-[#2a3045] flex items-center justify-center spin-vinyl z-0 shadow-xl">
                  <div className="size-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center border-2 border-[#0a0e17]">
                    <div className="size-2.5 rounded-full bg-[#0a0e17]" />
                  </div>
                </div>
              </div>

              {/* Title & Artist Meta */}
              <div className="flex flex-col min-w-0 flex-1">
                <span className="font-mono text-[11px] text-indigo-300 uppercase tracking-widest truncate">
                  {nowPlaying?.artist || "Playlist Local"}
                </span>
                <h2 className="text-lg font-bold text-white tracking-tight truncate leading-tight mt-0.5">
                  {nowPlaying?.title || "Música de fondo activa"}
                </h2>
                <div className="flex items-center gap-2 mt-2">
                  <span className="px-2 py-0.5 rounded-md bg-[#0a0e17] font-mono text-[10px] text-slate-300 border border-[#1E2333] flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs text-indigo-400">table_bar</span>
                    <span>Pedido por Mesa Salón</span>
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">
                    {formatDuration(nowPlaying?.durationSeconds ?? 0)}
                  </span>
                </div>
              </div>
            </div>

            {/* Staff Moderation Actions for Now Playing */}
            {nowPlaying && (
              <div className="mt-4 pt-3 border-t border-[#2a3148] flex items-center gap-3 relative z-10">
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => void handleSkip()}
                  className="flex-1 py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-md shadow-indigo-600/30"
                >
                  <span className="material-symbols-outlined text-base">skip_next</span>
                  <span>Saltear Tema</span>
                </button>

                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => setConfirmVetoId(nowPlaying.id)}
                  className="py-2 px-3 rounded-lg bg-red-950/40 hover:bg-red-950/70 text-red-300 border border-red-500/30 font-mono text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95"
                >
                  <span className="material-symbols-outlined text-base">block</span>
                  <span>Vetar</span>
                </button>
              </div>
            )}
          </div>

          {/* Card: Control Maestro de Cabina */}
          <div className="card-panel rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-[#1E2333] pb-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-indigo-400 text-base">settings_remote</span>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  Control Maestro de Cabina
                </h3>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 font-semibold flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>En Vivo TV</span>
              </span>
            </div>

            {/* Modo Karaoke Live Switch */}
            <button
              type="button"
              onClick={() => void handleKaraokeToggle()}
              className={`w-full flex items-center justify-between p-2.5 rounded-xl border font-mono text-xs font-bold transition-all ${
                karaokeMode
                  ? "bg-gradient-to-r from-pink-950/60 to-purple-950/60 border-pink-500/50 text-pink-200 shadow-lg shadow-pink-500/20"
                  : "bg-[#181b25] border-[#232b42] text-slate-300 hover:text-white hover:border-pink-500/30"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-lg text-pink-400">
                  mic_external_on
                </span>
                <span>Modo Karaoke en Vivo</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase ${
                  karaokeMode
                    ? "bg-pink-500 text-white font-bold animate-pulse"
                    : "bg-slate-800 text-slate-400"
                }`}>
                  {karaokeMode ? "ACTIVO" : "INACTIVO"}
                </span>
              </div>
            </button>

            {/* Quick Button: Poner Canción Manualmente */}
            <button
              type="button"
              onClick={() => setManualModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white py-2.5 px-3 rounded-lg text-xs font-mono font-bold shadow-md shadow-emerald-600/25 transition-all active:scale-95"
            >
              <span className="material-symbols-outlined text-base">queue_music</span>
              <span>+ Poner Canción Manualmente</span>
            </button>

            {/* Main Player Control Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void handleTogglePause()}
                className="flex items-center justify-center gap-2 bg-[#181b25] hover:bg-[#202534] text-white py-2.5 px-3 rounded-lg text-xs font-mono font-bold border border-[#1E2333] hover:border-indigo-500/40 transition-all active:scale-95"
              >
                <span className="material-symbols-outlined text-lg text-indigo-400">
                  {isPaused ? "play_circle" : "pause_circle"}
                </span>
                <span>{isPaused ? "Reanudar Música" : "Pausar Música"}</span>
              </button>

              <button
                type="button"
                disabled={actionLoading || (!nowPlaying && queue.length === 0)}
                onClick={() => void handleSkip()}
                className="flex items-center justify-center gap-2 bg-[#181b25] hover:bg-rose-500/10 text-rose-400 py-2.5 px-3 rounded-lg text-xs font-mono font-bold border border-rose-500/30 transition-all active:scale-95 disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-lg">skip_next</span>
                <span>Saltar Tema (Skip)</span>
              </button>
            </div>

            {/* Remote TV Fullscreen Toggle Button */}
            <button
              type="button"
              onClick={() => void handleToggleTvFullscreen()}
              className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-mono font-bold border transition-all active:scale-95 ${
                isTvFullscreen
                  ? "bg-gradient-to-r from-cyan-500/25 to-indigo-500/25 text-cyan-300 border-cyan-500/50 shadow-[0_0_12px_rgba(6,182,212,0.35)] animate-pulse"
                  : "bg-[#181b25] hover:bg-[#202534] text-slate-300 hover:text-cyan-400 border-[#1E2333]"
              }`}
              title={isTvFullscreen ? "Desactivar pantalla completa en la TV" : "Activar pantalla completa en la TV del salón"}
            >
              <span className="material-symbols-outlined text-base text-cyan-400">fullscreen</span>
              <span>{isTvFullscreen ? "Pantalla Completa TV: ACTIVADA" : "Activar Pantalla Completa en TV"}</span>
            </button>

            {/* Volume Slider / Salida de Emergencia */}
            <div className="recessed-dark p-3 rounded-lg flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
                  <span className="material-symbols-outlined text-indigo-400 text-base">volume_up</span>
                  <span>Volumen Salón Principal</span>
                </div>
                <span className="font-mono text-xs text-white font-bold">{isMuted ? "0%" : `${volume}%`}</span>
              </div>

              {/* Range Slider */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleToggleMute()}
                  className="text-slate-400 hover:text-indigo-400 transition-colors"
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
                  className="w-full accent-indigo-500 h-1.5 bg-[#0a0e17] rounded-lg cursor-pointer border border-[#1E2333]"
                />
                <button
                  type="button"
                  onClick={() => void handleVolumeChange(100)}
                  className="text-slate-400 hover:text-indigo-400 transition-colors"
                  title="Volumen al máximo"
                >
                  <span className="material-symbols-outlined text-sm">volume_up</span>
                </button>
              </div>

              {/* Emergency Mic / Silence Bar Button */}
              <div className="pt-1 flex items-center justify-between border-t border-[#1E2333]/50">
                <button
                  type="button"
                  onClick={() => void handleToggleMute()}
                  className="flex items-center gap-1.5 text-[11px] font-mono text-rose-400 hover:text-rose-300 underline py-0.5"
                >
                  <span className="material-symbols-outlined text-sm">mic_off</span>
                  <span>{isMuted ? "Restablecer Audio Salón" : "Silenciar Salón (Corte de Emergencia)"}</span>
                </button>
                <span className="text-[10px] font-mono text-slate-500">Limitador: -3dB</span>
              </div>
            </div>

            {/* Quick Action: Emitir Código Térmico en 1 Clic */}
            <Link
              href={`/panel/${slug}/tickets`}
              className="w-full flex items-center justify-between bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white px-4 py-2.5 rounded-xl font-mono text-xs font-bold transition-all shadow-md shadow-indigo-600/25 active:scale-98"
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-base">confirmation_number</span>
                <span>Emitir Código Térmico en 1 Clic</span>
              </div>
              <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded font-mono">F4</span>
            </Link>

            {/* Reiniciar Player Link */}
            <div className="flex items-center justify-between pt-1 text-[11px] font-mono text-slate-400">
              <button
                type="button"
                onClick={() => void handleRestartPlayer()}
                className="hover:text-indigo-400 text-indigo-300 underline transition-colors"
              >
                Reiniciar Player TV
              </button>
              {playerResetMsg && (
                <span className="text-emerald-400 text-[10px]">{playerResetMsg}</span>
              )}
            </div>
          </div>

          {/* Card: Configuración rápida de reproducción */}
          <div className="card-panel rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <span className="material-symbols-outlined text-indigo-400 text-base">tune</span>
              Parámetros de Turno
            </h3>
            <div className="space-y-2 text-xs font-mono text-slate-300">
              <div className="flex justify-between items-center py-1 border-b border-[#1E2333]">
                <span className="text-slate-400">Límite de cola:</span>
                <span className="font-bold text-white">{state?.settings.maxQueueSize ?? 20} canciones</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-[#1E2333]">
                <span className="text-slate-400">Créditos default ticket:</span>
                <span className="font-bold text-indigo-300">{state?.settings.defaultCreditsPerCode ?? 3} votos</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400">Filtro explícito:</span>
                <span className="font-bold text-emerald-400">
                  {state?.settings.explicitFilterEnabled ? "Activado" : "Desactivado"}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ==================== COLUMNA DERECHA: COLA EN VIVO & MODERACIÓN (7 COLS) ==================== */}
        <section className="col-span-12 lg:col-span-7 card-panel rounded-2xl p-5 shadow-2xl">
          <div className="flex items-center justify-between pb-3 border-b border-[#1E2333]">
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span className="material-symbols-outlined text-indigo-400 text-lg">queue_music</span>
                Cola en Vivo & Moderación
              </h2>
              <p className="font-mono text-xs text-slate-400">
                Canciones en espera ordenadas por votos y orden de llegada
              </p>
            </div>
            <span className="font-mono text-xs text-indigo-300 bg-[#181b25] px-2.5 py-1 rounded-full border border-[#1E2333]">
              {queue.length} temas en cola
            </span>
          </div>

          {/* Queue List */}
          {queue.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 font-mono space-y-2">
              <span className="material-symbols-outlined text-slate-600 text-3xl">playlist_remove</span>
              <p>No hay canciones en la cola en este momento.</p>
              <p className="text-slate-600">Cuando los clientes propongan temas, aparecerán aquí para moderar.</p>
            </div>
          ) : (
            <div className="mt-4 space-y-2.5">
              {queue.map((item, index) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-[#131722] border border-[#1e2333] flex items-center justify-between gap-3 hover:border-[#2a344e] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <BallChip n={index + 1} size="md" />
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-bold text-white truncate">
                        {item.title}
                      </h4>
                      <p className="text-xs text-slate-400 truncate mt-0.5">
                        {item.artist} {item.durationSeconds ? `· ${formatDuration(item.durationSeconds)}` : ""}
                      </p>
                      <div className="flex items-center gap-2 mt-1 font-mono text-[10px] text-slate-400">
                        <span className="text-indigo-400 font-semibold">{item.voteCount} votos</span>
                        <span className="text-slate-600">•</span>
                        <span>Mesa en vivo</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => setConfirmVetoId(item.id)}
                      className="py-1.5 px-3 rounded-lg bg-red-950/40 hover:bg-red-950/70 text-red-300 border border-red-500/30 font-mono text-xs font-semibold flex items-center gap-1 active:scale-95 transition-all"
                      title="Vetar de la cola"
                    >
                      <span className="material-symbols-outlined text-sm">block</span>
                      <span>Vetar</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
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
