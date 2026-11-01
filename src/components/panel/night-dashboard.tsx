"use client";

import { useMemo, useState } from "react";
import {
  Ban,
  Disc3,
  Moon,
  Music2,
  Play,
  RotateCcw,
  SkipForward,
  Sparkles,
} from "lucide-react";
import { BallChip } from "@/components/ball-chip";
import { SourceBadge } from "@/components/source-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
import { PlayerStatus } from "./player-status";
import { PairPlayerDialog } from "./pair-player";

interface NightDashboardProps {
  slug: string;
  role: PanelRole;
  staffToken?: string;
}

export function NightDashboard({ slug, role, staffToken }: NightDashboardProps) {
  const source = useMemo(() => createNightStateSource(slug), [slug]);
  const { state, loading, refresh } = useNightState(source);

  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmVetoId, setConfirmVetoId] = useState<string | null>(null);
  const [pairDialogOpen, setPairDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  async function handleSkip() {
    if (!state?.nowPlaying) return;
    setActionLoading(true);
    setErrorMsg(null);
    try {
      await skipCurrent(state.nowPlaying.id, staffToken);
      await refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Error al saltear canción");
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
      <div className="flex h-64 items-center justify-center text-cream/40 font-mono text-sm">
        Cargando panel de control...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with status and main night action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-cream/10 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-display font-bold text-cream">
              Control de la Noche
            </h1>
            <span
              className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${
                isOpen
                  ? "bg-mint/15 text-mint border border-mint/30"
                  : "bg-cream/10 text-cream/50 border border-cream/10"
              }`}
            >
              {isOpen ? "Noche abierta" : "Noche cerrada"}
            </span>
          </div>
          <p className="mt-1 text-xs text-cream/50">
            {state?.venue.name} · Modo {role}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void refresh()}
            aria-label="Actualizar"
            className="grid size-9 place-items-center rounded-lg border border-cream/15 text-cream/60 hover:text-cream hover:bg-cream/5"
          >
            <RotateCcw className="size-4" />
          </button>

          {isOpen ? (
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => setConfirmClose(true)}
              className="flex items-center gap-2 rounded-xl border border-coral/30 bg-coral/10 px-4 py-2 text-xs font-bold text-coral hover:bg-coral/20 transition-colors"
            >
              <Moon className="size-4" />
              Cerrar noche
            </button>
          ) : (
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => setConfirmOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-amber px-4 py-2 text-xs font-bold text-[#041611] hover:bg-amber/90 transition-colors"
            >
              <Play className="size-4" />
              Abrir noche
            </button>
          )}
        </div>
      </div>

      {errorMsg ? (
        <div
          role="alert"
          className="rounded-xl border border-coral/30 bg-coral/10 p-3 text-xs text-coral"
        >
          {errorMsg}
        </div>
      ) : null}

      {/* Grid: Player & Controls summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PlayerStatus
          lastSeenAt={state?.player?.lastSeenAt}
          onPair={() => setPairDialogOpen(true)}
        />

        <div className="rounded-xl border border-cream/10 bg-[#07211b] p-3 flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-cream/40">
              Propuestas de clientes
            </p>
            <p className="text-sm font-semibold mt-0.5 text-cream">
              {state?.settings.proposalsEnabled ? "Habilitadas" : "Pausadas"}
            </p>
          </div>
          <button
            type="button"
            disabled={actionLoading || !isOpen}
            onClick={() => void handleToggleProposals()}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
              state?.settings.proposalsEnabled
                ? "bg-amber/15 text-amber border border-amber/30 hover:bg-amber/25"
                : "bg-cream/10 text-cream/60 border border-cream/15 hover:bg-cream/15"
            }`}
          >
            {state?.settings.proposalsEnabled ? "Pausar" : "Habilitar"}
          </button>
        </div>

        <div className="rounded-xl border border-cream/10 bg-[#07211b] p-3 flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-cream/40">
              Temas en cola
            </p>
            <p className="text-2xl font-display font-extrabold text-amber">
              {state?.queue.length ?? 0}
            </p>
          </div>
          <Sparkles className="size-6 text-cream/20" />
        </div>
      </div>

      {/* Now Playing Section */}
      <div className="rounded-2xl border border-cream/10 bg-[#07211b] p-5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber font-bold">
            Sonando ahora
          </span>
          {state?.nowPlaying ? (
            <SourceBadge source={state.nowPlaying.source} />
          ) : null}
        </div>

        {state?.nowPlaying ? (
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-amber/10 text-amber">
                <Music2 className="size-6" />
              </div>
              <div>
                <h2 className="font-display text-lg font-bold text-cream">
                  {state.nowPlaying.title}
                </h2>
                <p className="text-xs text-cream/50">
                  {state.nowPlaying.artist} · {state.nowPlaying.voteCount} votos
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={actionLoading}
              onClick={() => void handleSkip()}
              className="flex items-center gap-1.5 self-start sm:self-auto rounded-lg border border-cream/20 bg-cream/5 px-3 py-2 text-xs font-bold text-cream hover:bg-cream/10 transition-colors"
            >
              <SkipForward className="size-4" />
              Saltar tema (Skip)
            </button>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-3 text-cream/40 text-xs">
            <Disc3 className="size-5" />
            No hay canción sonando en la cola. Reproduciendo playlist de fondo.
          </div>
        )}
      </div>

      {/* Live Queue Table */}
      <div className="rounded-2xl border border-cream/10 bg-[#07211b] p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-bold text-cream">
            Cola de reproducción en vivo
          </h2>
          <span className="font-mono text-xs text-cream/40">
            {state?.queue.length ?? 0} en espera
          </span>
        </div>

        {state?.queue.length ? (
          <ul className="space-y-2">
            {state.queue.map((item, idx) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-cream/5 bg-white/[0.015] p-3 hover:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <BallChip n={idx + 1} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-cream">
                      {item.title}
                    </p>
                    <p className="truncate text-xs text-cream/50">
                      {item.artist}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <span className="font-mono text-xs text-amber font-bold">
                    {item.voteCount} {item.voteCount === 1 ? "voto" : "votos"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfirmVetoId(item.id)}
                    className="grid size-8 place-items-center rounded-lg border border-coral/20 bg-coral/5 text-coral hover:bg-coral/15 transition-colors"
                    aria-label={`Vetar ${item.title}`}
                  >
                    <Ban className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-center py-8 text-xs text-cream/40">
            La cola está vacía por el momento.
          </p>
        )}
      </div>

      {/* Confirm Dialogs */}
      <ConfirmDialog
        open={confirmOpen}
        title="¿Abrir la sesión de la noche?"
        description="Se habilitará la votación para los clientes y el canje de códigos de consumición."
        confirmLabel="Abrir noche"
        onConfirm={() => void handleOpenNight()}
        onCancel={() => setConfirmOpen(false)}
      />

      <ConfirmDialog
        open={confirmClose}
        title="¿Cerrar la sesión de la noche?"
        description="Esta acción finalizará la sesión actual. Todos los códigos activos no canjeados y créditos restantes van a vencer inmediatamente."
        confirmLabel="Cerrar noche"
        onConfirm={() => void handleCloseNight()}
        onCancel={() => setConfirmClose(false)}
      />

      <ConfirmDialog
        open={confirmVetoId !== null}
        title="¿Vetar este tema de la cola?"
        description="El tema se quitará de la cola inmediatamente sin devolución de créditos al cliente."
        confirmLabel="Vetar tema"
        onConfirm={() => {
          if (confirmVetoId) void handleVeto(confirmVetoId);
        }}
        onCancel={() => setConfirmVetoId(null)}
      />

      <PairPlayerDialog
        open={pairDialogOpen}
        venueId={state?.venue.id ?? ""}
        slug={slug}
        onClose={() => setPairDialogOpen(false)}
      />
    </div>
  );
}

