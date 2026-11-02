"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Image from "next/image";
import {
  Mic,
  Music2,
  Pause,
  Play,
  RotateCcw,
  Search,
  SkipForward,
  Volume2,
  VolumeX,
  ArrowUp,
  ChevronUp,
  Flame,
  ListMusic,
  PlayCircle,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { createNightStateSource } from "@/lib/api/night-state";
import { useNightState } from "@/hooks/use-night-state";
import { partitionQueueAndProposals, MIN_VOTES_FOR_QUEUE } from "@/lib/domain/queue";
import { vetoItem } from "@/lib/api/panel-actions";
import { castVote } from "@/lib/api/votes";
import type { QueueItemView } from "@/lib/api/contracts";
import type { PlayerTrack } from "@/lib/api/player";
import {
  fetchPlaybackState,
  togglePausePlayback,
  setPlaybackVolume,
  toggleMutePlayback,
  skipPlayback,
  seekPlayback,
  setKaraokeMode as setKmRemote,
  sendPlaybackCommand,
} from "@/lib/api/master-control";
import { ManualPlaybackModal } from "./manual-playback-modal";
import { PanelAudioEngine, type PanelAudioEngineRef } from "./panel-audio-engine";

interface PanelPlaybackFooterProps {
  slug: string;
  isSidebarCollapsed?: boolean;
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function PanelPlaybackFooter({
  slug,
  isSidebarCollapsed = false,
}: PanelPlaybackFooterProps) {
  const [currentTrack, setCurrentTrack] = useState<PlayerTrack | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [volume, setVolume] = useState(85);
  const [isMuted, setIsMuted] = useState(false);
  const [karaokeMode, setKaraokeMode] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);

  // Modals
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  // Expandable Queue & Remote Deck Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"queue" | "candidates">("queue");
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const audioEngineRef = useRef<PanelAudioEngineRef>(null);
  const [isAudioBlocked, setIsAudioBlocked] = useState(false);

  const nightSource = useMemo(() => createNightStateSource(slug), [slug]);
  const { state: nightState, refresh: refreshNightState } = useNightState(nightSource);

  useEffect(() => {
    if (!currentTrack && nightState?.nowPlaying) {
      setCurrentTrack({
        itemId: nightState.nowPlaying.id,
        trackId: nightState.nowPlaying.trackId,
        title: nightState.nowPlaying.title,
        artist: nightState.nowPlaying.artist,
        source: nightState.nowPlaying.source,
        durationSeconds: nightState.nowPlaying.durationSeconds ?? 210,
        youtubeVideoId: nightState.nowPlaying.youtubeVideoId || undefined,
        thumbnailUrl: nightState.nowPlaying.thumbnailUrl ?? null,
        voteCount: nightState.nowPlaying.voteCount,
      });
    }
  }, [currentTrack, nightState?.nowPlaying]);

  const { activeQueue, candidateProposals } = useMemo(() => {
    return partitionQueueAndProposals(nightState?.queue ?? [], nightState?.candidates ?? []);
  }, [nightState?.queue, nightState?.candidates]);

  // Drawer Actions: Play now, Veto, Boost vote
  const handlePlayQueueItemNow = async (item: QueueItemView) => {
    setPendingActionId(item.id);
    try {
      await sendPlaybackCommand(slug, "play_now", {
        track: {
          itemId: item.id,
          trackId: item.trackId,
          title: item.title,
          artist: item.artist,
          youtubeVideoId: item.youtubeVideoId,
          thumbnailUrl: item.thumbnailUrl,
          durationSeconds: item.durationSeconds,
          source: item.source || "catalog",
          voteCount: item.voteCount,
        },
      });
      showToast(`Poniendo en TV: "${item.title}"`);
      await refreshNightState();
      await loadState();
    } catch {
      showToast("Error al reproducir en TV");
    } finally {
      setPendingActionId(null);
    }
  };

  const handleVetoQueueItem = async (item: QueueItemView) => {
    setPendingActionId(item.id);
    try {
      await vetoItem(item.id);
      showToast(`Tema quitado de la cola: "${item.title}"`);
      await refreshNightState();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Error al quitar tema");
    } finally {
      setPendingActionId(null);
    }
  };

  const handleBoostQueueItem = async (item: QueueItemView) => {
    setPendingActionId(item.id);
    try {
      await castVote(item.id);
      showToast(`+1 voto sumado para "${item.title}"`);
      await refreshNightState();
    } catch {
      showToast("Error al sumar voto");
    } finally {
      setPendingActionId(null);
    }
  };

  const showToast = useCallback((msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => setFeedbackToast(null), 2500);
  }, []);

  // 1. Initial State Sync
  const loadState = useCallback(async () => {
    try {
      const st = await fetchPlaybackState(slug);
      if (st.currentTrack) setCurrentTrack(st.currentTrack);
      setIsPaused(st.isPaused);
      setVolume(st.volume ?? 85);
      setIsMuted(st.isMuted ?? false);
      setKaraokeMode(st.karaokeMode ?? false);
    } catch {
      // Non-blocking fallback
    }
  }, [slug]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  // 2. Realtime listener
  useEffect(() => {
    let active = true;
    let channel: import("@supabase/supabase-js").RealtimeChannel | null = null;

    void import("@/lib/api/supabase/browser").then(({ createBrowserSupabase }) => {
      if (!active) return;
      const supabase = createBrowserSupabase();

      const existing = supabase.getChannels().find(
        (c) =>
          c.topic === `realtime:playback-control:${slug}` ||
          c.topic === `playback-control:${slug}`,
      );
      if (existing) {
        void supabase.removeChannel(existing);
      }

      channel = supabase
        .channel(`playback-control:${slug}`)
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
            else if (cmd === "seek" && typeof p.seconds === "number") {
              setElapsed(Math.floor(p.seconds));
            } else if (cmd === "play_now" && p.track) {
              setCurrentTrack(p.track as PlayerTrack);
              setIsPaused(false);
              setElapsed(0);
              setVideoDuration(null);
            }
          },
        )
        .on(
          "broadcast",
          { event: "tv_playback_progress" },
          (msg: {
            payload?: {
              currentTime?: number;
              duration?: number;
              isPaused?: boolean;
              trackId?: string;
              isVideoFullscreen?: boolean;
            };
          }) => {
            if (!active || !msg.payload) return;
            const { currentTime, duration: d, isPaused: p } = msg.payload;
            if (typeof currentTime === "number" && !isNaN(currentTime)) {
              setElapsed(Math.floor(currentTime));
            }
            if (typeof d === "number" && !isNaN(d) && d > 0) {
              setVideoDuration(Math.floor(d));
            }
            if (typeof p === "boolean") {
              setIsPaused(p);
            }
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "venue_playback_state" },
          (payload: { new?: { is_paused?: boolean; volume?: number; is_muted?: boolean; karaoke_mode?: boolean; current_track?: PlayerTrack } }) => {
            if (!active || !payload.new) return;
            const st = payload.new;
            if (typeof st.is_paused === "boolean") setIsPaused(st.is_paused);
            if (typeof st.volume === "number") setVolume(st.volume);
            if (typeof st.is_muted === "boolean") setIsMuted(st.is_muted);
            if (typeof st.karaoke_mode === "boolean") setKaraokeMode(st.karaoke_mode);
            if (st.current_track) setCurrentTrack(st.current_track);
          },
        )
        .subscribe();
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

  // Elapsed runner
  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isPaused]);

  // Handlers
  const handleTogglePlay = async () => {
    if (!currentTrack && activeQueue.length > 0) {
      void handlePlayQueueItemNow(activeQueue[0]);
      return;
    }
    const next = !isPaused;
    setIsPaused(next);
    showToast(next ? "⏸️ TV Pausada" : "▶️ TV en Reproducción");
    try {
      await togglePausePlayback(slug);
    } catch {
      // Revert on failure
      setIsPaused(!next);
    }
  };

  const handleSkipNext = async () => {
    showToast("⏭️ Salteando a la siguiente canción...");
    try {
      await skipPlayback(slug);
      setElapsed(0);
      void loadState();
    } catch {
      // Ignore
    }
  };

  const handleRestart = async () => {
    if (currentTrack) {
      showToast(`⏮️ Reiniciando: ${currentTrack.title}`);
      setElapsed(0);
      try {
        await sendPlaybackCommand(slug, "play_now", { track: currentTrack });
      } catch {
        // Ignore
      }
    }
  };

  const handleVolume = async (newVol: number) => {
    setVolume(newVol);
    if (isMuted) setIsMuted(false);
    try {
      await setPlaybackVolume(slug, newVol);
    } catch {
      // Ignore
    }
  };

  const handleToggleMute = async () => {
    const next = !isMuted;
    setIsMuted(next);
    showToast(next ? "🔇 Audio TV Silenciado" : "🔊 Audio TV Activo");
    try {
      await toggleMutePlayback(slug);
    } catch {
      setIsMuted(!next);
    }
  };

  const handleToggleKaraoke = async () => {
    const next = !karaokeMode;
    setKaraokeMode(next);
    showToast(next ? "🎤 Modo Karaoke Activado" : "🎧 Modo Normal");
    try {
      await setKmRemote(slug, next);
    } catch {
      setKaraokeMode(!next);
    }
  };

  const duration = videoDuration ?? currentTrack?.durationSeconds ?? 210;
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (elapsed / duration) * 100)) : 0;

  const handleSeek = async (newSec: number) => {
    const clamped = Math.max(0, Math.min(duration, newSec));
    setElapsed(clamped);
    audioEngineRef.current?.seekTo(clamped);
    showToast(`⏩ Posición: ${formatDuration(clamped)}`);
    try {
      await seekPlayback(slug, clamped);
    } catch {
      // non-blocking
    }
  };

  const handleSeekDelta = async (deltaSec: number) => {
    await handleSeek(elapsed + deltaSec);
  };

  const handleScrubberClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    const targetSec = Math.floor(pct * duration);
    void handleSeek(targetSec);
  };

  return (
    <>
      {/* Toast Feedback */}
      {feedbackToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-[#0A0E17]/95 text-white font-mono text-xs font-bold px-5 py-2 rounded-full border border-indigo-500/50 shadow-2xl backdrop-blur-md animate-fade-in flex items-center gap-2">
          <span>{feedbackToast}</span>
        </div>
      )}

      {/* Sticky Bottom Control Bar */}
      <footer className={`fixed bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] md:bottom-0 left-0 ${
          isSidebarCollapsed ? "md:left-20" : "md:left-64"
        } right-0 z-40 bg-[#080b14] border-t border-[#1E2333] shadow-[0_-8px_30px_rgba(0,0,0,0.8)] px-3 sm:px-4 py-2 sm:py-2.5 flex flex-col gap-1 select-none transition-all duration-300`}>
        {/* Scrubber line */}
        <div className="w-full flex items-center gap-2.5 px-2">
          <span className="font-mono text-[10px] text-cyan-400 font-semibold w-9 text-right">
            {formatDuration(elapsed)}
          </span>
          <div
            onClick={handleScrubberClick}
            className="flex-1 h-2 hover:h-2.5 bg-[#181b25] rounded-full overflow-hidden relative border border-white/5 cursor-pointer group transition-all"
            title="Click para adelantar o retroceder el video en la TV"
          >
            <div
              className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-400 rounded-full transition-all duration-150 pointer-events-none"
              style={{ width: `${progressPercent}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 size-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
              style={{ left: `calc(${progressPercent}% - 6px)` }}
            />
          </div>
          <span className="font-mono text-[10px] text-slate-400 font-semibold w-9">
            {formatDuration(duration)}
          </span>
        </div>

        {/* Main Controls Row */}
                {/* ==================== MOBILE COMPACT DOCK (< md) ==================== */}
        <div className="md:hidden flex items-center justify-between gap-2 px-1 py-0.5">
          {/* Track Info: Clickable to expand full player drawer */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-2 min-w-0 flex-1 text-left p-0.5 rounded-lg hover:bg-white/5 active:scale-[0.98] transition-all"
            title="Tocá para ver y gestionar la cola de canciones"
          >
            <div className="relative size-9 rounded-lg overflow-hidden bg-[#131722] border border-[#283250] shrink-0 shadow-md flex items-center justify-center">
              {currentTrack?.thumbnailUrl ? (
                <Image
                  src={currentTrack.thumbnailUrl}
                  alt={currentTrack.title}
                  width={36}
                  height={36}
                  className="w-full h-full object-cover"
                  unoptimized
                />
              ) : (
                <Music2 className="size-4 text-indigo-400" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-white text-xs font-bold truncate leading-tight">
                {currentTrack?.title || "Sin música activa"}
              </p>
              <p className="text-slate-400 text-[10px] truncate leading-tight mt-0.5">
                {currentTrack?.artist || "Playlist Local"}
              </p>
            </div>
          </button>

          {/* Quick Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Queue Drawer Toggle Pill */}
            <button
              type="button"
              onClick={() => setDrawerOpen((prev) => !prev)}
              className="flex items-center gap-1 bg-gradient-to-r from-indigo-600/30 to-violet-600/30 hover:from-indigo-600/40 text-indigo-300 border border-indigo-500/40 px-2.5 py-1.5 rounded-xl font-mono text-[11px] font-bold active:scale-95 transition-all shrink-0 shadow-sm"
              title="Abrir cola y gestión de temas"
            >
              <ListMusic className="size-3.5 text-cyan-400" />
              <span>Cola ({activeQueue.length})</span>
              <ChevronUp className="size-3 text-indigo-300" />
            </button>

            {/* Search YouTube modal */}
            <button
              type="button"
              onClick={() => setManualModalOpen(true)}
              className="size-8 rounded-lg bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 flex items-center justify-center active:scale-95 transition-all"
              title="Buscar en YouTube y poner en TV"
            >
              <Search className="size-3.5 text-cyan-400" />
            </button>

            {/* Play / Pause */}
            <button
              type="button"
              onClick={() => void handleTogglePlay()}
              className="size-9 rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/30 active:scale-95 transition-all"
              title={isPaused ? "Reanudar música en TV" : "Pausar música en TV"}
            >
              {isPaused ? <Play className="size-4 fill-white ml-0.5" /> : <Pause className="size-4 fill-white" />}
            </button>

            {/* Skip */}
            <button
              type="button"
              onClick={() => void handleSkipNext()}
              className="size-8 rounded-lg bg-[#131722] border border-[#232b42] flex items-center justify-center text-slate-300 hover:text-white active:scale-90 transition-all"
              title="Saltear tema actual"
            >
              <SkipForward className="size-4" />
            </button>
          </div>
        </div>

        {/* ==================== DESKTOP CONTROLS ROW (>= md) ==================== */}
        <div className="hidden md:grid grid-cols-[1fr_auto_1fr] items-center gap-3 w-full px-4">
          {/* LEFT: Currently Playing Track Details + Cola Trigger + Poner Tema */}
          <div className="flex items-center gap-2.5 min-w-0 overflow-hidden justify-start">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="flex items-center gap-2.5 min-w-0 max-w-[200px] xl:max-w-[260px] text-left p-1 rounded-xl hover:bg-white/5 active:scale-[0.99] transition-all cursor-pointer group shrink-0"
              title="Click para abrir la cola de reproducción y gestionar temas"
            >
              <div className="relative size-10 rounded-lg overflow-hidden bg-[#131722] border border-[#283250] group-hover:border-indigo-500/50 shrink-0 shadow-md flex items-center justify-center transition-colors">
                {currentTrack?.thumbnailUrl ? (
                  <Image
                    src={currentTrack.thumbnailUrl}
                    alt={currentTrack.title}
                    width={40}
                    height={40}
                    className="w-full h-full object-cover"
                    unoptimized
                  />
                ) : (
                  <Music2 className="size-4 text-indigo-400" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-white text-xs font-bold truncate leading-tight group-hover:text-cyan-300 transition-colors">
                    {currentTrack?.title || "Sin música activa"}
                  </span>
                  {karaokeMode || currentTrack?.isKaraoke ? (
                    <span className="shrink-0 bg-pink-500/20 text-pink-300 border border-pink-500/30 font-mono text-[9px] font-bold px-1.5 py-0.2 rounded-full uppercase">
                      Karaoke
                    </span>
                  ) : null}
                </div>
                <p className="text-slate-400 text-[10px] truncate mt-0.5 group-hover:text-slate-300 transition-colors">
                  {currentTrack?.artist || "Billar & Bar Playlist"}
                </p>
              </div>
            </button>

            {/* Quick Button: Abrir Cola */}
            <button
              type="button"
              onClick={() => setDrawerOpen((prev) => !prev)}
              className="shrink-0 flex items-center gap-1.5 bg-gradient-to-r from-indigo-600/25 to-violet-600/25 hover:from-indigo-600/35 hover:to-violet-600/35 text-indigo-300 hover:text-white px-2.5 py-1.5 rounded-xl border border-indigo-500/40 font-mono text-[11px] font-bold transition-all active:scale-95 shadow-sm"
              title="Abrir la cola de reproducción y gestionar temas"
            >
              <ListMusic className="size-3.5 text-cyan-400" />
              <span>Cola ({activeQueue.length})</span>
              <ChevronUp className="size-3 text-indigo-400" />
            </button>

            {/* Quick Button: Elegir Canción (YouTube) */}
            <button
              type="button"
              onClick={() => setManualModalOpen(true)}
              className="shrink-0 size-8 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 hover:text-white border border-indigo-500/30 flex items-center justify-center transition-all active:scale-95"
              title="Buscar en YouTube y poner tema en TV"
            >
              <Search className="size-3.5 text-cyan-400" />
            </button>
          </div>

          {/* CENTER: Main Playback Transport Buttons */}
          <div className="flex items-center justify-center gap-2 shrink-0 justify-self-center">
            {/* Prev / Restart */}
            <button
              type="button"
              onClick={() => void handleRestart()}
              className="size-8 rounded-lg bg-[#131722] hover:bg-[#1c2234] border border-[#232b42] flex items-center justify-center text-slate-300 hover:text-white transition-all active:scale-90"
              title="Reiniciar tema actual"
            >
              <RotateCcw className="size-4" />
            </button>

            {/* Seek -10s */}
            <button
              type="button"
              onClick={() => void handleSeekDelta(-10)}
              className="h-8 px-2 rounded-lg bg-[#131722] hover:bg-[#1c2234] border border-[#232b42] flex items-center justify-center text-slate-300 hover:text-cyan-400 transition-all active:scale-90 font-mono text-[11px] font-bold"
              title="Retroceder 10 segundos"
            >
              -10s
            </button>

            {/* Play / Pause Primary Button */}
            <button
              type="button"
              onClick={() => void handleTogglePlay()}
              className="size-10 rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white flex items-center justify-center shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
              title={isPaused ? "Reanudar música (Espacio)" : "Pausar música (Espacio)"}
            >
              {isPaused ? <Play className="size-5 fill-white ml-0.5" /> : <Pause className="size-5 fill-white" />}
            </button>

            {/* Seek +10s */}
            <button
              type="button"
              onClick={() => void handleSeekDelta(10)}
              className="h-8 px-2 rounded-lg bg-[#131722] hover:bg-[#1c2234] border border-[#232b42] flex items-center justify-center text-slate-300 hover:text-cyan-400 transition-all active:scale-90 font-mono text-[11px] font-bold"
              title="Adelantar 10 segundos"
            >
              +10s
            </button>

            {/* Skip Next */}
            <button
              type="button"
              onClick={() => void handleSkipNext()}
              className="size-8 rounded-lg bg-[#131722] hover:bg-[#1c2234] border border-[#232b42] flex items-center justify-center text-slate-300 hover:text-white transition-all active:scale-90"
              title="Saltear al siguiente tema (S)"
            >
              <SkipForward className="size-4" />
            </button>
          </div>

          {/* RIGHT: Volume & Karaoke Toggle (Clean audio controls, no TV clutter) */}
          <div className="flex items-center justify-end gap-3 justify-self-end">
            {/* Karaoke Mode Toggle Button */}
            <button
              type="button"
              onClick={() => void handleToggleKaraoke()}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border font-mono text-[11px] font-bold transition-all ${
                karaokeMode
                  ? "bg-gradient-to-r from-pink-500/25 to-purple-500/25 text-pink-300 border-pink-500/50 shadow-[0_0_12px_rgba(236,72,153,0.3)] animate-pulse"
                  : "bg-[#131722] text-slate-400 border-[#232b42] hover:text-white"
              }`}
              title="Alternar Modo Karaoke en el salón"
            >
              <Mic className="size-3.5 text-pink-400" />
              <span>{karaokeMode ? "Karaoke ON" : "Karaoke"}</span>
            </button>

            {/* Cabina Audio Output Badge & Autoplay Unlocker */}
            {isAudioBlocked ? (
              <button
                type="button"
                onClick={() => audioEngineRef.current?.unlockAudio()}
                className="flex items-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 px-2.5 py-1.5 rounded-lg font-mono text-[11px] font-bold active:scale-95 transition-all shadow-sm shrink-0"
                title="Clic para habilitar sonido en la cabina del local"
              >
                <VolumeX className="size-3.5 text-amber-400 animate-pulse" />
                <span>Habilitar Sonido</span>
              </button>
            ) : (
              <div
                className="hidden xl:flex items-center gap-1.5 bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 px-2.5 py-1.5 rounded-lg font-mono text-[11px] font-bold shrink-0"
                title="Sonido principal del salón activo desde esta cabina (Solo sonido, sin video)"
              >
                <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Audio Cabina</span>
              </div>
            )}

            {/* Volume Control */}
            <div className="flex items-center gap-2 bg-[#131722] px-2.5 py-1.5 rounded-lg border border-[#232b42]">
              <button
                type="button"
                onClick={() => void handleToggleMute()}
                className="text-slate-400 hover:text-white transition-colors"
                title="Silenciar / Activar sonido (M)"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="size-4 text-rose-400" />
                ) : (
                  <Volume2 className="size-4 text-cyan-400" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="100"
                value={isMuted ? 0 : volume}
                onChange={(e) => void handleVolume(Number(e.target.value))}
                className="w-18 accent-indigo-500 h-1.5 bg-[#0a0e17] rounded-lg cursor-pointer"
                title={`Volumen: ${volume}%`}
              />
              <span className="font-mono text-[11px] text-slate-300 w-8 text-right">
                {isMuted ? "0%" : `${volume}%`}
              </span>
            </div>
          </div>
        </div>
      </footer>

      {/* Off-screen Admin Cabina Audio Playback Engine (Solo sonido, sin video) */}
      <PanelAudioEngine
        ref={audioEngineRef}
        slug={slug}
        currentTrack={currentTrack}
        isPaused={isPaused}
        volume={volume}
        isMuted={isMuted}
        onTrackEnded={() => void handleSkipNext()}
        onProgress={(curr, dur) => {
          setElapsed(curr);
          if (dur) setVideoDuration(dur);
        }}
        onAudioBlockedChange={(blocked) => setIsAudioBlocked(blocked)}
      />

      {/* Manual Track Selection Modal */}
      <ManualPlaybackModal
        isOpen={manualModalOpen}
        onClose={() => setManualModalOpen(false)}
        slug={slug}
        defaultKaraoke={karaokeMode}
        onActionComplete={() => void loadState()}
      />

      {/* ==================== EXPANDABLE QUEUE & REMOTE PLAYER DRAWER ==================== */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end md:justify-center md:items-end animate-in fade-in duration-200">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
            onClick={() => setDrawerOpen(false)}
          />

          {/* Drawer Body Sheet */}
          <div className="relative w-full md:max-w-xl md:h-[92vh] max-h-[85vh] bg-[#0c101c] border-t md:border-l md:border-t-0 border-[#1E2538] rounded-t-3xl md:rounded-l-3xl md:rounded-tr-none shadow-[0_-15px_40px_rgba(0,0,0,0.9)] flex flex-col z-10 overflow-hidden pb-[env(safe-area-inset-bottom,0px)]">
            {/* Top Drag Handle (Mobile) */}
            <div className="pt-3 pb-1 flex justify-center md:hidden cursor-pointer" onClick={() => setDrawerOpen(false)}>
              <div className="w-12 h-1.5 bg-slate-700/60 rounded-full" />
            </div>

            {/* Drawer Header */}
            <div className="px-5 py-3 border-b border-[#1E2538] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="size-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/40">
                  <ListMusic className="size-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight">
                    Control Maestro & Cola de Salón
                  </h3>
                  <p className="font-mono text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                    <span className="size-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    <span>TV Conectada</span>
                    <span className="text-slate-600">·</span>
                    <span>{activeQueue.length} temas en cola</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setManualModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-mono text-xs font-bold transition-all shadow-md flex items-center gap-1.5 active:scale-95"
                >
                  <Plus className="size-3.5" />
                  <span>Poner Tema</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="size-8 rounded-lg bg-[#181F33] text-slate-400 hover:text-white flex items-center justify-center transition-colors"
                  aria-label="Cerrar panel de cola"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* Now Playing Banner in Drawer */}
            <div className="p-4 bg-[#101524] border-b border-[#1E2538]">
              {isAudioBlocked && (
                <button
                  type="button"
                  onClick={() => audioEngineRef.current?.unlockAudio()}
                  className="w-full mb-3 flex items-center justify-center gap-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 py-2 px-3 rounded-xl font-mono text-xs font-bold active:scale-95 transition-all shadow-md"
                >
                  <VolumeX className="size-4 text-amber-400 animate-pulse" />
                  <span>Toca aquí para habilitar el sonido en la cabina</span>
                </button>
              )}
              <div className="flex items-center gap-3">
                <div className="size-12 rounded-xl bg-[#090D16] border border-[#232B42] shrink-0 overflow-hidden flex items-center justify-center relative shadow-md">
                  {currentTrack?.thumbnailUrl ? (
                    <Image
                      src={currentTrack.thumbnailUrl}
                      alt={currentTrack.title}
                      width={48}
                      height={48}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <Music2 className="size-6 text-indigo-400" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.2 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 font-bold">
                      Sonando Ahora
                    </span>
                    {karaokeMode && (
                      <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.2 rounded bg-pink-500/20 text-pink-300 font-bold">
                        Karaoke
                      </span>
                    )}
                  </div>
                  <h4 className="text-white text-sm font-bold truncate mt-0.5">
                    {currentTrack?.title || "Sin música activa"}
                  </h4>
                  <p className="text-slate-400 text-xs truncate">
                    {currentTrack?.artist || "Playlist del Bar"}
                  </p>
                </div>

                {/* Quick Play/Pause & Skip */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleTogglePlay()}
                    className="size-10 rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white flex items-center justify-center shadow-lg active:scale-95"
                    title={isPaused ? "Reanudar" : "Pausar"}
                  >
                    {isPaused ? <Play className="size-4 fill-white ml-0.5" /> : <Pause className="size-4 fill-white" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSkipNext()}
                    className="size-9 rounded-xl bg-[#181F33] border border-[#232B42] flex items-center justify-center text-slate-300 hover:text-white active:scale-90"
                    title="Saltear al siguiente"
                  >
                    <SkipForward className="size-4" />
                  </button>
                </div>
              </div>

              {/* Scrubber inside drawer */}
              <div className="mt-3 pt-2 border-t border-[#1C2336] flex items-center gap-2.5">
                <span className="font-mono text-[10px] text-cyan-400 font-semibold w-8 text-right">
                  {formatDuration(elapsed)}
                </span>
                <div
                  onClick={handleScrubberClick}
                  className="flex-1 h-2 bg-[#181b25] rounded-full overflow-hidden relative border border-white/5 cursor-pointer"
                >
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-400 rounded-full"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <span className="font-mono text-[10px] text-slate-400 font-semibold w-8">
                  {formatDuration(duration)}
                </span>
              </div>
            </div>

            {/* Drawer Tabs: Cola Activa vs Candidatos */}
            <div className="px-5 pt-3 pb-2 flex gap-2 border-b border-[#1E2538] bg-[#0c101c]">
              <button
                type="button"
                onClick={() => setDrawerTab("queue")}
                className={`flex-1 py-2 px-3 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  drawerTab === "queue"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "bg-[#181F33] text-slate-400 hover:text-white border border-[#232B42]"
                }`}
              >
                <ListMusic className="size-3.5" />
                <span>Cola Activa ({activeQueue.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setDrawerTab("candidates")}
                className={`flex-1 py-2 px-3 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  drawerTab === "candidates"
                    ? "bg-amber-600 text-white shadow-md shadow-amber-600/30"
                    : "bg-[#181F33] text-slate-400 hover:text-white border border-[#232B42]"
                }`}
              >
                <Sparkles className="size-3.5 text-amber-400" />
                <span>Candidatas ({candidateProposals.length})</span>
              </button>
            </div>

            {/* Drawer Queue Scrollable List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {drawerTab === "queue" && (
                <>
                  {activeQueue.length === 0 ? (
                    <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-[#232B42] bg-[#101524]/60">
                      <Music2 className="size-8 mx-auto text-slate-600 mb-2" />
                      <p className="text-sm font-bold text-white">No hay canciones en la cola de la TV</p>
                      <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                        Buscá un tema en YouTube o aprobá propuestas candidatas para llenar la cola.
                      </p>
                      <button
                        type="button"
                        onClick={() => setManualModalOpen(true)}
                        className="mt-3.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold shadow-md"
                      >
                        Buscar y Poner Canción
                      </button>
                    </div>
                  ) : (
                    activeQueue.map((item, index) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-xl bg-[#121626] border border-[#232B42] hover:border-[#2f3b5c] transition-all flex items-center justify-between gap-3 shadow-sm"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="size-7 rounded-lg bg-[#181F33] border border-[#283250] text-indigo-300 font-mono text-xs font-bold flex items-center justify-center shrink-0">
                            #{index + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h5 className="text-xs font-bold text-white truncate">{item.title}</h5>
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">
                              {item.artist} {item.durationSeconds ? `· ${formatDuration(item.durationSeconds)}` : ""}
                            </p>
                            <span className="inline-flex items-center gap-1 font-mono text-[10px] text-indigo-400 font-semibold mt-1">
                              <Flame className="size-3 text-amber-400" />
                              {item.voteCount >= 9999 || item.voteCount === 0 ? "⭐ Selección Bar" : `${item.voteCount} votos`}
                            </span>
                          </div>
                        </div>

                        {/* Actions for this song */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Play Now */}
                          <button
                            type="button"
                            onClick={() => void handlePlayQueueItemNow(item)}
                            disabled={pendingActionId === item.id}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 font-mono text-[11px] font-bold flex items-center gap-1 active:scale-95 transition-all"
                            title="Reproducir inmediatamente en TV"
                          >
                            <PlayCircle className="size-3.5" />
                            <span className="hidden sm:inline">Poner Ya</span>
                          </button>

                          {/* Boost / +1 Voto */}
                          <button
                            type="button"
                            onClick={() => void handleBoostQueueItem(item)}
                            disabled={pendingActionId === item.id}
                            className="size-8 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 flex items-center justify-center active:scale-95 transition-all"
                            title="Subir de puesto (+1 voto)"
                          >
                            <ArrowUp className="size-3.5" />
                          </button>

                          {/* Veto */}
                          <button
                            type="button"
                            onClick={() => void handleVetoQueueItem(item)}
                            disabled={pendingActionId === item.id}
                            className="size-8 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 flex items-center justify-center active:scale-95 transition-all"
                            title="Vetar / Quitar de la cola"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}

              {drawerTab === "candidates" && (
                <>
                  {candidateProposals.length === 0 ? (
                    <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-[#232B42] bg-[#101524]/60">
                      <Sparkles className="size-8 mx-auto text-amber-500 mb-2" />
                      <p className="text-sm font-bold text-white">No hay propuestas esperando votos</p>
                      <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                        Cuando los clientes propongan canciones desde sus mesas, aparecerán aquí hasta juntar 5 votos.
                      </p>
                    </div>
                  ) : (
                    candidateProposals.map((item, index) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-xl bg-[#121626] border border-[#232B42] hover:border-[#2f3b5c] transition-all flex items-center justify-between gap-3 shadow-sm"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="size-7 rounded-lg bg-[#181F33] border border-[#283250] text-amber-400 font-mono text-xs font-bold flex items-center justify-center shrink-0">
                            #{index + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h5 className="text-xs font-bold text-white truncate">{item.title}</h5>
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">{item.artist}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="font-mono text-[10px] text-amber-300 font-bold">
                                {item.voteCount}/{MIN_VOTES_FOR_QUEUE} votos
                              </span>
                              <div className="w-16 h-1.5 rounded-full bg-[#181F33] overflow-hidden">
                                <div
                                  className="h-full bg-amber-400 rounded-full"
                                  style={{ width: `${Math.min(100, (item.voteCount / MIN_VOTES_FOR_QUEUE) * 100)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Actions for candidate */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Play Now directly */}
                          <button
                            type="button"
                            onClick={() => void handlePlayQueueItemNow(item)}
                            disabled={pendingActionId === item.id}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 font-mono text-[11px] font-bold flex items-center gap-1 active:scale-95"
                            title="Aprobar y reproducir directamente en TV"
                          >
                            <PlayCircle className="size-3.5" />
                            <span className="hidden sm:inline">Poner Ya</span>
                          </button>

                          {/* Add vote */}
                          <button
                            type="button"
                            onClick={() => void handleBoostQueueItem(item)}
                            disabled={pendingActionId === item.id}
                            className="size-8 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 flex items-center justify-center active:scale-95"
                            title="Sumar voto (+1)"
                          >
                            <ArrowUp className="size-3.5" />
                          </button>

                          {/* Veto */}
                          <button
                            type="button"
                            onClick={() => void handleVetoQueueItem(item)}
                            disabled={pendingActionId === item.id}
                            className="size-8 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 flex items-center justify-center active:scale-95"
                            title="Rechazar propuesta"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
