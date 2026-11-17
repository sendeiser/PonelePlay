import React, { useState } from 'react';
import {
  Ban,
  ChevronDown,
  ChevronUp,
  MoreVertical,
  Pin,
  Play,
} from 'lucide-react';
import { formatDurationMs } from '../data/mockPartyData';
import { QueueItem } from '../types/jukebox';

interface QueueItemCardProps {
  item: QueueItem;
  rank: number;
  isHost: boolean;
  onVote: (id: string, dir: 1 | -1) => void;
  onTogglePin: (id: string) => void;
  onPlayNow: (id: string) => void;
  onBlock: (id: string) => void;
}

export const QueueItemCard: React.FC<QueueItemCardProps> = ({
  item,
  rank,
  isHost,
  onVote,
  onTogglePin,
  onPlayNow,
  onBlock,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);

  const scoreColor =
    item.netScore > 0
      ? 'text-coral'
      : item.netScore < 0
      ? 'text-danger'
      : 'text-muted';

  return (
    <article
      className={`glass-card relative rounded-2xl border p-3.5 transition-all sm:p-4 ${
        item.isPinned
          ? 'border-coral/50 shadow-surface'
          : 'border-stroke hover:border-brand/40'
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Posición + Portada + Info limpia */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="w-6 shrink-0 text-center font-mono text-xs font-bold tabular-nums-mono text-muted">
            {String(rank).padStart(2, '0')}
          </span>
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-stroke shadow-sm sm:h-14 sm:w-14">
            <img
              src={item.song.imageUrl}
              alt={`Portada de ${item.song.title}`}
              className="h-full w-full object-cover"
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {item.isPinned && (
                <span className="bg-brand-gradient inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-sm">
                  <Pin className="h-3 w-3" />
                  Siguiente
                </span>
              )}
              <h3 className="truncate text-sm font-bold text-ink sm:text-base">
                {item.song.title}
              </h3>
            </div>
            <p className="truncate text-xs font-medium text-muted sm:text-sm">
              {item.song.artist}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <span>
                {item.proposedByAvatar} @{item.proposedByName}
              </span>
              <span>·</span>
              <span className="tabular-nums-mono">{formatDurationMs(item.song.durationMs)}</span>
            </div>
          </div>
        </div>

        {/* Controles de votación (min 44x44px) + menú Host */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-stroke pt-2.5 sm:justify-end sm:border-t-0 sm:pt-0">
          <span className="text-[11px] font-medium text-muted sm:hidden">Votar tema</span>
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1 rounded-full border border-stroke bg-elevated p-1">
              <button
                type="button"
                onClick={() => onVote(item.id, 1)}
                aria-label={`Votar a favor de ${item.song.title}`}
                aria-pressed={item.userVote === 1}
                className={`flex h-11 w-11 items-center justify-center rounded-full transition-all active:scale-95 ${
                  item.userVote === 1
                    ? 'bg-brand-gradient shadow-aurora'
                    : 'text-muted hover:bg-card hover:text-ink'
                }`}
              >
                <ChevronUp className="h-5 w-5" />
              </button>

              <span
                className={`min-w-[2.25rem] text-center font-mono text-sm font-bold tabular-nums-mono ${scoreColor}`}
              >
                {item.netScore > 0 ? `+${item.netScore}` : item.netScore}
              </span>

              <button
                type="button"
                onClick={() => onVote(item.id, -1)}
                aria-label={`Votar en contra de ${item.song.title}`}
                aria-pressed={item.userVote === -1}
                className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors active:scale-95 ${
                  item.userVote === -1
                    ? 'bg-danger text-white'
                    : 'text-muted hover:bg-card hover:text-danger'
                }`}
              >
                <ChevronDown className="h-5 w-5" />
              </button>
            </div>

            {isHost && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-label={`Acciones de moderación para ${item.song.title}`}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-stroke bg-elevated text-muted transition-colors hover:text-ink"
                >
                  <MoreVertical className="h-5 w-5" />
                </button>

                {menuOpen && (
                  <div
                    role="menu"
                    className="glass-card absolute right-0 top-12 z-30 w-48 rounded-2xl border border-stroke p-1.5 shadow-elevated"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onTogglePin(item.id);
                        setMenuOpen(false);
                      }}
                      className="flex min-h-[44px] w-full items-center gap-2 rounded-xl px-3 text-left text-xs font-semibold text-ink hover:bg-elevated"
                    >
                      <Pin className="h-4 w-4 text-coral" />
                      <span>{item.isPinned ? 'Quitar fijación' : 'Fijar arriba (Pin)'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onPlayNow(item.id);
                        setMenuOpen(false);
                      }}
                      className="flex min-h-[44px] w-full items-center gap-2 rounded-xl px-3 text-left text-xs font-semibold text-ink hover:bg-elevated"
                    >
                      <Play className="h-4 w-4 text-brand" />
                      <span>Reproducir ahora</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onBlock(item.id);
                        setMenuOpen(false);
                      }}
                      className="flex min-h-[44px] w-full items-center gap-2 rounded-xl px-3 text-left text-xs font-semibold text-danger hover:bg-elevated"
                    >
                      <Ban className="h-4 w-4" />
                      <span>Bloquear canción</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
};
