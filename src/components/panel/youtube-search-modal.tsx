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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="relative w-full max-w-2xl rounded-2xl bg-[#141824] border border-[#232b42] p-6 shadow-2xl flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#232b42]">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-gradient-to-br from-red-600 to-rose-700 flex items-center justify-center text-white shadow-md">
              <span className="material-symbols-outlined text-[20px]">smart_display</span>
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>Buscar y Agregar desde YouTube</span>
                <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-300 border border-red-500/20 text-[10px] font-mono font-bold">
                  Videos & Playlists
                </span>
              </h2>
              <p className="font-mono text-[11px] text-slate-400">
                Pegá links de videos individuales o listas de reproducción enteras
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="size-8 rounded-lg bg-[#1c2130] text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Destination Playlist Selector & Search input */}
        <div className="pt-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            {playlists.length > 0 ? (
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <label
                  htmlFor="target-playlist-select"
                  className="font-mono text-xs text-slate-300 shrink-0"
                >
                  Destino:
                </label>
                <select
                  id="target-playlist-select"
                  value={selectedPlaylistId}
                  onChange={(e) => setSelectedPlaylistId(e.target.value)}
                  className="flex-1 rounded-xl bg-[#0a0e17] border border-[#232b42] px-3 py-2 text-xs font-mono text-white focus:border-indigo-500 focus:outline-none truncate"
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
              className={`px-3 py-2 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-1.5 border shrink-0 ${
                isKaraoke
                  ? "bg-pink-600/30 text-pink-300 border-pink-500/60 shadow-md shadow-pink-500/20"
                  : "bg-[#0a0e17] text-slate-400 border-[#232b42] hover:text-white"
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">
                {isKaraoke ? "mic_external_on" : "mic"}
              </span>
              <span>{isKaraoke ? "🎤 Filtro Karaoke (ON)" : "🎤 Karaoke"}</span>
            </button>
          </div>

          {/* Search Input with Paste & Clear Buttons */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
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
              className="w-full h-11 pl-10 pr-24 rounded-xl bg-[#0a0e17] border border-[#232b42] text-xs text-white placeholder:text-slate-500 font-mono focus:border-indigo-500 focus:outline-none"
              autoFocus
            />

            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {searching && (
                <Loader2 className="size-4 text-indigo-400 animate-spin mr-1" />
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
                  className="size-7 rounded-lg text-slate-400 hover:text-white hover:bg-[#232b42] flex items-center justify-center transition-colors"
                >
                  <X className="size-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handlePaste()}
                  title="Pegar link del portapapeles"
                  className="px-2 py-1 rounded-lg bg-[#1c2130] hover:bg-indigo-600/40 text-slate-300 hover:text-white font-mono text-[11px] flex items-center gap-1 border border-[#2a324b] transition-all active:scale-95 shadow-sm"
                >
                  <ClipboardPaste className="size-3.5 text-indigo-400" />
                  <span>Pegar</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Feedback alert */}
        {feedback && (
          <div className="mt-3 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-mono text-xs flex items-center gap-2 animate-fade-in">
            <Check className="size-4 text-emerald-400 shrink-0" />
            <span>{feedback}</span>
          </div>
        )}

        {/* PLAYLIST DETECTED HERO BANNER */}
        {playlistInfo && (
          <div className="mt-3 p-3.5 rounded-xl bg-gradient-to-r from-red-950/40 via-indigo-950/30 to-[#181b25] border border-red-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-3 min-w-0">
              <div className="size-11 rounded-xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-400 shrink-0 shadow-inner">
                <ListMusic className="size-6" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-red-500/20 text-red-300 border border-red-500/30 font-bold uppercase">
                    Playlist Detectada
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    {playlistInfo.tracks.length} temas cargados
                  </span>
                </div>
                <h3 className="text-xs font-bold text-white truncate mt-0.5">
                  {playlistInfo.title}
                </h3>
                <p className="text-[10px] font-mono text-slate-400 truncate">
                  Canal: {playlistInfo.author}
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={batchImporting}
              onClick={() => void handleImportEntirePlaylist()}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-indigo-600 hover:from-red-500 hover:to-indigo-500 text-white font-mono text-xs font-bold shadow-lg shadow-red-600/25 flex items-center justify-center gap-1.5 transition-all active:scale-95 shrink-0"
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
            <span className="font-mono text-[11px] text-slate-400">Mostrar:</span>
            <button
              type="button"
              onClick={() => setViewMode("playlist")}
              className={`px-2.5 py-1 rounded-lg font-mono text-[11px] transition-all border ${
                viewMode === "playlist"
                  ? "bg-indigo-600/30 text-indigo-300 border-indigo-500/50 font-bold"
                  : "bg-[#0a0e17] text-slate-400 border-[#232b42] hover:text-white"
              }`}
            >
              📂 Toda la lista ({playlistInfo.tracks.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode("single")}
              className={`px-2.5 py-1 rounded-lg font-mono text-[11px] transition-all border ${
                viewMode === "single"
                  ? "bg-indigo-600/30 text-indigo-300 border-indigo-500/50 font-bold"
                  : "bg-[#0a0e17] text-slate-400 border-[#232b42] hover:text-white"
              }`}
            >
              ▶ Solo este video («{singleVideoInfo.title.slice(0, 20)}...»)
            </button>
          </div>
        )}

        {/* Search Results List */}
        <div className="mt-3 flex-1 overflow-y-auto space-y-2.5 pr-1">
          {displayedTracks.map((item) => {
            const isAdded = addedIds.has(item.videoId);
            const isSubmitting = addingId === item.videoId;

            return (
              <div
                key={item.videoId}
                className="p-3 rounded-xl bg-[#181b25] border border-[#232b42] flex items-center justify-between gap-3 hover:border-indigo-500/40 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="relative size-12 rounded-lg overflow-hidden bg-black shrink-0 border border-[#2a3148]">
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
                      <div className="w-full h-full flex items-center justify-center text-slate-500">
                        <Music2 className="size-5" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-white truncate leading-tight">
                      {item.title}
                    </h4>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">
                      {item.artist}
                    </p>
                    <span className="font-mono text-[10px] text-indigo-300">
                      ⏱ {item.duration}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isSubmitting || isAdded || batchImporting}
                  onClick={() => void handleAddSingle(item)}
                  className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 ${
                    isAdded
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30"
                  }`}
                >
                  {isSubmitting ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : isAdded ? (
                    <>
                      <Check className="size-3.5 text-emerald-400" />
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
            <div className="py-12 text-center text-xs font-mono text-slate-500 space-y-1">
              <span className="material-symbols-outlined text-3xl text-slate-600">search_off</span>
              <p>No se encontraron videos ni listas para «{query}».</p>
              <p className="text-slate-600">Probá con el título o pegá el link directo de YouTube.</p>
            </div>
          )}

          {!query.trim() && (
            <div className="py-10 text-center text-xs font-mono text-slate-500 space-y-2">
              <span className="material-symbols-outlined text-3xl text-slate-600 block mb-1">
                youtube_activity
              </span>
              <p>Buscá artistas o canciones para sumarlos a tus playlists del local.</p>
              <p className="text-slate-600 text-[11px]">
                Tip: Podés copiar un link de Playlist en YouTube y hacer click en <strong>«Pegar»</strong> para importar toda la lista de una vez.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
