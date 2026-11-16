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
      ? 'text-neon'
      : item.netScore < 0
      ? 'text-danger'
      : 'text-muted';

  return (
    <article
      className={`relative rounded-2xl border p-3 transition-colors sm:p-4 ${
        item.isPinned
          ? 'border-neon/60 bg-brand-deep/40 shadow-neon-green'
          : 'border-stroke bg-card hover:border-brand/70'
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Fila superior / izquierda: Posición + Portada + Info completa */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex w-7 flex-col items-center justify-center">
              <span className="font-mono text-xs font-bold tabular-nums-mono text-muted">
                #{rank}
              </span>
            </div>
            <img
              src={item.song.imageUrl}
              alt={`Portada de ${item.song.title}`}
              className="h-12 w-12 shrink-0 rounded-xl border border-stroke object-cover sm:h-14 sm:w-14"
            />
          </div>

          <div className="min-w-0 flex-1">
            {item.isPinned && (
              <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-neon/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-neon">
                <Pin className="h-3 w-3" />
                Fijada por Host
              </span>
            )}
            <h3 className="truncate text-sm font-semibold text-ink sm:text-base">
              {item.song.title}
            </h3>
            <p className="truncate text-xs text-muted sm:text-sm">
              {item.song.artist}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <span className="inline-flex items-center gap-1 rounded-md bg-elevated px-1.5 py-0.5 font-medium text-ink">
                <span>{item.proposedByAvatar}</span>
                <span>@{item.proposedByName}</span>
              </span>
              <span className="tabular-nums-mono">{formatDurationMs(item.song.durationMs)}</span>
            </div>
          </div>
        </div>

        {/* Controles táctiles de votación (min 44x44px) + menú Host */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-stroke/40 pt-2.5 sm:justify-end sm:border-t-0 sm:pt-0">
          <span className="text-[11px] font-medium text-muted sm:hidden">Tu voto</span>
          <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 rounded-xl border border-stroke bg-elevated p-1">
            <button
              type="button"
              onClick={() => onVote(item.id, 1)}
              aria-label={`Votar a favor de ${item.song.title}`}
              aria-pressed={item.userVote === 1}
              className={`flex h-11 w-11 items-center justify-center rounded-lg transition-colors active:scale-95 ${
                item.userVote === 1
                  ? 'bg-neon text-on-neon shadow-neon-green'
                  : 'text-muted hover:bg-card hover:text-neon'
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
              className={`flex h-11 w-11 items-center justify-center rounded-lg transition-colors active:scale-95 ${
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
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-stroke bg-elevated text-muted transition-colors hover:border-brand hover:text-ink"
              >
                <MoreVertical className="h-5 w-5" />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-12 z-30 w-48 rounded-2xl border border-stroke bg-elevated p-1.5 shadow-xl"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onTogglePin(item.id);
                      setMenuOpen(false);
                    }}
                    className="flex min-h-[44px] w-full items-center gap-2 rounded-xl px-3 text-left text-xs font-semibold text-ink hover:bg-card"
                  >
                    <Pin className="h-4 w-4 text-neon" />
                    <span>{item.isPinned ? 'Quitar fijación' : 'Fijar arriba (Pin)'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onPlayNow(item.id);
                      setMenuOpen(false);
                    }}
                    className="flex min-h-[44px] w-full items-center gap-2 rounded-xl px-3 text-left text-xs font-semibold text-ink hover:bg-card"
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
                    className="flex min-h-[44px] w-full items-center gap-2 rounded-xl px-3 text-left text-xs font-semibold text-danger hover:bg-card"
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
