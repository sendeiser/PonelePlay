"use client";

import React, { useState } from "react";
import type { PartyConfig, PartyMode } from "@/lib/domain/party";
import type { QueueItemView } from "@/lib/api/contracts";
import { triggerPartyDuel, triggerPartyRoulette } from "@/lib/api/party-control";

export interface PartyModeControlBarProps {
  slug: string;
  venueName?: string;
  config: PartyConfig;
  queueItems: QueueItemView[];
  onConfigChange: (patch: Partial<PartyConfig>) => void | Promise<void>;
  onReloadGuestVotes?: () => void | Promise<void>;
  onOpenQrInvite?: () => void;
}

const VOTE_LIMIT_PRESETS = [
  { label: "♾️ Ilimitado", value: 0 },
  { label: "3 votos", value: 3 },
  { label: "5 votos", value: 5 },
  { label: "10 votos", value: 10 },
];

const QUEUE_THRESHOLD_PRESETS = [
  { label: "1 (Directo)", value: 1 },
  { label: "2 votos", value: 2 },
  { label: "3 votos", value: 3 },
  { label: "5 votos", value: 5 },
  { label: "8 votos", value: 8 },
];

export function PartyModeControlBar({
  slug,
  venueName,
  config,
  queueItems,
  onConfigChange,
  onReloadGuestVotes,
  onOpenQrInvite,
}: PartyModeControlBarProps) {
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);
  const [duelLaunching, setDuelLaunching] = useState(false);
  const [rouletteSpinning, setRouletteSpinning] = useState(false);

  const showToast = (msg: string) => {
    setStatusFeedback(msg);
    setTimeout(() => setStatusFeedback(null), 3500);
  };

  const handleSelectMode = (partyMode: PartyMode) => {
    void onConfigChange({ partyMode });
    if (partyMode === "democratic") {
      showToast("🗳️ Modo Democrático activado en vivo.");
    } else if (partyMode === "hybrid_turbo") {
      showToast("🔥 Modo Híbrido Turbo activado: invitados tienen Fueguitos (+3 votos).");
    } else {
      showToast("🎰 Modo Duelos y Ruleta activado para TV y celulares.");
    }
  };

  const handleLaunchDuel = async () => {
    if (queueItems.length < 2) {
      showToast("⚠️ Necesitás al menos 2 canciones propuestas o en cola para lanzar un Duelo 1v1.");
      return;
    }
    setDuelLaunching(true);
    try {
      const [trackA, trackB] = queueItems.slice(0, 2);
      await triggerPartyDuel(slug, trackA, trackB, 30);
      showToast(`⚡ ¡Duelo lanzado en TV y celulares! "${trackA.title}" vs "${trackB.title}" (30s)`);
    } finally {
      setDuelLaunching(false);
    }
  };

  const handleSpinRoulette = async () => {
    if (queueItems.length === 0) {
      showToast("⚠️ Agregá o pedí al menos 1 canción en la cola para girar la Ruleta Fiestera.");
      return;
    }
    setRouletteSpinning(true);
    try {
      const pool = queueItems.slice(0, 8);
      const winner = pool[Math.floor(Math.random() * pool.length)];
      await triggerPartyRoulette(slug, pool, winner);
      showToast(`🎡 ¡Ruleta girando en la TV! Ganadora: "${winner.title}"`);
    } finally {
      setRouletteSpinning(false);
    }
  };

  const handleReloadVotes = () => {
    if (onReloadGuestVotes) {
      void onReloadGuestVotes();
    }
    showToast("🔄 ¡Votos recargados para todos los invitados conectados!");
  };

  return (
    <section className="rounded-2xl border border-fuchsia-500/40 bg-gradient-to-br from-fuchsia-950/35 via-[#121524] to-amber-950/20 p-4 sm:p-5 shadow-xl space-y-4">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-amber-500 text-white shadow-lg shadow-fuchsia-500/20 text-lg">
            🎉
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-extrabold text-white tracking-tight">
                Cabina Modo Fiesta · Todo Desbloqueado
              </h2>
              <span className="rounded-full bg-fuchsia-500/20 border border-fuchsia-400/40 px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase text-fuchsia-200">
                Sin Códigos
              </span>
            </div>
            <p className="text-xs text-slate-300 font-mono">
              {venueName ? `${venueName} · ` : ""}Los invitados entran con el QR o link y eligen música libremente
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenQrInvite && (
            <button
              type="button"
              onClick={onOpenQrInvite}
              className="flex items-center gap-1.5 rounded-xl bg-fuchsia-500 hover:bg-fuchsia-400 text-white px-3.5 py-2 text-xs font-mono font-bold shadow-md shadow-fuchsia-500/25 transition-all active:scale-95"
            >
              <span className="material-symbols-outlined text-base">qr_code_2</span>
              <span>Invitar Amigos (QR Fiesta)</span>
            </button>
          )}
        </div>
      </div>

      {/* 3 Party Sub-Modes Selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        <button
          type="button"
          onClick={() => handleSelectMode("democratic")}
          className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all ${
            config.partyMode === "democratic"
              ? "border-cyan-400 bg-cyan-500/15 text-white shadow-lg shadow-cyan-500/10"
              : "border-white/10 bg-[#0d111c]/80 text-slate-300 hover:border-white/25"
          }`}
        >
          <div className="flex items-center justify-between w-full mb-1">
            <span className="text-xs font-extrabold uppercase tracking-wider text-cyan-300">
              🗳️ Modo Democrático
            </span>
            {config.partyMode === "democratic" && (
              <span className="text-[10px] font-mono font-bold bg-cyan-400/20 text-cyan-200 px-2 py-0.5 rounded-full">
                ACTIVO
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            El pueblo decide. Podés ajustar el tope individual y cuántos votos necesita un tema para subir.
          </p>
        </button>

        <button
          type="button"
          onClick={() => handleSelectMode("hybrid_turbo")}
          className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all ${
            config.partyMode === "hybrid_turbo"
              ? "border-amber-400 bg-amber-500/15 text-white shadow-lg shadow-amber-500/10"
              : "border-white/10 bg-[#0d111c]/80 text-slate-300 hover:border-white/25"
          }`}
        >
          <div className="flex items-center justify-between w-full mb-1">
            <span className="text-xs font-extrabold uppercase tracking-wider text-amber-300">
              🔥 Híbrido Turbo
            </span>
            {config.partyMode === "hybrid_turbo" && (
              <span className="text-[10px] font-mono font-bold bg-amber-400/20 text-amber-200 px-2 py-0.5 rounded-full">
                ACTIVO
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            Votos libres + <strong>Fueguitos Turbo (+3 votos de golpe)</strong> recargables cada 3 minutos para destrabar empates.
          </p>
        </button>

        <button
          type="button"
          onClick={() => handleSelectMode("party_games")}
          className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all ${
            config.partyMode === "party_games"
              ? "border-fuchsia-400 bg-fuchsia-500/15 text-white shadow-lg shadow-fuchsia-500/10"
              : "border-white/10 bg-[#0d111c]/80 text-slate-300 hover:border-white/25"
          }`}
        >
          <div className="flex items-center justify-between w-full mb-1">
            <span className="text-xs font-extrabold uppercase tracking-wider text-fuchsia-300">
              🎰 Duelos y Ruleta
            </span>
            {config.partyMode === "party_games" && (
              <span className="text-[10px] font-mono font-bold bg-fuchsia-400/20 text-fuchsia-200 px-2 py-0.5 rounded-full">
                ACTIVO
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            Dispará batallas 1 vs 1 de 30 segundos en todos los celulares o girá la Ruleta Fiestera en la TV.
          </p>
        </button>
      </div>

      {/* Sub-panel for Democratic Mode Controls (Always visible in Democratic Mode, or quick summary) */}
      {config.partyMode === "democratic" && (
        <div className="rounded-xl border border-cyan-500/30 bg-[#0b101b]/90 p-3.5 space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Control 1: Límite de votos por persona */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-cyan-200">
                  Límite de votos por persona (Opcional)
                </label>
                <span className="text-[11px] font-mono text-cyan-300 font-bold">
                  {config.votesPerGuest === 0 ? "♾️ Ilimitado" : `${config.votesPerGuest} votos máx.`}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {VOTE_LIMIT_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => void onConfigChange({ votesPerGuest: preset.value })}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold border transition-all ${
                      config.votesPerGuest === preset.value
                        ? "bg-cyan-500 text-slate-950 border-cyan-300"
                        : "bg-[#141a29] text-slate-300 border-white/10 hover:border-cyan-400/40"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
                <input
                  type="number"
                  min={0}
                  max={500}
                  aria-label="Límite personalizado de votos por persona"
                  value={config.votesPerGuest}
                  onChange={(e) =>
                    void onConfigChange({
                      votesPerGuest: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="w-20 rounded-lg border border-white/15 bg-[#141a29] px-2.5 py-1 text-xs font-mono text-white"
                />
                <button
                  type="button"
                  onClick={handleReloadVotes}
                  className="ml-auto flex items-center gap-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 px-2.5 py-1 text-xs font-mono font-bold text-emerald-200 transition-all active:scale-95"
                >
                  <span>🔄 Recargar votos a todos</span>
                </button>
              </div>
            </div>

            {/* Control 2: Cantidad de votos para que la canción suba */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-amber-200">
                  Votos para que la canción suba a la cola (Opcional)
                </label>
                <span className="text-[11px] font-mono text-amber-300 font-bold">
                  {config.minVotesToQueue <= 1
                    ? "1 voto (Sube directo)"
                    : `${config.minVotesToQueue} votos requeridos`}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {QUEUE_THRESHOLD_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => void onConfigChange({ minVotesToQueue: preset.value })}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold border transition-all ${
                      config.minVotesToQueue === preset.value
                        ? "bg-amber-400 text-slate-950 border-amber-200"
                        : "bg-[#141a29] text-slate-300 border-white/10 hover:border-amber-400/40"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={100}
                  aria-label="Umbral personalizado de votos para subir a la cola"
                  value={config.minVotesToQueue}
                  onChange={(e) =>
                    void onConfigChange({
                      minVotesToQueue: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                  className="w-20 rounded-lg border border-white/15 bg-[#141a29] px-2.5 py-1 text-xs font-mono text-white"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sub-panel for Party Games (Duels & Roulette triggers) */}
      {config.partyMode === "party_games" && (
        <div className="rounded-xl border border-fuchsia-500/30 bg-[#0b101b]/90 p-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-300">
            <span className="font-bold text-fuchsia-300">🎮 Controles de Show en Vivo:</span>{" "}
            Dispará un duelo interactivo entre los 2 mejores temas o sorteá un tema al azar en la TV.
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={duelLaunching}
              onClick={() => void handleLaunchDuel()}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 px-3.5 py-2 text-xs font-mono font-extrabold shadow-md shadow-amber-500/20 transition-all active:scale-95 disabled:opacity-50"
            >
              <span>⚡ Lanzar Duelo 1v1 (30s)</span>
            </button>
            <button
              type="button"
              disabled={rouletteSpinning}
              onClick={() => void handleSpinRoulette()}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-indigo-600 hover:from-fuchsia-400 hover:to-indigo-500 text-white px-3.5 py-2 text-xs font-mono font-extrabold shadow-md shadow-fuchsia-500/25 transition-all active:scale-95 disabled:opacity-50"
            >
              <span>🎡 Girar Ruleta en TV</span>
            </button>
          </div>
        </div>
      )}

      {statusFeedback && (
        <div className="rounded-lg bg-fuchsia-500/15 border border-fuchsia-400/30 px-3 py-2 text-xs font-mono text-fuchsia-200 flex items-center justify-between">
          <span>{statusFeedback}</span>
          <button
            type="button"
            onClick={() => setStatusFeedback(null)}
            className="text-fuchsia-300 hover:text-white text-xs"
          >
            ✕
          </button>
        </div>
      )}
    </section>
  );
}
