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
  type ProposeInput,
} from "@/lib/api/proposals";
import type { QueueItemView } from "@/lib/api/contracts";
import { PROPOSAL_COOLDOWN_SECONDS, MIN_VOTES_FOR_QUEUE } from "@/lib/domain/queue";
import { sanitizeDedication } from "@/lib/domain/party";

interface ProposalSearchProps {
  slug?: string;
  queue?: QueueItemView[];
  candidates?: QueueItemView[];
  proposalsEnabled?: boolean;
  proposalsUsed?: number;
  maxProposals?: number;
  isPartyMode?: boolean;
  defaultGuestName?: string;
  allowDedications?: boolean;
  allowGuestKaraoke?: boolean;
  minVotesToQueue?: number;
  onProposed?: () => void;
  onNotify?: (message: string, tone?: "ok" | "error" | "info") => void;
  onVoteExisting?: (queueItemId: string) => void;
  onPropose?: (input: ProposeInput) => Promise<void>;
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
  slug,
  queue = [],
  candidates = [],
  proposalsEnabled = true,
  isPartyMode = false,
  defaultGuestName = "",
  allowDedications = true,
  allowGuestKaraoke = true,
  minVotesToQueue = MIN_VOTES_FOR_QUEUE,
  onProposed = () => {},
  onNotify = () => {},
  onVoteExisting,
  onPropose,
}: ProposalSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [activeChip, setActiveChip] = useState("Top Búsquedas");

  // Party Mode Guest Fields
  const [guestName, setGuestName] = useState(defaultGuestName);
  const [dedication, setDedication] = useState("");
  const [isKaraoke, setIsKaraoke] = useState(false);

  useEffect(() => {
    if (defaultGuestName) {
      setGuestName(defaultGuestName);
    }
  }, [defaultGuestName]);

  // Load and sync 2-minute (120s) Cooldown from localStorage (only in Bar mode)
  useEffect(() => {
    if (isPartyMode) {
      setCooldownSeconds(0);
      return;
    }
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
  }, [isPartyMode]);

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

  // Debounced Search (350ms, or immediate in test environments)
  useEffect(() => {
    let active = true;
    if (!query.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const delay = process.env.NODE_ENV === "test" ? 10 : 350;
    const handler = setTimeout(async () => {
      try {
        const isKaraokeSearch = activeChip === "🎤 Karaoke" || isKaraoke;
        const data = await searchYouTube(query, isKaraokeSearch);
        if (active) setResults(data);
      } catch {
        if (active) setResults([]);
      } finally {
        if (active) setSearching(false);
      }
    }, delay);

    return () => {
      active = false;
      clearTimeout(handler);
    };
  }, [query, activeChip, isKaraoke]);

  async function handlePropose(item: SearchResult) {
    if (!isPartyMode && cooldownSeconds > 0) {
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
      const payload: ProposeInput = {
        title: item.title,
        artist: item.artist,
        durationSeconds: item.durationSeconds,
        youtubeVideoId: item.videoId,
        thumbnailUrl: item.thumbnailUrl,
      };

      const cleanName = guestName.trim();
      const cleanDedication = sanitizeDedication(dedication);
      if (cleanName) payload.guestName = cleanName;
      if (cleanDedication && allowDedications) payload.dedication = cleanDedication;
      if (isKaraoke && allowGuestKaraoke) payload.isKaraoke = true;
      if (slug) {
        payload.slug = slug;
        payload.isPartyMode = isPartyMode || Boolean(cleanDedication || cleanName);
      }

      if (onPropose) {
        await onPropose(payload);
      } else {
        await proposeTrack(payload);
      }

      if (isPartyMode) {
        if (minVotesToQueue <= 1) {
          onNotify(`🎉 ¡«${item.title}» entró directo a la cola de la fiesta!`, "ok");
        } else {
          onNotify(
            `🎉 «${item.title}» fue propuesta. Con ${minVotesToQueue} votos sube a la cola.`,
            "ok",
          );
        }
        setDedication("");
      } else {
        onNotify(`«${item.title}» fue propuesta. Con 5 votos entra a la cola.`, "ok");
        setCooldownSeconds(PROPOSAL_COOLDOWN_SECONDS);
        try {
          localStorage.setItem(LAST_PROPOSAL_KEY, Date.now().toString());
        } catch {
          // localStorage fallback
        }
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
          <span className="font-mono text-[11px] text-th-accent uppercase tracking-wider font-semibold flex items-center gap-1.5">
            <Sparkles className="size-3 text-th-accent" />
            {isPartyMode ? "🎉 Modo Fiesta · Todo Desbloqueado" : "Propuestas Libres"}
          </span>
          {!isPartyMode && (
            <span className="font-mono text-[11px] text-th-muted">
              {cooldownSeconds > 0 ? (
                <span className="text-th-amber font-bold">
                  ⏳ Esperá {formatRemainingTime(cooldownSeconds)}
                </span>
              ) : (
                <span className="text-th-emerald font-semibold">
                  ✓ Límite de 2 min
                </span>
              )}
            </span>
          )}
        </div>
        <h1 className="font-display text-xl font-bold text-th-text tracking-tight">
          Buscar y Proponer
        </h1>
        <p className="text-xs text-th-muted mt-1">
          {isPartyMode ? (
            minVotesToQueue <= 1 ? (
              <>
                Pedí cualquier tema sin códigos ni esperas. <strong>Entra directo a la cola de la TV</strong>.
              </>
            ) : (
              <>
                Pedí tus temas favoritos. Al sumar <strong>{minVotesToQueue} votos</strong> de los invitados, suben a la cola de la TV.
              </>
            )
          ) : (
            <>
              Proponé tus temas favoritos. Al acumular <strong>5 votos</strong> en el salón, entran automáticamente a la cola de la TV.
            </>
          )}
        </p>
      </div>

      {/* Guest Name, Dedication & Karaoke Toggle */}
      {(isPartyMode || allowDedications) && (
        <div className="card-panel rounded-xl border-th-accent/25 p-3.5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="ui-label">
                👤 Tu Nombre o Apodo
              </label>
              <input
                type="text"
                maxLength={32}
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Ej: Tincho, La Banda, Mesa VIP..."
                className="ui-input text-xs"
              />
            </div>

            {allowDedications && (
              <div>
                <label className="ui-label">
                  💬 Dedicatoria para la TV (Opcional)
                </label>
                <input
                  type="text"
                  maxLength={90}
                  value={dedication}
                  onChange={(e) => setDedication(e.target.value)}
                  placeholder="¡Feliz cumple! Para bailar todos juntos 🍻"
                  className="ui-input text-xs"
                />
              </div>
            )}
          </div>

          {allowGuestKaraoke && (
            <label className="flex items-center justify-between gap-3 rounded-lg bg-th-recessed border border-th-accent/25 px-3 py-2 cursor-pointer">
              <div className="flex items-center gap-2">
                <span className="text-sm">🎤</span>
                <span className="text-xs font-bold text-th-accent">
                  Quiero cantarla en Karaoke (Con letra en la TV)
                </span>
              </div>
              <input
                type="checkbox"
                checked={isKaraoke}
                onChange={(e) => setIsKaraoke(e.target.checked)}
                className="size-4 accent-th-accent rounded cursor-pointer"
              />
            </label>
          )}
        </div>
      )}

      {!isPartyMode && cooldownSeconds > 0 && (
        <div className="p-3 rounded-xl bg-th-amber-soft border border-th-amber/30 text-xs text-th-amber flex items-center gap-2.5">
          <span className="material-symbols-outlined text-lg text-th-amber">timer</span>
          <div>
            <span className="font-bold">Límite de 2 minutos activo: </span>
            <span>Podrás proponer otra canción en <strong>{formatRemainingTime(cooldownSeconds)}</strong>.</span>
          </div>
        </div>
      )}

      {!proposalsEnabled && (
        <div className="p-3 rounded-xl bg-th-amber-soft border border-th-amber/30 text-xs text-th-amber space-y-1">
          <p className="font-bold">Propuestas pausadas</p>
          <p className="opacity-85">La administración pausó temporalmente los nuevos pedidos.</p>
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
          className="ui-input pl-10 pr-24 py-3.5 text-sm font-mono"
        />
        <Search className="absolute left-3.5 top-4 size-4 text-th-muted pointer-events-none" />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Limpiar búsqueda"
              className="text-th-muted hover:text-th-text p-1"
            >
              <X className="size-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handlePaste()}
              disabled={!proposalsEnabled}
              title="Pegar link del portapapeles"
              className="px-2 py-1 rounded-lg bg-th-recessed hover:bg-th-accent-soft border border-th-border text-th-secondary hover:text-th-accent font-mono text-[11px] flex items-center gap-1 transition-all active:scale-95 disabled:opacity-50"
            >
              <ClipboardPaste className="size-3.5 text-th-accent" />
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
              className={`px-3 py-1.5 rounded-full text-xs font-mono font-semibold whitespace-nowrap transition-all ${
                isActive
                  ? "bg-th-accent text-th-on-accent shadow-xs"
                  : "bg-th-card text-th-secondary hover:text-th-text hover:bg-th-recessed border border-th-border"
              }`}
            >
              {chip}
            </button>
          );
        })}
      </div>

      {/* Search Results */}
      {searching && (
        <div className="flex items-center justify-center py-10 text-th-muted font-mono text-xs gap-2">
          <span className="inline-block size-4 border-2 border-th-accent border-t-transparent rounded-full animate-spin" />
          <span>Buscando en YouTube...</span>
        </div>
      )}

      {!searching && query.trim() && results.length === 0 && (
        <div className="text-center py-12 px-4 rounded-xl border border-dashed border-th-border bg-th-card/60">
          <Music2 className="size-8 mx-auto text-th-muted mb-2" />
          <p className="text-sm font-bold text-th-text">No encontramos resultados</p>
          <p className="text-xs text-th-muted mt-1">
            Probá con otro título o pegá el link directo de YouTube.
          </p>
        </div>
      )}

      {!searching && results.length > 0 && (
        <div className="space-y-3 max-h-[500px] pr-1 ui-scroll-container">
          {results.map((item) => {
            const existingQueueItem = findInQueue(item);
            const existingCandidate = findInCandidates(item);

            // 1. If already in active playback queue
            if (existingQueueItem) {
              return (
                <article
                  key={item.videoId}
                  className="card-panel rounded-xl p-3.5 border-th-teal/40 flex flex-col gap-3"
                >
                  <div className="bg-th-teal-soft border border-th-teal/30 rounded-lg p-2.5 flex items-start gap-2">
                    <span className="material-symbols-outlined text-th-teal text-base mt-0.5">
                      check_circle
                    </span>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-th-teal">
                        ¡Ya está en la cola del salón!
                      </p>
                      <p className="text-[11px] text-th-secondary leading-snug">
                        Esta canción ya está lista para sonar en la TV. Sumale tu voto para que suene antes.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="relative w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-th-recessed border border-th-border">
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
                        <div className="w-full h-full flex items-center justify-center text-th-muted">
                          <Music2 className="size-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-th-text truncate">
                        {item.title}
                      </h3>
                      <p className="text-xs text-th-muted truncate mt-0.5">
                        {item.artist} · {formatDuration(item.durationSeconds)}
                      </p>
                    </div>
                  </div>

                  {onVoteExisting ? (
                    <button
                      type="button"
                      onClick={() => onVoteExisting(existingQueueItem.id)}
                      className="w-full py-2.5 px-3 rounded-lg bg-th-teal-soft hover:bg-th-teal/20 text-th-teal border border-th-teal/40 font-mono text-xs font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                    >
                      <span className="material-symbols-outlined text-sm">thumb_up</span>
                      <span>En la cola · Sumar voto ({existingQueueItem.voteCount})</span>
                    </button>
                  ) : (
                    <div className="text-center py-2 px-3 rounded-lg bg-th-teal-soft text-th-teal font-mono text-xs font-bold">
                      En la cola
                    </div>
                  )}
                </article>
              );
            }

            // 2. If already in candidate proposals
            if (existingCandidate) {
              const needed = Math.max(0, minVotesToQueue - existingCandidate.voteCount);
              return (
                <article
                  key={item.videoId}
                  className="card-panel rounded-xl p-3.5 border-th-amber/40 flex flex-col gap-3"
                >
                  <div className="bg-th-amber-soft border border-th-amber/30 rounded-lg p-2.5 flex items-start gap-2">
                    <Sparkles className="size-4 text-th-amber mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs font-bold text-th-amber">
                        ¡Ya está en votación popular ({existingCandidate.voteCount}/{minVotesToQueue} votos)!
                      </p>
                      <p className="text-[11px] text-th-secondary leading-snug">
                        {needed === 1 ? "¡Falta solo 1 voto para que pase a la cola del salón!" : `Faltan ${needed} votos para que pase a la cola del salón.`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="relative w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-th-recessed border border-th-border">
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
                        <div className="w-full h-full flex items-center justify-center text-th-muted">
                          <Music2 className="size-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-th-text truncate">
                        {item.title}
                      </h3>
                      <p className="text-xs text-th-muted truncate mt-0.5">
                        {item.artist} · {formatDuration(item.durationSeconds)}
                      </p>
                    </div>
                  </div>

                  {onVoteExisting ? (
                    <button
                      type="button"
                      onClick={() => onVoteExisting(existingCandidate.id)}
                      className="w-full py-2.5 px-3 rounded-lg bg-th-amber-soft hover:bg-th-amber/20 text-th-amber border border-th-amber/40 font-mono text-xs font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                    >
                      <span className="material-symbols-outlined text-sm">how_to_vote</span>
                      <span>Votar propuesta ({existingCandidate.voteCount}/{minVotesToQueue})</span>
                    </button>
                  ) : (
                    <div className="text-center py-2 px-3 rounded-lg bg-th-amber-soft text-th-amber font-mono text-xs font-bold">
                      En votación ({existingCandidate.voteCount}/{minVotesToQueue})
                    </div>
                  )}
                </article>
              );
            }

            // 3. New track that can be proposed
            const isBlockedByCooldown = !isPartyMode && cooldownSeconds > 0;

            return (
              <article
                key={item.videoId}
                className="card-panel rounded-xl p-3.5 hover:border-th-accent/45 flex flex-col gap-3 transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="relative w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-th-recessed border border-th-border">
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
                      <div className="w-full h-full flex items-center justify-center text-th-muted">
                        <Music2 className="size-6" />
                      </div>
                    )}
                    <span className="absolute bottom-1 right-1 bg-black/80 text-[9px] font-mono font-bold text-white px-1 rounded tabular-nums">
                      {formatDuration(item.durationSeconds)}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-th-text truncate">
                      {item.title}
                    </h3>
                    <p className="text-xs text-th-muted truncate mt-0.5">
                      {item.artist}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 font-mono text-[10px] text-th-muted">
                      <span className="px-1.5 py-0.5 rounded bg-th-teal-soft text-th-teal font-semibold">
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
                  className="w-full py-2.5 px-4 rounded-xl bg-th-accent hover:bg-th-accent-hover text-th-on-accent font-bold text-xs flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
          <p className="font-mono text-[11px] text-th-muted uppercase tracking-wider">
            {isPartyMode ? "Sugerencias fiesteras populares" : "Sugerencias populares en este bar"}
          </p>
          <div className="space-y-2">
            {demoSearchSuggestions.slice(0, 5).map((term) => (
              <div
                key={term}
                className="flex items-center justify-between p-3 rounded-xl bg-th-card border border-th-border hover:border-th-border-strong transition-colors cursor-pointer"
                onClick={() => setQuery(term)}
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-sm text-th-accent">trending_up</span>
                  <span className="text-sm text-th-text font-medium">{term}</span>
                </div>
                <span className="material-symbols-outlined text-sm text-th-muted">north_west</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
