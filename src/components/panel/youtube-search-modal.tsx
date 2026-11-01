"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Check, Loader2, Music2, Plus, Search, X } from "lucide-react";
import { searchYouTube, type SearchResult } from "@/lib/api/proposals";
import { addYouTubeTrackToVenue } from "@/lib/api/playlists";
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
  const [searching, setSearching] = useState(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>(
    defaultPlaylistId || (playlists[0]?.id ?? ""),
  );
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (defaultPlaylistId) {
      setSelectedPlaylistId(defaultPlaylistId);
    } else if (playlists.length > 0 && !selectedPlaylistId) {
      setSelectedPlaylistId(playlists[0].id);
    }
  }, [defaultPlaylistId, playlists, selectedPlaylistId]);

  // Debounced search
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

  if (!isOpen) return null;

  async function handleAdd(item: SearchResult) {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="relative w-full max-w-2xl rounded-2xl bg-[#141824] border border-[#232b42] p-6 shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#232b42]">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-gradient-to-br from-red-600 to-rose-700 flex items-center justify-center text-white shadow-md">
              <span className="material-symbols-outlined text-[20px]">smart_display</span>
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Buscar y Agregar desde YouTube
              </h2>
              <p className="font-mono text-[11px] text-slate-400">
                Búsqueda en tiempo real de videos musicales o links directos
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
          {playlists.length > 0 && (
            <div className="flex items-center gap-3">
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
                className="flex-1 rounded-xl bg-[#0a0e17] border border-[#232b42] px-3 py-2 text-xs font-mono text-white focus:border-indigo-500 focus:outline-none"
              >
                {playlists.map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    Playlist: {pl.name} ({pl.trackCount ?? 0} tracks)
                  </option>
                ))}
                <option value="">Solo Catálogo General (Sin Playlist)</option>
              </select>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Escribí artista, canción o pegá el link de YouTube..."
              className="w-full h-11 pl-10 pr-10 rounded-xl bg-[#0a0e17] border border-[#232b42] text-xs text-white placeholder:text-slate-500 font-mono focus:border-indigo-500 focus:outline-none"
              autoFocus
            />
            {searching && (
              <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 size-4 text-indigo-400 animate-spin" />
            )}
          </div>
        </div>

        {/* Feedback alert */}
        {feedback && (
          <div className="mt-3 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-mono text-xs flex items-center gap-2">
            <Check className="size-4 text-emerald-400" />
            <span>{feedback}</span>
          </div>
        )}

        {/* Search Results List */}
        <div className="mt-4 flex-1 overflow-y-auto space-y-2.5 pr-1">
          {results.map((item) => {
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
                  disabled={isSubmitting || isAdded}
                  onClick={() => void handleAdd(item)}
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

          {!searching && query.trim() && results.length === 0 && (
            <div className="py-12 text-center text-xs font-mono text-slate-500 space-y-1">
              <span className="material-symbols-outlined text-3xl text-slate-600">search_off</span>
              <p>No se encontraron videos para «{query}».</p>
              <p className="text-slate-600">Probá con el título exacto o pegá la URL directa de YouTube.</p>
            </div>
          )}

          {!query.trim() && (
            <div className="py-10 text-center text-xs font-mono text-slate-500">
              <span className="material-symbols-outlined text-3xl text-slate-600 block mb-2">youtube_activity</span>
              Buscá artistas o canciones para sumarlos a tus playlists personalizadas del local.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
