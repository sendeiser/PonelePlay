"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Music2, Search, Sparkles, X, ClipboardPaste } from "lucide-react";
import { demoSearchSuggestions } from "@/lib/demo-data";
import { messageForApiError } from "@/lib/api/error-messages";
import {
  proposeTrack,
  searchYouTube,
  type SearchResult,
} from "@/lib/api/proposals";
import type { QueueItemView } from "@/lib/api/contracts";
import { PROPOSAL_COOLDOWN_SECONDS, MIN_VOTES_FOR_QUEUE } from "@/lib/domain/queue";

interface ProposalSearchProps {
  queue: QueueItemView[];
  candidates?: QueueItemView[];
  proposalsEnabled: boolean;
  proposalsUsed?: number;
  maxProposals?: number;
  onProposed: () => void;
  onNotify: (message: string, tone?: "ok" | "error" | "info") => void;
  onVoteExisting?: (queueItemId: string) => void;
}

const filterChips = [
  "Top Búsquedas",
  "🎤 Karaoke",
  "Rock Nacional",
  "Cachengue",
  "Indie / Pop",
  "Trap / Urbano",
];

const LAST_PROPOSAL_KEY = "poneleplay_last_proposal_timestamp";

export function ProposalSearch({
  queue,
  candidates = [],
  proposalsEnabled,
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

  // Load and sync 2-minute (120s) Cooldown from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAST_PROPOSAL_KEY);
      if (saved) {
        const elapsed = (Date.now() - parseInt(saved, 10)) / 1000;
        const remaining = Math.max(0, Math.ceil(PROPOSAL_COOLDOWN_SECONDS - elapsed));
        if (remaining > 0) {
          setCooldownSeconds(remaining);
        }
      }
    } catch {
      // Ignore localStorage access errors
    }
  }, []);

  // 1-second countdown tick
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  async function handlePaste() {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) {
        setQuery(clip.trim());
        onNotify("Enlace pegado", "info");
      }
    } catch {
      // Permission blocked or not available
    }
  }

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
        const isKaraokeSearch = activeChip === "🎤 Karaoke";
        const data = await searchYouTube(query, isKaraokeSearch);
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
  }, [query, activeChip]);

  async function handlePropose(item: SearchResult) {
    if (cooldownSeconds > 0) {
      const mins = Math.floor(cooldownSeconds / 60);
      const secs = (cooldownSeconds % 60).toString().padStart(2, "0");
      onNotify(
        `Debés esperar ${mins}:${secs} antes de proponer otra canción (límite de 2 min).`,
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

      onNotify(`«${item.title}» fue propuesta. Con 5 votos entra a la cola.`, "ok");
      setCooldownSeconds(PROPOSAL_COOLDOWN_SECONDS);
      try {
        localStorage.setItem(LAST_PROPOSAL_KEY, Date.now().toString());
      } catch {
        // localStorage fallback
      }
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

  // Check if track is already in the playback queue
  function findInQueue(item: SearchResult): QueueItemView | undefined {
    return queue.find(
      (q) =>
        (item.videoId && q.youtubeVideoId && q.youtubeVideoId === item.videoId) ||
        q.title.toLowerCase() === item.title.toLowerCase() ||
        (q.artist.toLowerCase() === item.artist.toLowerCase() &&
          q.title.toLowerCase().includes(item.title.toLowerCase().slice(0, 10))),
    );
  }

  // Check if track is already in candidate proposals
  function findInCandidates(item: SearchResult): QueueItemView | undefined {
    return candidates.find(
      (c) =>
        (item.videoId && c.youtubeVideoId && c.youtubeVideoId === item.videoId) ||
        c.title.toLowerCase() === item.title.toLowerCase() ||
        (c.artist.toLowerCase() === item.artist.toLowerCase() &&
          c.title.toLowerCase().includes(item.title.toLowerCase().slice(0, 10))),
    );
  }

  const formatRemainingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
  };

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="pt-1">
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono text-[11px] text-indigo-400 uppercase tracking-wider font-semibold flex items-center gap-1.5">
            <Sparkles className="size-3 text-indigo-400" />
            Propuestas Libres
          </span>
          <span className="font-mono text-[11px] text-slate-400">
            {cooldownSeconds > 0 ? (
              <span className="text-amber-400 font-bold">
                ⏳ Esperá {formatRemainingTime(cooldownSeconds)}
              </span>
            ) : (
              <span className="text-emerald-400 font-medium">
                ✓ Límite de 2 min
              </span>
            )}
          </span>
        </div>
        <h1 className="text-xl font-bold text-white tracking-tight">Buscar y Proponer</h1>
        <p className="text-xs text-slate-400 mt-1">
          Proponé tus temas favoritos. Al acumular <strong>5 votos</strong> en el salón, entran automáticamente a la cola de la TV.
        </p>
      </div>

      {cooldownSeconds > 0 && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-200 flex items-center gap-2.5">
          <span className="material-symbols-outlined text-lg text-amber-400">timer</span>
          <div>
            <span className="font-bold">Límite de 2 minutos activo: </span>
            <span>Podrás proponer otra canción en <strong>{formatRemainingTime(cooldownSeconds)}</strong>.</span>
          </div>
        </div>
      )}

      {!proposalsEnabled && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 space-y-1">
          <p className="font-bold">Propuestas pausadas</p>
          <p className="text-amber-200/80">La administración del bar pausó temporalmente los nuevos pedidos.</p>
        </div>
      )}

      {/* Search Input Bar */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Artista, canción o link de YouTube/playlist..."
          disabled={!proposalsEnabled}
          className="w-full bg-[#181b25] text-white placeholder-slate-500 text-sm rounded-xl pl-10 pr-24 py-3.5 border border-[#232b42] focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
        />
        <Search className="absolute left-3.5 top-4 size-4 text-slate-400 pointer-events-none" />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-slate-400 hover:text-white p-1"
            >
              <X className="size-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handlePaste()}
              disabled={!proposalsEnabled}
              title="Pegar link del portapapeles"
              className="px-2 py-1 rounded-lg bg-[#232b42] hover:bg-indigo-600/40 text-slate-300 hover:text-white font-mono text-[11px] flex items-center gap-1 transition-all active:scale-95 disabled:opacity-50"
            >
              <ClipboardPaste className="size-3.5 text-indigo-400" />
              <span>Pegar</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {filterChips.map((chip) => {
          const isActive = activeChip === chip;
          return (
            <button
              key={chip}
              type="button"
              onClick={() => {
                setActiveChip(chip);
                if (chip === "🎤 Karaoke" && !query.includes("karaoke")) {
                  setQuery((q) => (q ? `${q} karaoke` : "karaoke"));
                }
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-mono font-medium whitespace-nowrap transition-all ${
                isActive
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "bg-[#181b25] text-slate-400 hover:text-white hover:bg-[#202534] border border-[#232b42]"
              }`}
            >
              {chip}
            </button>
          );
        })}
      </div>

      {/* Search Results */}
      {searching && (
        <div className="flex items-center justify-center py-10 text-slate-500 font-mono text-xs gap-2">
          <span className="inline-block size-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span>Buscando en YouTube...</span>
        </div>
      )}

      {!searching && query.trim() && results.length === 0 && (
        <div className="text-center py-12 px-4 rounded-xl border border-dashed border-[#232b42] bg-[#181b25]/50">
          <Music2 className="size-8 mx-auto text-slate-600 mb-2" />
          <p className="text-sm font-bold text-white">No encontramos resultados</p>
          <p className="text-xs text-slate-400 mt-1">
            Probá con otro título o pegá el link directo de YouTube.
          </p>
        </div>
      )}

      {!searching && results.length > 0 && (
        <div className="space-y-3">
          {results.map((item) => {
            const existingQueueItem = findInQueue(item);
            const existingCandidate = findInCandidates(item);

            // 1. If already in active playback queue (5+ votes)
            if (existingQueueItem) {
              return (
                <article
                  key={item.videoId}
                  className="bg-[#181b25] rounded-xl p-3.5 border border-cyan-500/40 flex flex-col gap-3 shadow-md"
                >
                  <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-2.5 flex items-start gap-2">
                    <span className="material-symbols-outlined text-cyan-400 text-base mt-0.5">
                      check_circle
                    </span>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-cyan-300">
                        ¡Ya está en la cola del salón!
                      </p>
                      <p className="text-[11px] text-slate-400 leading-snug">
                        Esta canción ya tiene 5+ votos y va a sonar en la TV. Sumale tu voto para que suene antes.
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

            // 2. If already in candidate proposals (< 5 votes)
            if (existingCandidate) {
              const needed = Math.max(0, MIN_VOTES_FOR_QUEUE - existingCandidate.voteCount);
              return (
                <article
                  key={item.videoId}
                  className="bg-[#181b25] rounded-xl p-3.5 border border-amber-500/40 flex flex-col gap-3 shadow-md"
                >
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 flex items-start gap-2">
                    <Sparkles className="size-4 text-amber-400 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs font-bold text-amber-300">
                        ¡Ya está en votación popular ({existingCandidate.voteCount}/{MIN_VOTES_FOR_QUEUE} votos)!
                      </p>
                      <p className="text-[11px] text-slate-400 leading-snug">
                        {needed === 1 ? "¡Falta solo 1 voto para que pase a la cola del salón!" : `Faltan ${needed} votos para que pase a la cola del salón.`}
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
                      onClick={() => onVoteExisting(existingCandidate.id)}
                      className="w-full py-2.5 px-3 rounded-lg bg-gradient-to-r from-amber-600/30 to-indigo-600/30 hover:from-amber-600/40 hover:to-indigo-600/40 text-amber-200 border border-amber-500/40 font-mono text-xs font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                    >
                      <span className="material-symbols-outlined text-sm">how_to_vote</span>
                      <span>Votar propuesta ({existingCandidate.voteCount}/{MIN_VOTES_FOR_QUEUE})</span>
                    </button>
                  ) : (
                    <div className="text-center py-2 px-3 rounded-lg bg-[#232b42]/60 text-amber-300 font-mono text-xs font-bold">
                      En votación ({existingCandidate.voteCount}/{MIN_VOTES_FOR_QUEUE})
                    </div>
                  )}
                </article>
              );
            }

            // 3. New track that can be proposed
            const isBlockedByCooldown = cooldownSeconds > 0;

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
                  disabled={submittingId === item.videoId || !proposalsEnabled || isBlockedByCooldown}
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
                      : isBlockedByCooldown
                        ? `Esperá ${formatRemainingTime(cooldownSeconds)}`
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
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-sm text-slate-400">trending_up</span>
                  <span className="text-sm text-white font-medium">{term}</span>
                </div>
                <span className="material-symbols-outlined text-sm text-slate-500">north_west</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
