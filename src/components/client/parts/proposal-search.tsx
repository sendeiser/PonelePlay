"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Music2, Search, X } from "lucide-react";
import { demoSearchSuggestions } from "@/lib/demo-data";
import { messageForApiError } from "@/lib/api/error-messages";
import {
  proposeTrack,
  searchYouTube,
  type SearchResult,
} from "@/lib/api/proposals";
import type { QueueItemView } from "@/lib/api/contracts";

interface ProposalSearchProps {
  queue: QueueItemView[];
  proposalsEnabled: boolean;
  proposalsUsed: number;
  maxProposals: number;
  onProposed: () => void;
  onNotify: (message: string, tone?: "ok" | "error" | "info") => void;
  onVoteExisting?: (queueItemId: string) => void;
}

const filterChips = [
  "Top Búsquedas",
  "Rock Nacional",
  "Cachengue",
  "Indie / Pop",
  "Trap / Urbano",
];

export function ProposalSearch({
  queue,
  proposalsEnabled,
  proposalsUsed,
  maxProposals,
  onProposed,
  onNotify,
  onVoteExisting,
}: ProposalSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [activeChip, setActiveChip] = useState("Top Búsquedas");

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
      onNotify(messageForApiError("proposal_limit"), "error");
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
      onProposed();
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : "internal_error";
      onNotify(messageForApiError(code), "error");
    } finally {
      setSubmittingId(null);
    }
  }

  function formatDuration(seconds: number | null): string {
    if (!seconds) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  // Check if a search result is already in the queue
  function findInQueue(item: SearchResult): QueueItemView | undefined {
    return queue.find(
      (q) =>
        q.title.toLowerCase() === item.title.toLowerCase() ||
        (q.artist.toLowerCase() === item.artist.toLowerCase() &&
          q.title.toLowerCase().includes(item.title.toLowerCase().slice(0, 10))),
    );
  }

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="pt-1">
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono text-[11px] text-indigo-400 uppercase tracking-wider font-semibold">
            Catálogo Conectado
          </span>
          <span className="font-mono text-[11px] text-slate-400">
            Cupo: {proposalsUsed}/{maxProposals}
          </span>
        </div>
        <h1 className="text-xl font-bold text-white tracking-tight">Buscar y Proponer</h1>
        <p className="text-xs text-slate-400 mt-1">
          Buscá canciones en YouTube para sumar a la lista y votarla en el salón.
        </p>
      </div>

      {!proposalsEnabled && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 space-y-1">
          <p className="font-bold">Propuestas pausadas</p>
          <p className="text-amber-200/80">La administración del bar pausó temporalmente los nuevos pedidos.</p>
        </div>
      )}

      {cooldownSeconds > 0 && (
        <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-200 flex items-center justify-between font-mono">
          <span>Tiempo de espera entre propuestas:</span>
          <span className="font-bold text-cyan-400">{cooldownSeconds}s</span>
        </div>
      )}

      {/* Search Input Box */}
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
          <Search className="size-4" />
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por artista, canción o link de YouTube..."
          className="w-full h-12 pl-10 pr-10 rounded-xl bg-[#181b25] border border-[#232b42] text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-all shadow-inner"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Filter / Genre Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {filterChips.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => {
              setActiveChip(chip);
              if (chip !== "Top Búsquedas") {
                setQuery(chip);
              }
            }}
            className={`whitespace-nowrap px-3 py-1.5 rounded-full font-mono text-[11px] font-medium transition-all ${
              activeChip === chip
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30 border border-indigo-400/40"
                : "bg-[#181b25] text-slate-400 border border-[#232b42] hover:text-white hover:border-slate-600"
            }`}
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Searching spinner */}
      {searching && (
        <div className="flex items-center justify-center py-8 text-xs text-slate-400 font-mono gap-2">
          <span className="inline-block size-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          <span>Buscando temas en YouTube...</span>
        </div>
      )}

      {/* Results List */}
      {!searching && query.trim() && results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1 font-mono text-[11px] text-slate-400">
            <span>RESULTADOS ({results.length})</span>
            <span className="flex items-center gap-1 text-cyan-400">
              <span className="material-symbols-outlined text-xs">sync</span>
              Sincronizado
            </span>
          </div>

          {results.map((item) => {
            const existingQueueItem = findInQueue(item);

            if (existingQueueItem) {
              return (
                <article
                  key={item.videoId}
                  className="bg-[#181b25] rounded-xl p-3.5 border border-cyan-500/40 flex flex-col gap-3 shadow-md"
                >
                  <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-2.5 flex items-start gap-2">
                    <span className="material-symbols-outlined text-cyan-400 text-base mt-0.5">
                      notification_important
                    </span>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-cyan-300">
                        ¡Ya está en la cola activa!
                      </p>
                      <p className="text-[11px] text-slate-400 leading-snug">
                        Esta canción ya fue propuesta. Sumale tu voto en lugar de duplicarla.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="relative w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-slate-900 border border-[#232b42]">
                      {item.thumbnailUrl ? (
                        <Image
                          src={item.thumbnailUrl}
                          alt={item.title}
                          width={56}
                          height={56}
                          className="w-full h-full object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-600">
                          <Music2 className="size-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-white truncate">
                        {item.title}
                      </h3>
                      <p className="text-xs text-slate-400 truncate mt-0.5">
                        {item.artist} · {formatDuration(item.durationSeconds)}
                      </p>
                    </div>
                  </div>

                  {onVoteExisting ? (
                    <button
                      type="button"
                      onClick={() => onVoteExisting(existingQueueItem.id)}
                      className="w-full py-2.5 px-3 rounded-lg bg-[#232b42] hover:bg-[#2e3957] text-cyan-300 border border-cyan-500/40 font-mono text-xs font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                    >
                      <span className="material-symbols-outlined text-sm">thumb_up</span>
                      <span>En la cola · Sumar voto ({existingQueueItem.voteCount})</span>
                    </button>
                  ) : (
                    <div className="text-center py-2 px-3 rounded-lg bg-[#232b42]/60 text-cyan-300 font-mono text-xs font-bold">
                      En la cola
                    </div>
                  )}
                </article>
              );
            }

            return (
              <article
                key={item.videoId}
                className="bg-[#181b25] rounded-xl p-3.5 border border-[#232b42] hover:border-indigo-500/40 flex flex-col gap-3 shadow-md transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="relative w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-slate-900 border border-[#232b42]">
                    {item.thumbnailUrl ? (
                      <Image
                        src={item.thumbnailUrl}
                        alt={item.title}
                        width={64}
                        height={64}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-600">
                        <Music2 className="size-6" />
                      </div>
                    )}
                    <span className="absolute bottom-1 right-1 bg-black/80 text-[9px] font-mono font-bold text-white px-1 rounded">
                      {formatDuration(item.durationSeconds)}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-white truncate">
                      {item.title}
                    </h3>
                    <p className="text-xs text-slate-400 truncate mt-0.5">
                      {item.artist}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 font-mono text-[10px] text-slate-400">
                      <span className="px-1.5 py-0.5 rounded bg-[#232b42] text-cyan-300">
                        HD 1080p
                      </span>
                      <span>YouTube Music</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={submittingId === item.videoId || !proposalsEnabled || cooldownSeconds > 0}
                  onClick={() => handlePropose(item)}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(99,102,241,0.35)] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submittingId === item.videoId ? (
                    <span className="inline-block size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span className="material-symbols-outlined text-sm">add_to_queue</span>
                  )}
                  <span>
                    {submittingId === item.videoId
                      ? "Proponiendo..."
                      : "Proponer"}
                  </span>
                </button>
              </article>
            );
          })}
        </div>
      )}

      {/* Default suggestions if no query */}
      {!searching && !query.trim() && (
        <div className="space-y-3 pt-2">
          <p className="font-mono text-[11px] text-slate-400 uppercase tracking-wider">
            Sugerencias populares en este bar
          </p>
          <div className="space-y-2">
            {demoSearchSuggestions.slice(0, 5).map((term) => (
              <div
                key={term}
                className="flex items-center justify-between p-3 rounded-xl bg-[#181b25] border border-[#232b42] hover:border-slate-600 transition-colors cursor-pointer"
                onClick={() => setQuery(term)}
              >
                <div className="flex items-center gap-3 min-w-0 pr-2">
                  <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-slate-800 text-indigo-400">
                    <Music2 className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">
                      {term}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      Artista / Banda recomendada
                    </p>
                  </div>
                </div>
                <span className="font-mono text-[11px] text-indigo-300 shrink-0 flex items-center gap-1">
                  Buscar
                  <Search className="size-3" />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
