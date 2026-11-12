"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Check, ListMusic, RefreshCw, Trash2 } from "lucide-react";
import { BallChip } from "@/components/ball-chip";
import { SourceBadge } from "@/components/source-badge";
import { reorderFallback, type TrackRow } from "@/lib/api/catalog";

interface FallbackListProps {
  venueId: string;
  tracks: TrackRow[];
  onOrderSaved?: () => void;
}

export function FallbackList({
  venueId,
  tracks: initialTracks,
  onOrderSaved,
}: FallbackListProps) {
  const [tracks, setTracks] = useState<TrackRow[]>(initialTracks);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function move(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= tracks.length) return;

    const copy = [...tracks];
    const temp = copy[index];
    copy[index] = copy[targetIndex];
    copy[targetIndex] = temp;
    setTracks(copy);
    setSavedSuccess(false);
  }

  function remove(index: number) {
    const copy = tracks.filter((_, i) => i !== index);
    setTracks(copy);
    setSavedSuccess(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const ids = tracks.map((t) => t.id);
      await reorderFallback(venueId, ids);
      setSavedSuccess(true);
      onOrderSaved?.();
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Error al guardar orden de respaldo",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-sm font-bold text-th-text flex items-center gap-2">
            <ListMusic className="size-4 text-th-accent" />
            Lista de Respaldo (Fallback)
          </h3>
          <p className="text-xs text-th-muted mt-0.5">
            Canciones que suenan cuando la cola de votación queda vacía
          </p>
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="flex items-center gap-1.5 rounded-xl bg-th-accent hover:bg-th-accent-hover px-3.5 py-2 font-mono text-xs font-semibold text-th-on-accent shadow-sm disabled:opacity-50 transition-colors"
        >
          {saving ? (
            <RefreshCw className="size-3.5 animate-spin" />
          ) : savedSuccess ? (
            <Check className="size-3.5" />
          ) : null}
          {savedSuccess ? "Guardado" : "Guardar orden"}
        </button>
      </div>

      {error ? (
        <p role="alert" className="text-xs font-mono text-th-danger">
          {error}
        </p>
      ) : null}

      {tracks.length > 0 ? (
        <ul className="max-h-[420px] min-h-0 rounded-xl bg-th-recessed border border-th-border p-2.5 space-y-2 ui-scroll-container">
          {tracks.map((track, idx) => (
            <li
              key={track.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-th-border bg-th-card p-3 hover:border-th-border-strong transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <BallChip n={idx + 1} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-th-text">
                    {track.title}
                  </p>
                  <p className="truncate text-[11px] text-th-muted">
                    {track.artist}
                  </p>
                </div>
                <SourceBadge source={track.source} />
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => move(idx, "up")}
                  className="grid size-7 place-items-center rounded-lg border border-th-border text-th-secondary hover:text-th-text hover:bg-th-card-hover disabled:opacity-25 transition-colors"
                  aria-label="Subir"
                >
                  <ArrowUp className="size-3.5" />
                </button>
                <button
                  type="button"
                  disabled={idx === tracks.length - 1}
                  onClick={() => move(idx, "down")}
                  className="grid size-7 place-items-center rounded-lg border border-th-border text-th-secondary hover:text-th-text hover:bg-th-card-hover disabled:opacity-25 transition-colors"
                  aria-label="Bajar"
                >
                  <ArrowDown className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  className="grid size-7 place-items-center rounded-lg border border-th-danger/25 text-th-danger hover:bg-th-danger-soft transition-colors"
                  aria-label="Quitar de respaldo"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-th-border p-8 text-center text-xs font-mono text-th-muted">
          No hay canciones en la lista de respaldo.
        </div>
      )}
    </div>
  );
}

