"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Check, ClipboardPaste, ListMusic, Loader2, Music2, Plus, Search, X } from "lucide-react";
import {
  searchYouTubeWithDetails,
  type SearchResult,
  type YouTubePlaylistInfo,
} from "@/lib/api/proposals";
import { addYouTubeTrackToVenue, addYouTubePlaylistToVenue } from "@/lib/api/playlists";
import type { VenuePlaylist } from "@/lib/api/playlists";

interface YouTubeSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  venueId: string;
  playlists: VenuePlaylist[];
  defaultPlaylistId?: string | null;
  onTrackAdded?: () => void;
}

export function YouTubeSearchModal({
  isOpen,
  onClose,
  venueId,
  playlists,
  defaultPlaylistId,
  onTrackAdded,
}: YouTubeSearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [playlistInfo, setPlaylistInfo] = useState<YouTubePlaylistInfo | null>(null);
  const [singleVideoInfo, setSingleVideoInfo] = useState<SearchResult | null>(null);
  const [viewMode, setViewMode] = useState<"playlist" | "single">("playlist");

  const [searching, setSearching] = useState(false);
  const [isKaraoke, setIsKaraoke] = useState(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>(
    defaultPlaylistId || (playlists[0]?.id ?? ""),
  );
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [batchImporting, setBatchImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (defaultPlaylistId) {
      setSelectedPlaylistId(defaultPlaylistId);
    } else if (playlists.length > 0 && !selectedPlaylistId) {
      setSelectedPlaylistId(playlists[0].id);
    }
  }, [defaultPlaylistId, playlists, selectedPlaylistId]);

  // Debounced search & playlist detection
  useEffect(() => {
    let active = true;
    const trimmed = query.trim();

    if (!trimmed) {
      setResults([]);
      setPlaylistInfo(null);
      setSingleVideoInfo(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    const handler = setTimeout(async () => {
      try {
        const data = await searchYouTubeWithDetails(trimmed, isKaraoke);
        if (!active) return;

        if (data.playlist && data.playlist.tracks.length > 0) {
          setPlaylistInfo(data.playlist);
          setSingleVideoInfo(data.singleVideo || null);
          setViewMode("playlist");
          setResults(data.playlist.tracks);
        } else {
          setPlaylistInfo(null);
          setSingleVideoInfo(null);
          setResults(data.results || []);
        }
      } catch {
        if (active) {
          setResults([]);
          setPlaylistInfo(null);
          setSingleVideoInfo(null);
        }
      } finally {
        if (active) setSearching(false);
      }
    }, 350);

    return () => {
      active = false;
      clearTimeout(handler);
    };
  }, [query, isKaraoke]);

  if (!isOpen) return null;

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setQuery(text.trim());
        setFeedback("📋 Enlace pegado del portapapeles.");
        setTimeout(() => setFeedback(null), 2500);
      }
    } catch {
      const el = document.getElementById("yt-modal-search-input");
      el?.focus();
    }
  }

  async function handleAddSingle(item: SearchResult) {
    setAddingId(item.videoId);
    setFeedback(null);
    try {
      await addYouTubeTrackToVenue(
        venueId,
        {
          videoId: item.videoId,
          title: item.title,
          artist: item.artist,
          durationSeconds: item.durationSeconds,
          thumbnailUrl: item.thumbnailUrl,
        },
        selectedPlaylistId || undefined,
      );

      setAddedIds((prev) => new Set(prev).add(item.videoId));
      setFeedback(`«${item.title}» agregada con éxito.`);
      onTrackAdded?.();
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: unknown) {
      setFeedback(err instanceof Error ? err.message : "Error al agregar tema");
    } finally {
      setAddingId(null);
    }
  }

  async function handleImportEntirePlaylist() {
    if (!playlistInfo || playlistInfo.tracks.length === 0) return;
    setBatchImporting(true);
    setImportProgress({ current: 0, total: playlistInfo.tracks.length });
    setFeedback(null);

    try {
      const result = await addYouTubePlaylistToVenue(
        venueId,
        playlistInfo.tracks,
        selectedPlaylistId || undefined,
        (current, total) => {
          setImportProgress({ current, total });
        },
      );

      setAddedIds((prev) => {
        const next = new Set(prev);
        playlistInfo.tracks.forEach((t) => next.add(t.videoId));
        return next;
      });

      const targetPlaylistName =
        playlists.find((p) => p.id === selectedPlaylistId)?.name || "Catálogo General";
      setFeedback(`¡${result.added} canciones agregadas a «${targetPlaylistName}» con éxito!`);
      onTrackAdded?.();
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: unknown) {
      setFeedback(err instanceof Error ? err.message : "Error al importar lista");
    } finally {
      setBatchImporting(false);
    }
  }

  const displayedTracks =
    viewMode === "single" && singleVideoInfo ? [singleVideoInfo] : results;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl rounded-2xl card-panel p-6 shadow-2xl flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-th-border">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-rose-600 flex items-center justify-center text-white shadow-sm">
              <span className="material-symbols-outlined text-[20px]">smart_display</span>
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-th-text tracking-tight flex flex-wrap items-center gap-2">
                <span>Buscar y Agregar desde YouTube</span>
                <span className="px-2 py-0.5 rounded-full bg-rose-500/12 text-rose-500 border border-rose-500/25 text-[10px] font-mono font-bold">
                  Videos & Playlists
                </span>
              </h2>
              <p className="font-mono text-[11px] text-th-muted">
                Pegá links de videos individuales o listas de reproducción enteras
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="size-8 rounded-lg bg-th-recessed border border-th-border text-th-muted hover:text-th-text hover:bg-th-card-hover flex items-center justify-center transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Destination Playlist Selector & Search input */}
        <div className="pt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {playlists.length > 0 ? (
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <label
                  htmlFor="target-playlist-select"
                  className="font-mono text-xs font-semibold text-th-secondary shrink-0"
                >
                  Destino:
                </label>
                <select
                  id="target-playlist-select"
                  value={selectedPlaylistId}
                  onChange={(e) => setSelectedPlaylistId(e.target.value)}
                  className="ui-input !py-2 truncate flex-1"
                >
                  {playlists.map((pl) => (
                    <option key={pl.id} value={pl.id}>
                      Playlist: {pl.name} ({pl.trackCount ?? 0} tracks)
                    </option>
                  ))}
                  <option value="">Solo Catálogo General (Sin Playlist)</option>
                </select>
              </div>
            ) : <div />}

            {/* Karaoke Mode Toggle Button */}
            <button
              type="button"
              onClick={() => setIsKaraoke((prev) => !prev)}
              className={`px-3 py-2 rounded-xl font-mono text-xs font-semibold transition-all flex items-center gap-1.5 border shrink-0 ${
                isKaraoke
                  ? "bg-pink-600 text-white border-pink-600 shadow-sm"
                  : "bg-th-recessed text-th-secondary border-th-border hover:text-th-text"
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">
                {isKaraoke ? "mic_external_on" : "mic"}
              </span>
              <span>{isKaraoke ? "Filtro Karaoke (ON)" : "Karaoke"}</span>
            </button>
          </div>

          {/* Search Input with Paste & Clear Buttons */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-th-muted pointer-events-none" />
            <input
              id="yt-modal-search-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                isKaraoke
                  ? "Buscando karaoke más vistos o pegá link de playlist..."
                  : "Escribí artista, canción o pegá link de video / playlist..."
              }
              className="ui-input !h-11 !pl-10 !pr-24"
              autoFocus
            />

            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {searching && (
                <Loader2 className="size-4 text-th-accent animate-spin mr-1" />
              )}

              {query ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setResults([]);
                    setPlaylistInfo(null);
                    setSingleVideoInfo(null);
                  }}
                  title="Limpiar búsqueda"
                  className="size-7 rounded-lg text-th-muted hover:text-th-text hover:bg-th-card-hover flex items-center justify-center transition-colors"
                >
                  <X className="size-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handlePaste()}
                  title="Pegar link del portapapeles"
                  className="px-2.5 py-1 rounded-lg bg-th-recessed hover:bg-th-accent-soft text-th-secondary hover:text-th-accent font-mono text-[11px] font-semibold flex items-center gap-1 border border-th-border transition-all active:scale-95"
                >
                  <ClipboardPaste className="size-3.5 text-th-accent" />
                  <span>Pegar</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Feedback alert */}
        {feedback && (
          <div className="mt-3 p-2.5 rounded-xl bg-th-emerald-soft border border-th-emerald/30 text-th-emerald font-mono text-xs flex items-center gap-2 animate-fade-in">
            <Check className="size-4 shrink-0" />
            <span>{feedback}</span>
          </div>
        )}

        {/* PLAYLIST DETECTED HERO BANNER */}
        {playlistInfo && (
          <div className="mt-3 p-3.5 rounded-xl bg-th-recessed border border-rose-500/35 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="size-11 rounded-xl bg-rose-500/15 border border-rose-500/35 flex items-center justify-center text-rose-500 shrink-0">
                <ListMusic className="size-6" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-rose-500/15 text-rose-500 border border-rose-500/30 font-bold uppercase">
                    Playlist Detectada
                  </span>
                  <span className="text-[11px] font-mono text-th-muted">
                    {playlistInfo.tracks.length} temas cargados
                  </span>
                </div>
                <h3 className="text-xs font-bold text-th-text truncate mt-0.5">
                  {playlistInfo.title}
                </h3>
                <p className="text-[10px] font-mono text-th-muted truncate">
                  Canal: {playlistInfo.author}
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={batchImporting}
              onClick={() => void handleImportEntirePlaylist()}
              className="px-3.5 py-2 rounded-xl bg-th-accent hover:bg-th-accent-hover text-th-on-accent font-mono text-xs font-semibold shadow-sm flex items-center justify-center gap-1.5 transition-all active:scale-95 shrink-0"
            >
              {batchImporting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>
                    Importando {importProgress.current}/{importProgress.total}...
                  </span>
                </>
              ) : (
                <>
                  <Plus className="size-3.5" />
                  <span>Agregar toda la lista ({playlistInfo.tracks.length})</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Selector between Playlist vs Single Video if both exist in the URL */}
        {playlistInfo && singleVideoInfo && (
          <div className="mt-2.5 flex items-center gap-2">
            <span className="font-mono text-[11px] text-th-muted">Mostrar:</span>
            <button
              type="button"
              onClick={() => setViewMode("playlist")}
              className={`px-2.5 py-1 rounded-lg font-mono text-[11px] transition-all border ${
                viewMode === "playlist"
                  ? "bg-th-accent-soft text-th-accent border-th-accent/40 font-semibold"
                  : "bg-th-recessed text-th-secondary border-th-border hover:text-th-text"
              }`}
            >
              Toda la lista ({playlistInfo.tracks.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode("single")}
              className={`px-2.5 py-1 rounded-lg font-mono text-[11px] transition-all border ${
                viewMode === "single"
                  ? "bg-th-accent-soft text-th-accent border-th-accent/40 font-semibold"
                  : "bg-th-recessed text-th-secondary border-th-border hover:text-th-text"
              }`}
            >
              Solo este video («{singleVideoInfo.title.slice(0, 20)}...»)
            </button>
          </div>
        )}

        {/* Search Results List */}
        <div className="mt-3 flex-1 min-h-0 ui-scroll-container space-y-2 pr-1">
          {displayedTracks.map((item) => {
            const isAdded = addedIds.has(item.videoId);
            const isSubmitting = addingId === item.videoId;

            return (
              <div
                key={item.videoId}
                className="p-3 rounded-xl bg-th-recessed border border-th-border flex items-center justify-between gap-3 hover:border-th-accent/40 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="relative size-12 rounded-lg overflow-hidden bg-th-card shrink-0 border border-th-border">
                    {item.thumbnailUrl ? (
                      <Image
                        src={item.thumbnailUrl}
                        alt={item.title}
                        width={48}
                        height={48}
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
                    <h4 className="text-xs font-bold text-th-text truncate leading-tight">
                      {item.title}
                    </h4>
                    <p className="text-[11px] text-th-secondary truncate mt-0.5">
                      {item.artist}
                    </p>
                    <span className="font-mono text-[10px] text-th-accent">
                      {item.duration}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isSubmitting || isAdded || batchImporting}
                  onClick={() => void handleAddSingle(item)}
                  className={`px-3 py-1.5 rounded-lg font-mono text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 ${
                    isAdded
                      ? "bg-th-emerald-soft text-th-emerald border border-th-emerald/35"
                      : "bg-th-accent hover:bg-th-accent-hover text-th-on-accent shadow-sm"
                  }`}
                >
                  {isSubmitting ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : isAdded ? (
                    <>
                      <Check className="size-3.5" />
                      <span>Agregada</span>
                    </>
                  ) : (
                    <>
                      <Plus className="size-3.5" />
                      <span>Agregar</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}

          {!searching && query.trim() && displayedTracks.length === 0 && (
            <div className="py-12 text-center text-xs font-mono text-th-muted space-y-1">
              <span className="material-symbols-outlined text-3xl text-th-muted">search_off</span>
              <p>No se encontraron videos ni listas para «{query}».</p>
              <p className="text-th-muted/80">Probá con el título o pegá el link directo de YouTube.</p>
            </div>
          )}

          {!query.trim() && (
            <div className="py-10 text-center text-xs font-mono text-th-muted space-y-2">
              <span className="material-symbols-outlined text-3xl text-th-muted block mb-1">
                youtube_activity
              </span>
              <p>Buscá artistas o canciones para sumarlos a tus playlists del local.</p>
              <p className="text-th-muted/80 text-[11px]">
                Tip: Podés copiar un link de Playlist en YouTube y hacer click en <strong>«Pegar»</strong> para importar toda la lista de una vez.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
