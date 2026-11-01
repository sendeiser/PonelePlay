"use client";

import { useEffect, useState } from "react";
import { Plus, RefreshCw, Video, Search, Loader2 } from "lucide-react";
import { addTrackByUrl, type TrackRow } from "@/lib/api/catalog";
import { searchYouTube, type SearchResult } from "@/lib/api/proposals";

interface TrackFormProps {
  venueId: string;
  onAdded: (track: TrackRow) => void;
}

export function TrackForm({ venueId, onAdded }: TrackFormProps) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [isExplicit, setIsExplicit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline YouTube search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Auto-fetch metadata if user types or pastes YouTube URL
  useEffect(() => {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (trimmed.includes("youtube.com") || trimmed.includes("youtu.be")) {
      const handler = setTimeout(async () => {
        try {
          const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(trimmed)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.results && data.results[0]) {
              setTitle(data.results[0].title);
              setArtist(data.results[0].artist);
            }
          }
        } catch {}
      }, 300);
      return () => clearTimeout(handler);
    }
  }, [url]);

  // Debounced search for inline queries
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const handler = setTimeout(async () => {
      try {
        const data = await searchYouTube(searchQuery);
        setSearchResults(data);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => clearTimeout(handler);
  }, [searchQuery]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || !title.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const track = await addTrackByUrl(venueId, url, {
        title,
        artist,
        isExplicit,
      });
      onAdded(track);
      setUrl("");
      setTitle("");
      setArtist("");
      setIsExplicit(false);
      setSearchQuery("");
      setSearchResults([]);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Error al agregar canción",
      );
    } finally {
      setLoading(false);
    }
  }

  function handleSelectSearchResult(item: SearchResult) {
    setUrl(`https://www.youtube.com/watch?v=${item.videoId}`);
    setTitle(item.title);
    setArtist(item.artist);
    setSearchResults([]);
    setSearchQuery("");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-[#232b42] bg-[#141824] p-5 space-y-4"
    >
      <div className="flex items-center gap-2 border-b border-[#232b42] pb-3">
        <Video className="size-4 text-rose-400" />
        <h3 className="font-mono text-xs font-bold text-white uppercase tracking-wider">
          Buscar o Pegar Link de YouTube
        </h3>
      </div>

      {error ? (
        <p role="alert" className="text-xs font-mono text-rose-400">
          {error}
        </p>
      ) : null}

      {/* Quick Search */}
      <div>
        <label
          htmlFor="yt-search-quick"
          className="block font-mono text-[10px] uppercase tracking-wider text-slate-400 mb-1"
        >
          Búsqueda rápida en YouTube
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-slate-500" />
          <input
            id="yt-search-quick"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por artista o tema..."
            className="w-full rounded-xl border border-[#232b42] bg-[#0a0e17] pl-8 pr-8 py-2 text-xs text-white placeholder:text-slate-600 font-mono focus:border-indigo-400 focus:outline-none"
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-3.5 text-indigo-400 animate-spin" />
          )}
        </div>

        {/* Search Results Dropdown */}
        {searchResults.length > 0 && (
          <div className="mt-2 max-h-48 overflow-y-auto rounded-xl bg-[#0a0e17] border border-[#232b42] divide-y divide-[#1e2436] shadow-xl">
            {searchResults.map((item) => (
              <div
                key={item.videoId}
                onClick={() => handleSelectSearchResult(item)}
                className="p-2 flex items-center justify-between gap-2 hover:bg-[#181d2c] cursor-pointer transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-white font-bold truncate">
                    {item.title}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">
                    {item.artist} · {item.duration}
                  </p>
                </div>
                <button
                  type="button"
                  className="px-2 py-1 rounded-md bg-indigo-600/30 text-indigo-300 hover:bg-indigo-600 hover:text-white font-mono text-[10px] shrink-0"
                >
                  Seleccionar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <label
          htmlFor="yt-url"
          className="block font-mono text-[10px] uppercase tracking-wider text-slate-400"
        >
          Link del video de YouTube
        </label>
        <input
          id="yt-url"
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          className="mt-1 w-full rounded-xl border border-[#232b42] bg-[#0a0e17] px-3 py-2 text-xs text-white placeholder:text-slate-600 font-mono focus:border-indigo-400 focus:outline-none"
          required
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="track-title"
            className="block font-mono text-[10px] uppercase tracking-wider text-slate-400"
          >
            Título de la canción
          </label>
          <input
            id="track-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ej: De Música Ligera"
            className="mt-1 w-full rounded-xl border border-[#232b42] bg-[#0a0e17] px-3 py-2 text-xs text-white placeholder:text-slate-600 font-mono focus:border-indigo-400 focus:outline-none"
            required
          />
        </div>

        <div>
          <label
            htmlFor="track-artist"
            className="block font-mono text-[10px] uppercase tracking-wider text-slate-400"
          >
            Artista
          </label>
          <input
            id="track-artist"
            type="text"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="ej: Soda Stereo"
            className="mt-1 w-full rounded-xl border border-[#232b42] bg-[#0a0e17] px-3 py-2 text-xs text-white placeholder:text-slate-600 font-mono focus:border-indigo-400 focus:outline-none"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer font-mono text-xs text-slate-300">
        <input
          type="checkbox"
          checked={isExplicit}
          onChange={(e) => setIsExplicit(e.target.checked)}
          className="size-4 rounded accent-indigo-600 bg-[#0a0e17] border border-[#232b42]"
        />
        <span>Contenido explícito</span>
      </label>

      <button
        type="submit"
        disabled={loading || !url.trim() || !title.trim()}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 py-2.5 font-mono text-xs font-bold text-white shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50"
      >
        {loading ? (
          <>
            <RefreshCw className="size-3.5 animate-spin" />
            <span>Agregando...</span>
          </>
        ) : (
          <>
            <Plus className="size-3.5" />
            <span>Agregar al Catálogo</span>
          </>
        )}
      </button>
    </form>
  );
}
