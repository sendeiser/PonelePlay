"use client";

import Image from "next/image";
import {
  Maximize2,
  Minimize2,
  Monitor,
  Music2,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { PlayerTrack } from "@/lib/api/player";

interface PlayerFooterBarProps {
  nowPlaying: PlayerTrack | null;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSkipNext: () => void;
  onRestartOrPrev: () => void;
  volume: number;
  isMuted: boolean;
  onVolumeChange: (vol: number) => void;
  onToggleMute: () => void;
  audioUnlocked: boolean;
  onUnlockAudio: () => void;
  elapsed: number;
  duration: number;
  videoMode: boolean;
  onToggleVideoMode: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  karaokeMode: boolean;
  isPaired: boolean;
  onOpenPairModal: () => void;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function PlayerFooterBar({
  nowPlaying,
  isPlaying,
  onTogglePlay,
  onSkipNext,
  onRestartOrPrev,
  volume,
  isMuted,
  onVolumeChange,
  onToggleMute,
  audioUnlocked,
  onUnlockAudio,
  elapsed,
  duration,
  videoMode,
  onToggleVideoMode,
  isFullscreen,
  onToggleFullscreen,
  karaokeMode,
  isPaired,
  onOpenPairModal,
}: PlayerFooterBarProps) {
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (elapsed / duration) * 100)) : 0;

  return (
    <footer className="w-full bg-[#0a0e17]/95 backdrop-blur-2xl border-t border-[#232b42] px-6 py-2.5 z-40 shadow-2xl flex flex-col gap-1.5 select-none">
      {/* Top Scrubber / Timeline Bar */}
      <div className="w-full flex items-center gap-3">
        <span className="font-mono text-[11px] text-cyan-400 font-semibold w-10 text-right">
          {formatTime(elapsed)}
        </span>

        <div className="flex-1 h-2 bg-[#181b25] rounded-full overflow-hidden relative cursor-pointer group border border-white/5">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-400 rounded-full relative transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 size-3 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>

        <span className="font-mono text-[11px] text-slate-400 font-semibold w-10">
          {formatTime(duration)}
        </span>
      </div>

      {/* Main Bottom Control Row */}
      <div className="w-full flex items-center justify-between gap-4">
        {/* Left: Current Track Info */}
        <div className="flex items-center gap-3 min-w-0 max-w-[30%]">
          <div className="relative size-12 rounded-xl overflow-hidden bg-[#181b25] border border-[#283250] shrink-0 shadow-md">
            {nowPlaying?.thumbnailUrl ? (
              <Image
                src={nowPlaying.thumbnailUrl}
                alt={nowPlaying.title}
                fill
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-indigo-400">
                <Music2 className="size-6" />
              </div>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h4 className="text-xs sm:text-sm font-bold text-white truncate max-w-full leading-tight">
                {nowPlaying?.title || "Esperando tema..."}
              </h4>
              {(karaokeMode || nowPlaying?.isKaraoke) && (
                <span className="text-[9px] bg-pink-500/20 text-pink-300 border border-pink-500/30 px-1.5 py-0.2 rounded font-mono font-bold uppercase shrink-0">
                  Karaoke
                </span>
              )}
            </div>
            <p className="font-mono text-[11px] text-slate-400 truncate mt-0.5">
              {nowPlaying?.artist || "Playlist en vivo"}
            </p>
          </div>
        </div>

        {/* Center: Play / Pause / Skip / Prev Buttons */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Previous / Restart */}
          <button
            type="button"
            onClick={onRestartOrPrev}
            className="p-2 rounded-xl bg-[#181b25] hover:bg-[#222838] text-slate-300 hover:text-white transition-all active:scale-95 border border-[#232b42]"
            title="Reiniciar canción (Inicio)"
          >
            <RotateCcw className="size-4" />
          </button>

          {/* Big Play / Pause Button */}
          <button
            type="button"
            onClick={onTogglePlay}
            className="size-11 rounded-2xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 text-white flex items-center justify-center shadow-lg shadow-indigo-500/30 transition-all active:scale-90"
            title={isPlaying ? "Pausar (Espacio)" : "Reproducir (Espacio)"}
          >
            {isPlaying ? (
              <Pause className="size-5 fill-current" />
            ) : (
              <Play className="size-5 fill-current ml-0.5" />
            )}
          </button>

          {/* Next / Skip */}
          <button
            type="button"
            onClick={onSkipNext}
            className="p-2 rounded-xl bg-[#181b25] hover:bg-[#222838] text-slate-300 hover:text-white transition-all active:scale-95 border border-[#232b42]"
            title="Saltar tema siguiente (Tecla S)"
          >
            <SkipForward className="size-4" />
          </button>
        </div>

        {/* Right: Volume, Sound Unlock, View & Mode Toggles */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Unmute Autoplay Button (Pulsing when audio is locked) */}
          {!audioUnlocked && (
            <button
              type="button"
              onClick={onUnlockAudio}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 text-black font-mono text-xs font-bold shadow-lg shadow-cyan-500/25 flex items-center gap-1.5 animate-pulse hover:opacity-95 transition-all"
            >
              <Volume2 className="size-4" />
              <span>Activar Sonido TV</span>
            </button>
          )}

          {/* Volume Control */}
          <div className="flex items-center gap-2 bg-[#181b25] px-3 py-1.5 rounded-xl border border-[#232b42]">
            <button
              type="button"
              onClick={onToggleMute}
              className="text-slate-400 hover:text-white transition-colors"
              title="Silenciar / Desmutear (Tecla M)"
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
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              className="w-16 sm:w-24 accent-indigo-500 h-1.5 bg-[#0a0e17] rounded-lg cursor-pointer"
            />
            <span className="font-mono text-[11px] text-slate-300 w-7 text-right">
              {isMuted ? "0%" : `${volume}%`}
            </span>
          </div>

          {/* Video / Vinyl Switcher */}
          <button
            type="button"
            onClick={onToggleVideoMode}
            className={`p-2 rounded-xl border transition-all ${
              videoMode
                ? "bg-indigo-600/30 text-indigo-300 border-indigo-500/50"
                : "bg-[#181b25] text-slate-400 border-[#232b42] hover:text-white"
            }`}
            title="Alternar Modo Video / Vinilo (Tecla V)"
          >
            <span className="material-symbols-outlined text-[19px]">
              {videoMode ? "smart_display" : "album"}
            </span>
          </button>

          {/* Vincular TV Button */}
          <button
            type="button"
            onClick={onOpenPairModal}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-mono text-xs font-bold transition-all ${
              isPaired
                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                : "bg-[#181b25] hover:bg-[#202534] text-slate-300 border-[#232b42]"
            }`}
            title="Vincular con el panel del bar"
          >
            <Monitor className="size-3.5" />
            <span>{isPaired ? "TV Conectada" : "Vincular"}</span>
          </button>

          {/* Fullscreen Button */}
          <button
            type="button"
            onClick={onToggleFullscreen}
            className="p-2 rounded-xl bg-[#181b25] hover:bg-[#222838] text-slate-400 hover:text-white border border-[#232b42] transition-colors"
            title="Pantalla Completa (Tecla F)"
          >
            {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
        </div>
      </div>
    </footer>
  );
}
