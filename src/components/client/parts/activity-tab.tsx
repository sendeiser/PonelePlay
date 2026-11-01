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
          <span className="font-mono text-[11px] text-cyan-400 uppercase tracking-wider font-semibold">
            {venueName}
          </span>
          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-400">
            <span className="material-symbols-outlined text-xs">schedule</span>
            Sesión Activa
          </span>
        </div>
        <h1 className="text-xl font-bold text-white tracking-tight">Mi Actividad en Vivo</h1>
        <p className="text-xs text-slate-400 mt-1">
          Balance de créditos, canciones votadas y propuestas durante la noche
        </p>
      </div>

      {/* Credit Balance Bento Hero Card */}
      <section className="rounded-2xl bg-[#181b25] border border-[#232b42] p-4 relative overflow-hidden shadow-xl">
        {/* Ambient Glow Flare */}
        <div className="absolute -top-12 -right-12 w-36 h-36 bg-indigo-500/15 rounded-full blur-2xl pointer-events-none" />

        {/* Main Balance Row */}
        <div className="flex items-start justify-between pb-4 border-b border-[#232b42]/70 relative z-10">
          <div>
            <span className="font-mono text-[11px] text-slate-400 uppercase tracking-wider block">
              Créditos de Jukebox
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-4xl font-extrabold text-[#c0c1ff] tracking-tight font-mono">
                {credits}
              </span>
              <span className="text-sm font-semibold text-white">
                {credits === 1 ? "Crédito Disponible" : "Créditos Disponibles"}
              </span>
            </div>
            <span className="text-xs text-slate-400 mt-0.5 block">
              {credits > 0
                ? `Suficiente para ${credits} votos o proponer nuevos temas`
                : "Canjeá un nuevo código para seguir votando"}
            </span>
          </div>

          <button
            type="button"
            onClick={onGoToRedeem}
            className="mt-1 px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-xs shadow-md shadow-indigo-600/30 active:scale-95 transition-all flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
              bolt
            </span>
            Cargar Más
          </button>
        </div>

        {/* Secondary Stat Bento Grid */}
        <div className="grid grid-cols-2 gap-2.5 pt-3.5 pb-3">
          <div className="bg-[#121624] rounded-xl p-3 border border-[#232b42]/60 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="material-symbols-outlined text-indigo-400 text-base">toll</span>
              <span className="font-mono text-[10px] text-cyan-400 uppercase">Fichas</span>
            </div>
            <div className="mt-2">
              <span className="text-base font-bold text-white block font-mono">
                {totalVoted} {totalVoted === 1 ? "Ficha" : "Fichas"}
              </span>
              <span className="text-[11px] text-slate-400">Gastadas en votos</span>
            </div>
          </div>

          <div className="bg-[#121624] rounded-xl p-3 border border-[#232b42]/60 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="material-symbols-outlined text-cyan-400 text-base">how_to_vote</span>
              <span className="font-mono text-[10px] text-indigo-300 uppercase">Estado</span>
            </div>
            <div className="mt-2">
              <span className="text-base font-bold text-white block font-mono">
                {votedItems.length} Votadas
              </span>
              <span className="text-[11px] text-slate-400">
                {nowPlaying?.myVote ? "1 sonando ahora" : "En cola de espera"}
              </span>
            </div>
          </div>
        </div>

        {/* Quota Indicator Progress */}
        <div className="mt-1 pt-3 border-t border-[#232b42]/70">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-slate-400">Cupo de propuestas de tema</span>
            <span className="font-mono text-xs font-semibold text-cyan-400">
              {proposalsUsed} de {maxProposals} utilizadas
            </span>
          </div>
          <div className="w-full bg-[#0a0e17] h-2.5 rounded-full overflow-hidden flex gap-1 p-0.5 border border-[#232b42]">
            <div
              className="bg-gradient-to-r from-cyan-400 to-indigo-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.max(6, progressRatio * 100)}%` }}
            />
          </div>
        </div>
      </section>

      {/* Mis Votos de la Noche */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-indigo-400 text-base">how_to_vote</span>
            Canciones que votaste esta noche
          </h2>
          <span className="font-mono text-[11px] text-slate-400">
            {votedItems.length} en total
          </span>
        </div>

        {votedItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#232b42] p-6 text-center text-xs text-slate-500">
            Todavía no votaste ninguna canción. ¡Sumá votos en la cola para decidir la música!
          </div>
        ) : (
          <div className="space-y-2">
            {votedItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 rounded-xl bg-[#131826] border border-[#1E2538]"
              >
                <div className="min-w-0 flex-1 pr-3">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-white truncate">
                      {item.title}
                    </h4>
                    {item.id === nowPlaying?.id ? (
                      <span className="shrink-0 px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30 font-mono text-[9px] font-bold">
                        Sonando
                      </span>
                    ) : (
                      <span className="shrink-0 px-1.5 py-0.5 rounded bg-indigo-500/20 text-[#c0c1ff] font-mono text-[9px] font-bold">
                        En cola
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 truncate mt-0.5">
                    {item.artist}
                  </p>
                </div>
                <div className="shrink-0 font-mono text-xs font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/25 px-2.5 py-1 rounded-lg">
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
          className="w-full py-3 px-4 rounded-xl bg-[#131826] hover:bg-[#181f33] border border-[#232b42] text-slate-300 hover:text-white font-medium text-xs flex items-center justify-center gap-2 transition-colors"
        >
          <span className="material-symbols-outlined text-indigo-400 text-base">add_circle</span>
          <span>Proponer una nueva canción con YouTube</span>
        </button>
      </div>
    </div>
  );
}
