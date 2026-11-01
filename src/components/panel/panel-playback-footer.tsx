"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ExternalLink,
  Maximize2,
  Mic,
  Music2,
  Pause,
  Play,
  RotateCcw,
  Search,
  SkipForward,
  Tv,
  Volume2,
  VolumeX,
} from "lucide-react";
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
import { TvDevicesManagerModal } from "./tv-devices-manager-modal";

interface PanelPlaybackFooterProps {
  slug: string;
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function PanelPlaybackFooter({ slug }: PanelPlaybackFooterProps) {
  const [currentTrack, setCurrentTrack] = useState<PlayerTrack | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [volume, setVolume] = useState(85);
  const [isMuted, setIsMuted] = useState(false);
  const [karaokeMode, setKaraokeMode] = useState(false);
  const [isTvFullscreen, setIsTvFullscreen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);

  // Modals
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [tvManagerOpen, setTvManagerOpen] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

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
            else if (cmd === "toggle_fullscreen") setIsTvFullscreen((prev) => !prev);
            else if (cmd === "set_fullscreen") setIsTvFullscreen(Boolean(p.isFullscreen));
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
            const { currentTime, duration: d, isPaused: p, isVideoFullscreen: fs } = msg.payload;
            if (typeof currentTime === "number" && !isNaN(currentTime)) {
              setElapsed(Math.floor(currentTime));
            }
            if (typeof d === "number" && !isNaN(d) && d > 0) {
              setVideoDuration(Math.floor(d));
            }
            if (typeof p === "boolean") {
              setIsPaused(p);
            }
            if (typeof fs === "boolean") {
              setIsTvFullscreen(fs);
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

  const handleToggleTvFullscreen = async () => {
    const next = !isTvFullscreen;
    setIsTvFullscreen(next);
    showToast(next ? "🖥️ Pantalla Completa TV Activada" : "🖥️ Pantalla Normal TV Restaurada");
    try {
      const { toggleFullscreenPlayback } = await import("@/lib/api/master-control");
      await toggleFullscreenPlayback(slug);
    } catch {
      setIsTvFullscreen(!next);
    }
  };

  const duration = videoDuration ?? currentTrack?.durationSeconds ?? 210;
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (elapsed / duration) * 100)) : 0;

  const handleSeek = async (newSec: number) => {
    const clamped = Math.max(0, Math.min(duration, newSec));
    setElapsed(clamped);
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
      <footer className="fixed bottom-0 left-0 right-0 z-40 bg-[#07090e]/95 backdrop-blur-2xl border-t border-[#1E2333] shadow-[0_-8px_30px_rgba(0,0,0,0.8)] px-4 py-2.5 flex flex-col gap-1 select-none">
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
        <div className="w-full flex items-center justify-between gap-4 px-2">
          {/* LEFT: Currently Playing Track Details & Quick Manual Track Picker */}
          <div className="flex items-center gap-3 min-w-0 max-w-[32%]">
            <div className="relative size-11 rounded-lg overflow-hidden bg-[#131722] border border-[#283250] shrink-0 shadow-md flex items-center justify-center">
              {currentTrack?.thumbnailUrl ? (
                <Image
                  src={currentTrack.thumbnailUrl}
                  alt={currentTrack.title}
                  width={44}
                  height={44}
                  className="w-full h-full object-cover"
                  unoptimized
                />
              ) : (
                <Music2 className="size-5 text-indigo-400" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-white text-xs font-bold truncate leading-tight">
                  {currentTrack?.title || "Sin música activa"}
                </span>
                {karaokeMode || currentTrack?.isKaraoke ? (
                  <span className="shrink-0 bg-pink-500/20 text-pink-300 border border-pink-500/30 font-mono text-[9px] font-bold px-1.5 py-0.2 rounded-full uppercase">
                    Karaoke
                  </span>
                ) : null}
              </div>
              <p className="text-slate-400 text-[11px] truncate mt-0.5">
                {currentTrack?.artist || "Billar & Bar Playlist"}
              </p>
            </div>

            {/* Quick Button: Elegir Canción (YouTube) */}
            <button
              type="button"
              onClick={() => setManualModalOpen(true)}
              className="shrink-0 flex items-center gap-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 hover:text-white px-2.5 py-1 rounded-lg border border-indigo-500/30 font-mono text-[11px] font-semibold transition-all active:scale-95"
              title="Buscar en YouTube y reproducir en TV"
            >
              <Search className="size-3.5 text-cyan-400" />
              <span className="hidden xl:inline">Poner Canción</span>
            </button>
          </div>

          {/* CENTER: Main Playback Transport Buttons */}
          <div className="flex items-center gap-2">
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
              title="Retroceder 10 segundos en la TV"
            >
              -10s
            </button>

            {/* Play / Pause Primary Button */}
            <button
              type="button"
              onClick={() => void handleTogglePlay()}
              className="size-10 rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white flex items-center justify-center shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
              title={isPaused ? "Reanudar música en TV (Espacio)" : "Pausar música en TV (Espacio)"}
            >
              {isPaused ? <Play className="size-5 fill-white ml-0.5" /> : <Pause className="size-5 fill-white" />}
            </button>

            {/* Seek +10s */}
            <button
              type="button"
              onClick={() => void handleSeekDelta(10)}
              className="h-8 px-2 rounded-lg bg-[#131722] hover:bg-[#1c2234] border border-[#232b42] flex items-center justify-center text-slate-300 hover:text-cyan-400 transition-all active:scale-90 font-mono text-[11px] font-bold"
              title="Adelantar 10 segundos en la TV"
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

          {/* RIGHT: Volume, Karaoke Toggle & TV Device Management */}
          <div className="flex items-center gap-3">
            {/* Karaoke Mode Toggle Button */}
            <button
              type="button"
              onClick={() => void handleToggleKaraoke()}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-[11px] font-bold transition-all ${
                karaokeMode
                  ? "bg-gradient-to-r from-pink-500/25 to-purple-500/25 text-pink-300 border-pink-500/50 shadow-[0_0_12px_rgba(236,72,153,0.3)] animate-pulse"
                  : "bg-[#131722] text-slate-400 border-[#232b42] hover:text-white"
              }`}
              title="Alternar Modo Karaoke en el salón"
            >
              <Mic className="size-3.5 text-pink-400" />
              <span>{karaokeMode ? "Karaoke ON" : "Karaoke"}</span>
            </button>

            {/* Volume Control */}
            <div className="flex items-center gap-2 bg-[#131722] px-2.5 py-1 rounded-lg border border-[#232b42]">
              <button
                type="button"
                onClick={() => void handleToggleMute()}
                className="text-slate-400 hover:text-white transition-colors"
                title="Silenciar / Activar sonido TV (M)"
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
                className="w-16 accent-indigo-500 h-1.5 bg-[#0a0e17] rounded-lg cursor-pointer"
                title={`Volumen TV: ${volume}%`}
              />
              <span className="font-mono text-[11px] text-slate-300 w-7 text-right">
                {isMuted ? "0%" : `${volume}%`}
              </span>
            </div>

            {/* TV Fullscreen Remote Toggle Button */}
            <button
              type="button"
              onClick={() => void handleToggleTvFullscreen()}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-[11px] font-bold transition-all active:scale-95 ${
                isTvFullscreen
                  ? "bg-gradient-to-r from-cyan-500/25 to-indigo-500/25 text-cyan-300 border-cyan-500/50 shadow-[0_0_12px_rgba(6,182,212,0.35)] animate-pulse"
                  : "bg-[#131722] hover:bg-[#1a2030] text-slate-300 hover:text-cyan-400 border-[#232b42]"
              }`}
              title={isTvFullscreen ? "Desactivar pantalla completa en la TV" : "Activar pantalla completa en la TV del salón"}
            >
              <Maximize2 className="size-3.5 text-cyan-400" />
              <span>{isTvFullscreen ? "TV Full ON" : "TV Full"}</span>
            </button>

            {/* TV Devices Manager Modal Trigger */}
            <button
              type="button"
              onClick={() => setTvManagerOpen(true)}
              className="flex items-center gap-1.5 bg-[#131722] hover:bg-[#1a2030] text-slate-300 hover:text-white px-2.5 py-1 rounded-lg border border-[#232b42] font-mono text-[11px] transition-colors"
              title="Administrar pantallas TV vinculadas"
            >
              <Tv className="size-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Pantallas TV</span>
            </button>

            {/* Open TV Screen in New Tab */}
            <Link
              href={`/player/${slug}`}
              target="_blank"
              className="size-8 rounded-lg bg-[#131722] hover:bg-[#1c2234] border border-[#232b42] flex items-center justify-center text-slate-400 hover:text-white transition-colors"
              title="Abrir pantalla TV en pestaña nueva"
            >
              <ExternalLink className="size-3.5" />
            </Link>
          </div>
        </div>
      </footer>

      {/* Manual Track Selection Modal */}
      <ManualPlaybackModal
        isOpen={manualModalOpen}
        onClose={() => setManualModalOpen(false)}
        slug={slug}
        defaultKaraoke={karaokeMode}
        onActionComplete={() => void loadState()}
      />

      {/* TV Devices Manager Modal */}
      <TvDevicesManagerModal
        isOpen={tvManagerOpen}
        onClose={() => setTvManagerOpen(false)}
        slug={slug}
      />
    </>
  );
}
