"use client";

import { useEffect, useState } from "react";
import { Check, Info, Music2, Plus, Search, X } from "lucide-react";
import { demoSearchSuggestions } from "@/lib/demo-data";
import { messageForApiError } from "@/lib/api/error-messages";
import {
  proposeTrack,
  searchYouTube,
  type SearchResult,
} from "@/lib/api/proposals";
import type { QueueItemView } from "@/lib/api/contracts";
import { cn } from "@/lib/cn";

interface ProposalSearchProps {
  queue: QueueItemView[];
  proposalsEnabled: boolean;
  proposalsUsed: number;
  maxProposals: number;
  onProposed: () => void;
  onNotify: (message: string, tone?: "ok" | "error" | "info") => void;
}

export function ProposalSearch({
  queue,
  proposalsEnabled,
  proposalsUsed,
  maxProposals,
  onProposed,
  onNotify,
}: ProposalSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // 30s Cooldown timer
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  // Debounced Search (350ms)
  useEffect(() => {
    let active = true;
    if (!query.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const handler = setTimeout(async () => {
      try {
        const data = await searchYouTube(query);
        if (active) setResults(data);
      } catch {
        if (active) setResults([]);
      } finally {
        if (active) setSearching(false);
      }
    }, 350);

    return () => {
      active = false;
      clearTimeout(handler);
    };
  }, [query]);

  async function handlePropose(item: SearchResult) {
    if (cooldownSeconds > 0) {
      onNotify(
        `Esperá ${cooldownSeconds}s antes de proponer otro tema.`,
        "error",
      );
      return;
    }

    if (proposalsUsed >= maxProposals) {
      onNotify(
        messageForApiError("proposal_limit"),
        "error",
      );
      return;
    }

    setSubmittingId(item.videoId);
    try {
      await proposeTrack({
        title: item.title,
        artist: item.artist,
        durationSeconds: item.durationSeconds,
        youtubeVideoId: item.videoId,
        thumbnailUrl: item.thumbnailUrl,
      });

      onNotify(`«${item.title}» entró a la cola.`, "ok");
      setCooldownSeconds(30);
      setQuery("");
      onProposed();
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : "unknown";
      onNotify(messageForApiError(code), "error");
    } finally {
      setSubmittingId(null);
    }
  }

  if (!proposalsEnabled) {
    return (
      <div className="mt-8 flex flex-col items-center rounded-3xl border border-dashed border-cream/15 px-6 py-12 text-center">
        <Info className="size-10 text-amber/60" aria-hidden="true" />
        <h2 className="mt-4 font-display text-lg font-bold text-cream">
          Propuestas pausadas
        </h2>
        <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-cream/50">
          El bar pausó temporalmente las propuestas de canciones. Podés seguir votando los temas de la cola.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-cream/40">
            Sumá tu tema
          </p>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-cream">
            Poné tu canción
          </h1>
        </div>
        <span className="rounded-full border border-mint/25 bg-mint/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-mint">
          {maxProposals - proposalsUsed} disponibles
        </span>
      </div>

      {cooldownSeconds > 0 ? (
        <div
          role="status"
          className="mt-4 rounded-xl border border-amber/30 bg-amber/10 px-3.5 py-2 font-mono text-xs text-amber"
        >
          Próxima propuesta en {cooldownSeconds}s
        </div>
      ) : null}

      {/* Search Bar */}
      <label className="mt-5 flex items-center gap-2 rounded-2xl border border-cream/10 bg-white/[0.03] px-4 py-3 focus-within:border-amber/50">
        <Search className="size-4 shrink-0 text-cream/35" aria-hidden="true" />
        <span className="sr-only">Buscar canción o pegar link</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Artista, canción o link de YouTube..."
          className="w-full bg-transparent text-sm text-cream outline-none placeholder:text-cream/30"
          autoComplete="off"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="grid size-6 place-items-center rounded-full bg-cream/10 text-cream/50 hover:text-cream"
            aria-label="Borrar búsqueda"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </label>

      {/* Search Suggestions */}
      {!query ? (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {demoSearchSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setQuery(suggestion)}
              className="shrink-0 rounded-full border border-cream/10 bg-cream/5 px-3 py-1.5 text-[11px] text-cream/60 transition-colors hover:border-amber/40 hover:text-cream"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

      {/* Results Header */}
      {query ? (
        <div className="mt-6 flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-cream/40">
            {searching ? "Buscando..." : `Resultados (${results.length})`}
          </p>
        </div>
      ) : null}

      {/* Results List */}
      {results.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {results.map((item) => {
            const alreadyInQueue = queue.some(
              (qi) =>
                qi.title.toLowerCase() === item.title.toLowerCase() ||
                (qi.trackId && item.videoId.includes(qi.trackId)),
            );
            const isSubmitting = submittingId === item.videoId;

            return (
              <li
                key={item.videoId}
                className="flex items-center gap-3 rounded-2xl border border-cream/10 bg-white/[0.025] p-2.5"
              >
                <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-felt-700 to-felt-900 text-cream/40">
                  <Music2 className="size-5" aria-hidden="true" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-cream">
                    {item.title}
                  </p>
                  <p className="truncate text-[11px] text-cream/45">
                    {item.artist} · {item.duration}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={alreadyInQueue || isSubmitting || cooldownSeconds > 0}
                  onClick={() => void handlePropose(item)}
                  className={cn(
                    "flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-[11px] font-bold transition-all",
                    alreadyInQueue
                      ? "cursor-default bg-cream/5 text-cream/35 border border-cream/10"
                      : "bg-amber text-[#041611] hover:bg-amber/90 active:scale-95 disabled:opacity-50",
                  )}
                >
                  {alreadyInQueue ? (
                    <>
                      <Check className="size-3.5 text-mint" aria-hidden="true" />
                      En la cola
                    </>
                  ) : (
                    <>
                      <Plus className="size-3.5" aria-hidden="true" />
                      {isSubmitting ? "Sumando..." : "Proponer"}
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : query && !searching ? (
        <div className="mt-10 flex flex-col items-center text-center">
          <Music2 className="size-8 text-cream/25" aria-hidden="true" />
          <p className="mt-3 font-display text-lg font-bold text-cream">
            No encontramos ese tema
          </p>
          <p className="mt-1 max-w-xs text-xs text-cream/40">
            Probá con el nombre del artista o pegá el link directo del video.
          </p>
        </div>
      ) : null}

      <p className="mt-6 flex items-start gap-2 px-1 text-[11px] leading-relaxed text-cream/35">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Las propuestas son gratuitas y entran directo a la cola. Máximo {maxProposals} por noche y 1 cada 30 segundos.
      </p>
    </div>
  );
}

