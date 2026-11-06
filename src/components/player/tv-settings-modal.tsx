"use client";

import { useEffect, useRef, useState } from "react";
import {
  Monitor,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  RefreshCw,
  LogOut,
  X,
  HelpCircle,
} from "lucide-react";

interface TvSettingsModalProps {
  isOpen: boolean;
  currentSlug: string;
  venueName: string;
  screenMode: "VIDEO" | "PLAYLIST" | "CLEAN";
  isMuted: boolean;
  isFullscreen: boolean;
  versionName?: string;
  onToggleMode: () => void;
  onToggleFullscreen: () => void;
  onUnpair: () => void;
  onReload: () => void;
  onDismiss: () => void;
}

export function TvSettingsModal({
  isOpen,
  currentSlug,
  venueName,
  screenMode,
  isMuted,
  isFullscreen,
  versionName = "2.6.0",
  onToggleMode,
  onToggleFullscreen,
  onUnpair,
  onReload,
  onDismiss,
}: TvSettingsModalProps) {
  const [showHotkeys, setShowHotkeys] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      containerRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[999999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
      onClick={onDismiss}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-[#0F1424] border-2 border-[#3B4970] rounded-2xl p-6 sm:p-7 shadow-2xl space-y-4 outline-none text-[#dfe2ef]"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#232b42]">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300">
              <Monitor className="size-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white tracking-tight font-mono">
                ⚙️ AJUSTES DE PANTALLA TV
              </h2>
              <p className="text-[11px] font-mono text-slate-400">Modo Kiosco PC · Salón {venueName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] font-bold text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30">
              v{versionName}
            </span>
            <button
              type="button"
              onClick={onDismiss}
              className="size-7 rounded-lg bg-[#141824] hover:bg-[#20273c] text-slate-400 hover:text-white flex items-center justify-center transition-colors border border-[#2a344d]"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Mode Switcher Button */}
        <button
          type="button"
          onClick={onToggleMode}
          className="w-full p-3.5 rounded-xl bg-gradient-to-r from-indigo-950 via-[#182038] to-[#121c32] hover:brightness-110 border-2 border-indigo-500/50 hover:border-cyan-400 text-left transition-all group shadow-md"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl">
                {screenMode === "VIDEO" ? "🎬" : screenMode === "PLAYLIST" ? "📋" : "✨"}
              </span>
              <div>
                <span className="block text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider">
                  Modo de Pantalla (Presioná para cambiar)
                </span>
                <span className="text-sm font-extrabold text-white">
                  {screenMode === "VIDEO"
                    ? "🎬 VIDEO COMPLETO (Video Salón + Cola)"
                    : screenMode === "PLAYLIST"
                      ? "📋 SOLO PLAYLIST & VOTOS (Máxima Participación)"
                      : "✨ VIDEO LIMPIO (Pantalla Completa Pura)"}
                </span>
              </div>
            </div>
            <span className="font-mono text-xs px-2 py-1 rounded bg-black/40 text-slate-300 border border-white/10 group-hover:border-cyan-400">
              (Tecla V)
            </span>
          </div>
        </button>

        {/* TV Audio Routing (Read-only — controlled from Cabina) */}
        <div
          className={`w-full p-3.5 rounded-xl border-2 text-left shadow-md ${
            isMuted
              ? "bg-[#25131b] border-rose-500/40"
              : "bg-[#0f241d] border-emerald-500/40"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl">{isMuted ? "🔇" : "🔊"}</span>
              <div>
                <span className="block text-xs font-mono font-bold text-slate-300 uppercase tracking-wider">
                  Audio de la TV
                </span>
                <span className={`text-sm font-extrabold ${isMuted ? "text-rose-300" : "text-emerald-300"}`}>
                  {isMuted
                    ? "🔇 SILENCIADO (Audio solo en Cabina)"
                    : "🔊 ACTIVO (Audio en este TV / Parlante)"}
                </span>
                <span className="block text-[10px] font-mono text-slate-400 mt-0.5">
                  Controlado exclusivamente desde el Panel Admin / Cabina
                </span>
              </div>
            </div>
            <span className="font-mono text-[10px] px-2 py-1 rounded bg-black/40 text-slate-400 border border-white/10 whitespace-nowrap">
              Solo Cabina
            </span>
          </div>
        </div>

        {/* Linked Venue Info Box */}
        <div className="bg-[#141A2E] border border-[#263252] rounded-xl p-3.5 flex items-center justify-between">
          <div>
            <span className="block text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">
              CUENTA / CABINA VINCULADA
            </span>
            <span className="text-sm font-black font-mono text-cyan-300">
              {currentSlug.toUpperCase()}
            </span>
            <span className="text-xs text-slate-400 block font-sans">
              Salón: {venueName}
            </span>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/30">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Conectada</span>
          </div>
        </div>

        {/* Fullscreen Button */}
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="w-full p-3 rounded-xl bg-[#141824] hover:bg-[#1c2236] border border-[#2b354f] text-left transition-all flex items-center justify-between"
        >
          <div className="flex items-center gap-2.5">
            {isFullscreen ? (
              <Minimize2 className="size-4 text-cyan-400" />
            ) : (
              <Maximize2 className="size-4 text-cyan-400" />
            )}
            <span className="font-mono text-xs font-bold text-white">
              {isFullscreen ? "🗗 Salir de Pantalla Completa" : "🖥️ Activar Pantalla Completa"}
            </span>
          </div>
          <span className="font-mono text-xs text-slate-400">(Tecla F / Enter)</span>
        </button>

        {/* Unpair / Link with another Cabina Button */}
        <button
          type="button"
          onClick={onUnpair}
          className="w-full p-3 rounded-xl bg-[#1f1722] hover:bg-[#2c1d30] border border-fuchsia-500/40 hover:border-fuchsia-400 text-left transition-all flex items-center justify-between group"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-base">🔑</span>
            <div>
              <span className="font-mono text-xs font-bold text-fuchsia-200 block">
                Desvincular Pantalla / Vincular con otra Cabina
              </span>
              <span className="font-mono text-[10px] text-fuchsia-300/70">
                Pone la pantalla en cero con código PIN para vincularla a otra cuenta
              </span>
            </div>
          </div>
          <LogOut className="size-4 text-fuchsia-400 group-hover:translate-x-0.5 transition-transform" />
        </button>

        {/* Keyboard Hotkeys Collapsible */}
        {showHotkeys && (
          <div className="bg-[#080B12] border border-[#222b42] rounded-xl p-3.5 space-y-2 text-xs font-mono">
            <span className="text-cyan-400 font-bold block text-[11px] uppercase tracking-wider">
              ⌨️ Atajos de Teclado y Control Remoto
            </span>
            <div className="grid grid-cols-2 gap-2 text-slate-300">
              <div><kbd className="bg-[#161c2d] px-1.5 py-0.5 rounded text-white border border-[#2b354f]">Espacio</kbd> Play / Pausa</div>
              <div><kbd className="bg-[#161c2d] px-1.5 py-0.5 rounded text-white border border-[#2b354f]">V</kbd> o <kbd className="bg-[#161c2d] px-1.5 py-0.5 rounded text-white border border-[#2b354f]">P</kbd> Cambiar Modo</div>
              <div><kbd className="bg-[#161c2d] px-1.5 py-0.5 rounded text-white border border-[#2b354f]">M</kbd> Mutear / Desmutear</div>
              <div><kbd className="bg-[#161c2d] px-1.5 py-0.5 rounded text-white border border-[#2b354f]">F</kbd> o <kbd className="bg-[#161c2d] px-1.5 py-0.5 rounded text-white border border-[#2b354f]">Enter</kbd> Fullscreen</div>
              <div><kbd className="bg-[#161c2d] px-1.5 py-0.5 rounded text-white border border-[#2b354f]">Q</kbd> Agrandar QR</div>
              <div><kbd className="bg-[#161c2d] px-1.5 py-0.5 rounded text-white border border-[#2b354f]">Esc</kbd> o <kbd className="bg-[#161c2d] px-1.5 py-0.5 rounded text-white border border-[#2b354f]">O</kbd> Este Menú</div>
            </div>
          </div>
        )}

        {/* Actions Footer */}
        <div className="flex items-center gap-2.5 pt-2 border-t border-[#232b42]">
          <button
            type="button"
            onClick={onReload}
            className="flex-1 py-2.5 px-3 rounded-xl bg-[#141824] hover:bg-[#1e2436] border border-[#28324e] font-mono text-xs font-bold text-slate-200 hover:text-white flex items-center justify-center gap-1.5 transition-colors"
          >
            <RefreshCw className="size-3.5 text-cyan-400" />
            <span>Recargar</span>
          </button>

          <button
            type="button"
            onClick={() => setShowHotkeys((v) => !v)}
            className="py-2.5 px-3 rounded-xl bg-[#141824] hover:bg-[#1e2436] border border-[#28324e] font-mono text-xs font-bold text-slate-200 hover:text-white flex items-center justify-center gap-1.5 transition-colors"
          >
            <HelpCircle className="size-3.5 text-indigo-400" />
            <span>{showHotkeys ? "Ocultar Atajos" : "Atajos"}</span>
          </button>

          <button
            type="button"
            onClick={onDismiss}
            className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:brightness-110 font-mono text-xs font-extrabold text-white transition-all shadow-md"
          >
            Cerrar Ajustes
          </button>
        </div>
      </div>
    </div>
  );
}

