"use client";

import type { QueueItemView } from "@/lib/api/contracts";

interface ActivityTabProps {
  venueName: string;
  credits: number;
  proposalsUsed: number;
  maxProposals: number;
  queue: QueueItemView[];
  nowPlaying: QueueItemView | null;
  onGoToRedeem: () => void;
  onGoToPropose: () => void;
}

export function ActivityTab({
  venueName,
  credits,
  proposalsUsed,
  maxProposals,
  queue,
  nowPlaying,
  onGoToRedeem,
  onGoToPropose,
}: ActivityTabProps) {
  // Find songs voted by this participant in nowPlaying and queue
  const votedItems = [
    ...(nowPlaying?.myVote ? [nowPlaying] : []),
    ...queue.filter((q) => q.myVote),
  ];

  const totalVoted = votedItems.length;
  const progressRatio = maxProposals > 0 ? Math.min(1, proposalsUsed / maxProposals) : 0;

  return (
    <div className="space-y-5 pb-6">
      {/* Page Headline & Venue Subtext */}
      <div className="pt-1">
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono text-[11px] text-th-teal uppercase tracking-wider font-semibold">
            {venueName}
          </span>
          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-th-muted">
            <span className="material-symbols-outlined text-xs">schedule</span>
            Sesión Activa
          </span>
        </div>
        <h1 className="font-display text-xl font-bold text-th-text tracking-tight">
          Mi Actividad en Vivo
        </h1>
        <p className="text-xs text-th-muted mt-1">
          Balance de créditos, canciones votadas y propuestas durante la noche
        </p>
      </div>

      {/* Credit Balance Bento Hero Card */}
      <section className="card-panel rounded-2xl p-4 relative overflow-hidden">
        {/* Main Balance Row */}
        <div className="flex items-start justify-between pb-4 border-b border-th-border">
          <div>
            <span className="font-mono text-[11px] text-th-muted uppercase tracking-wider block">
              Créditos de Jukebox
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-4xl font-extrabold text-th-accent tracking-tight font-mono tabular-nums">
                {credits}
              </span>
              <span className="text-sm font-semibold text-th-text">
                {credits === 1 ? "Crédito Disponible" : "Créditos Disponibles"}
              </span>
            </div>
            <span className="text-xs text-th-muted mt-0.5 block">
              {credits > 0
                ? `Suficiente para ${credits} votos o proponer nuevos temas`
                : "Canjeá un nuevo código para seguir votando"}
            </span>
          </div>

          <button
            type="button"
            onClick={onGoToRedeem}
            className="mt-1 px-3.5 py-2 rounded-xl bg-th-accent hover:bg-th-accent-hover text-th-on-accent font-bold text-xs shadow-sm active:scale-95 transition-all flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
              bolt
            </span>
            Cargar Más
          </button>
        </div>

        {/* Secondary Stat Bento Grid */}
        <div className="grid grid-cols-2 gap-2.5 pt-3.5 pb-3">
          <div className="bg-th-recessed rounded-xl p-3 border border-th-border flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="material-symbols-outlined text-th-accent text-base">toll</span>
              <span className="font-mono text-[10px] font-semibold text-th-teal uppercase">Fichas</span>
            </div>
            <div className="mt-2">
              <span className="text-base font-bold text-th-text block font-mono tabular-nums">
                {totalVoted} {totalVoted === 1 ? "Ficha" : "Fichas"}
              </span>
              <span className="text-[11px] text-th-muted">Gastadas en votos</span>
            </div>
          </div>

          <div className="bg-th-recessed rounded-xl p-3 border border-th-border flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="material-symbols-outlined text-th-teal text-base">how_to_vote</span>
              <span className="font-mono text-[10px] font-semibold text-th-accent uppercase">Estado</span>
            </div>
            <div className="mt-2">
              <span className="text-base font-bold text-th-text block font-mono tabular-nums">
                {votedItems.length} Votadas
              </span>
              <span className="text-[11px] text-th-muted">
                {nowPlaying?.myVote ? "1 sonando ahora" : "En cola de espera"}
              </span>
            </div>
          </div>
        </div>

        {/* Quota Indicator Progress */}
        <div className="mt-1 pt-3 border-t border-th-border">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-th-muted">Cupo de propuestas de tema</span>
            <span className="font-mono text-xs font-semibold text-th-teal tabular-nums">
              {proposalsUsed} de {maxProposals} utilizadas
            </span>
          </div>
          <div className="w-full bg-th-recessed h-2.5 rounded-full overflow-hidden flex gap-1 p-0.5 border border-th-border">
            <div
              className="bg-th-teal h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.max(6, progressRatio * 100)}%` }}
            />
          </div>
        </div>
      </section>

      {/* Mis Votos de la Noche */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-bold text-th-text tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-th-accent text-base">how_to_vote</span>
            Canciones que votaste esta noche
          </h2>
          <span className="font-mono text-[11px] text-th-muted tabular-nums">
            {votedItems.length} en total
          </span>
        </div>

        {votedItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-th-border bg-th-card/50 p-6 text-center text-xs text-th-muted">
            Todavía no votaste ninguna canción. ¡Sumá votos en la cola para decidir la música!
          </div>
        ) : (
          <div className="space-y-2 max-h-[340px] pr-1 ui-scroll-container">
            {votedItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 rounded-xl bg-th-card border border-th-border shadow-xs"
              >
                <div className="min-w-0 flex-1 pr-3">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-th-text truncate">
                      {item.title}
                    </h4>
                    {item.id === nowPlaying?.id ? (
                      <span className="shrink-0 px-2 py-0.5 rounded-full bg-th-danger-soft text-th-danger border border-th-danger/30 font-mono text-[9px] font-bold">
                        Sonando
                      </span>
                    ) : (
                      <span className="shrink-0 px-1.5 py-0.5 rounded bg-th-accent-soft text-th-accent font-mono text-[9px] font-bold">
                        En cola
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-th-muted truncate mt-0.5">
                    {item.artist}
                  </p>
                </div>
                <div className="shrink-0 font-mono text-xs font-bold text-th-accent bg-th-accent-soft border border-th-accent/25 px-2.5 py-1 rounded-lg tabular-nums">
                  {item.voteCount} votos
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Proponer tema CTA */}
      <div className="pt-2">
        <button
          type="button"
          onClick={onGoToPropose}
          className="w-full py-3 px-4 rounded-xl bg-th-card hover:bg-th-recessed border border-th-border text-th-secondary hover:text-th-text font-semibold text-xs flex items-center justify-center gap-2 transition-colors shadow-xs"
        >
          <span className="material-symbols-outlined text-th-accent text-base">add_circle</span>
          <span>Proponer una nueva canción con YouTube</span>
        </button>
      </div>
    </div>
  );
}
