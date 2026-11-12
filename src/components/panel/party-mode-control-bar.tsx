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
  { label: "Ilimitado", value: 0 },
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

const SKIP_THRESHOLD_PRESETS = [
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
    void onConfigChange(
      partyMode === "democratic" && config.minVotesToQueue <= 1
        ? { partyMode, minVotesToQueue: 3 }
        : { partyMode },
    );
    if (partyMode === "democratic") {
      showToast("Modo Democrático activado en vivo.");
    } else if (partyMode === "hybrid_turbo") {
      showToast("Modo Híbrido Turbo activado: invitados tienen Fueguitos (+3 votos).");
    } else {
      showToast("Modo Duelos y Ruleta activado para TV y celulares.");
    }
  };

  const handleLaunchDuel = async () => {
    if (queueItems.length < 2) {
      showToast("Necesitás al menos 2 canciones propuestas o en cola para lanzar un Duelo 1v1.");
      return;
    }
    setDuelLaunching(true);
    try {
      const [trackA, trackB] = queueItems.slice(0, 2);
      await triggerPartyDuel(slug, trackA, trackB, 30);
      showToast(`Duelo lanzado: "${trackA.title}" vs "${trackB.title}" (30s)`);
    } finally {
      setDuelLaunching(false);
    }
  };

  const handleSpinRoulette = async () => {
    if (queueItems.length === 0) {
      showToast("Agregá o pedí al menos 1 canción en la cola para girar la Ruleta.");
      return;
    }
    setRouletteSpinning(true);
    try {
      const pool = queueItems.slice(0, 8);
      const winner = pool[Math.floor(Math.random() * pool.length)];
      await triggerPartyRoulette(slug, pool, winner);
      showToast(`Ruleta girando en la TV. Ganadora: "${winner.title}"`);
    } finally {
      setRouletteSpinning(false);
    }
  };

  const handleReloadVotes = () => {
    if (onReloadGuestVotes) {
      void onReloadGuestVotes();
    }
    showToast("Votos recargados para todos los invitados conectados.");
  };

  return (
    <section className="card-panel rounded-2xl p-4 sm:p-5 space-y-4">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex size-10 items-center justify-center rounded-xl bg-th-accent-soft text-th-accent shrink-0">
            <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
              celebration
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm sm:text-base font-display font-bold text-th-text tracking-tight">
                Cabina Modo Fiesta · Todo Desbloqueado
              </h2>
              <span className="rounded-full bg-th-teal-soft border border-th-teal/25 px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase text-th-teal">
                Sin Códigos
              </span>
            </div>
            <p className="text-xs text-th-text-2 mt-0.5">
              {venueName ? `${venueName} · ` : ""}Los invitados entran por QR y eligen música libremente
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onOpenQrInvite && (
            <button
              type="button"
              onClick={onOpenQrInvite}
              className="inline-flex items-center gap-1.5 h-9 rounded-xl bg-th-accent hover:bg-th-accent-hover text-white px-3.5 text-xs font-semibold transition-all active:scale-95 cursor-pointer whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-base">qr_code_2</span>
              <span>Invitar Amigos (QR)</span>
            </button>
          )}
        </div>
      </div>

      {/* 3 Party Sub-Modes Selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        <button
          type="button"
          onClick={() => handleSelectMode("democratic")}
          className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
            config.partyMode === "democratic"
              ? "border-th-accent bg-th-accent-soft text-th-text"
              : "border-th-border bg-th-recessed text-th-text-2 hover:border-th-border-strong"
          }`}
        >
          <div className="flex items-center justify-between w-full mb-1">
            <span className="text-xs font-bold text-th-accent">
              Modo Democrático
            </span>
            {config.partyMode === "democratic" && (
              <span className="text-[10px] font-mono font-bold bg-th-accent text-white px-2 py-0.5 rounded-full">
                ACTIVO
              </span>
            )}
          </div>
          <p className="text-xs text-th-text-2 leading-relaxed">
            El público decide el orden. Ajustá el tope individual y los votos requeridos para entrar en cola.
          </p>
        </button>

        <button
          type="button"
          onClick={() => handleSelectMode("hybrid_turbo")}
          className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
            config.partyMode === "hybrid_turbo"
              ? "border-th-amber bg-th-amber-soft text-th-text"
              : "border-th-border bg-th-recessed text-th-text-2 hover:border-th-border-strong"
          }`}
        >
          <div className="flex items-center justify-between w-full mb-1">
            <span className="text-xs font-bold text-th-amber">
              Híbrido Turbo
            </span>
            {config.partyMode === "hybrid_turbo" && (
              <span className="text-[10px] font-mono font-bold bg-th-amber text-white px-2 py-0.5 rounded-full">
                ACTIVO
              </span>
            )}
          </div>
          <p className="text-xs text-th-text-2 leading-relaxed">
            Votos libres más <strong className="text-th-text">Fueguitos Turbo (+3 votos)</strong> recargables cada 3 minutos.
          </p>
        </button>

        <button
          type="button"
          onClick={() => handleSelectMode("party_games")}
          className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
            config.partyMode === "party_games"
              ? "border-th-teal bg-th-teal-soft text-th-text"
              : "border-th-border bg-th-recessed text-th-text-2 hover:border-th-border-strong"
          }`}
        >
          <div className="flex items-center justify-between w-full mb-1">
            <span className="text-xs font-bold text-th-teal">
              Duelos y Ruleta
            </span>
            {config.partyMode === "party_games" && (
              <span className="text-[10px] font-mono font-bold bg-th-teal text-white px-2 py-0.5 rounded-full">
                ACTIVO
              </span>
            )}
          </div>
          <p className="text-xs text-th-text-2 leading-relaxed">
            Dispará batallas 1 vs 1 de 30s en los celulares o girá la Ruleta Fiestera en la TV.
          </p>
        </button>
      </div>

      {/* Sub-panel for Democratic Mode Controls */}
      {config.partyMode === "democratic" && (
        <div className="rounded-xl border border-th-border bg-th-recessed p-3.5 sm:p-4 space-y-3.5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Control 1 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-th-text">
                  Límite de votos por persona
                </label>
                <span className="text-[11px] font-mono text-th-accent font-bold">
                  {config.votesPerGuest === 0 ? "Ilimitado" : `${config.votesPerGuest} votos máx.`}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {VOTE_LIMIT_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => void onConfigChange({ votesPerGuest: preset.value })}
                    className={`h-8 px-2.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                      config.votesPerGuest === preset.value
                        ? "bg-th-accent text-white border-th-accent"
                        : "bg-th-card text-th-text-2 border-th-border hover:border-th-border-strong hover:text-th-text"
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
                  className="w-20 h-8 rounded-lg border border-th-border bg-th-card px-2.5 text-xs font-mono text-th-text focus:outline-none focus:border-th-accent"
                />
                <button
                  type="button"
                  onClick={handleReloadVotes}
                  className="ml-auto inline-flex items-center gap-1 h-8 rounded-lg bg-th-emerald-soft hover:bg-th-emerald hover:text-white border border-th-emerald/30 px-2.5 text-xs font-semibold text-th-emerald transition-colors cursor-pointer whitespace-nowrap"
                >
                  <span>Recargar votos a todos</span>
                </button>
              </div>
            </div>

            {/* Control 2 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-th-text">
                  Votos necesarios para ingresar a la cola
                </label>
                <span className="text-[11px] font-mono text-th-amber font-bold">
                  {config.minVotesToQueue <= 1
                    ? "1 voto (Directo)"
                    : `${config.minVotesToQueue} votos requeridos`}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {QUEUE_THRESHOLD_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => void onConfigChange({ minVotesToQueue: preset.value })}
                    className={`h-8 px-2.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                      config.minVotesToQueue === preset.value
                        ? "bg-th-amber text-white border-th-amber"
                        : "bg-th-card text-th-text-2 border-th-border hover:border-th-border-strong hover:text-th-text"
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
                  className="w-20 h-8 rounded-lg border border-th-border bg-th-card px-2.5 text-xs font-mono text-th-text focus:outline-none focus:border-th-accent"
                />
              </div>
            </div>
          </div>

          {/* Control 3 */}
          <div className="pt-3 border-t border-th-border flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-th-text cursor-pointer">
              <input
                type="checkbox"
                checked={config.skipVoteEnabled ?? true}
                onChange={(e) =>
                  void onConfigChange({ skipVoteEnabled: e.target.checked })
                }
                className="accent-th-danger size-4 rounded cursor-pointer"
              />
              <span>Permitir votación para saltar la canción en curso</span>
            </label>

            {(config.skipVoteEnabled ?? true) && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-mono text-th-muted mr-1">
                  Votos para saltar:
                </span>
                {SKIP_THRESHOLD_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() =>
                      void onConfigChange({ skipVotesThreshold: preset.value })
                    }
                    className={`h-7 px-2.5 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                      (config.skipVotesThreshold ?? 3) === preset.value
                        ? "bg-th-danger text-white border-th-danger"
                        : "bg-th-card text-th-text-2 border-th-border hover:border-th-border-strong"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={50}
                  aria-label="Votos necesarios para cambiar canción"
                  value={config.skipVotesThreshold ?? 3}
                  onChange={(e) =>
                    void onConfigChange({
                      skipVotesThreshold: Math.max(1, Number(e.target.value) || 3),
                    })
                  }
                  className="w-16 h-7 rounded-lg border border-th-border bg-th-card px-2 text-[11px] font-mono text-th-text focus:outline-none focus:border-th-accent"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sub-panel for Party Games */}
      {config.partyMode === "party_games" && (
        <div className="rounded-xl border border-th-border bg-th-recessed p-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-th-text-2">
            <span className="font-semibold text-th-text">Controles de Show en Vivo:</span>{" "}
            Dispará un duelo interactivo entre los 2 mejores temas o sorteá un tema al azar en TV.
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={duelLaunching}
              onClick={() => void handleLaunchDuel()}
              className="inline-flex items-center gap-1.5 h-9 rounded-xl bg-th-amber text-white px-3.5 text-xs font-semibold transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <span>Lanzar Duelo 1v1 (30s)</span>
            </button>
            <button
              type="button"
              disabled={rouletteSpinning}
              onClick={() => void handleSpinRoulette()}
              className="inline-flex items-center gap-1.5 h-9 rounded-xl bg-th-accent hover:bg-th-accent-hover text-white px-3.5 text-xs font-semibold transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <span>Girar Ruleta en TV</span>
            </button>
          </div>
        </div>
      )}

      {statusFeedback && (
        <div className="rounded-xl bg-th-accent-soft border border-th-accent/30 px-3.5 py-2 text-xs font-medium text-th-text flex items-center justify-between gap-2">
          <span>{statusFeedback}</span>
          <button
            type="button"
            onClick={() => setStatusFeedback(null)}
            className="text-th-muted hover:text-th-text text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}
    </section>
  );
}
