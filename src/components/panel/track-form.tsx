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
      className="rounded-2xl border border-th-border bg-th-recessed/50 p-5 space-y-4"
    >
      <div className="flex items-center gap-2 border-b border-th-border pb-3">
        <Video className="size-4 text-rose-500" />
        <h3 className="font-mono text-xs font-bold text-th-text uppercase tracking-wider">
          Buscar o Pegar Link de YouTube
        </h3>
      </div>

      {error ? (
        <p role="alert" className="text-xs font-mono text-th-danger">
          {error}
        </p>
      ) : null}

      {/* Quick Search */}
      <div>
        <label htmlFor="yt-search-quick" className="ui-label mb-1">
          Búsqueda rápida en YouTube
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-th-muted pointer-events-none" />
          <input
            id="yt-search-quick"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por artista o tema..."
            className="ui-input !pl-9 !pr-8"
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-3.5 text-th-accent animate-spin" />
          )}
        </div>

        {/* Search Results Dropdown */}
        {searchResults.length > 0 && (
          <div className="mt-2 max-h-48 ui-scroll-container rounded-xl bg-th-card border border-th-border divide-y divide-th-border shadow-lg">
            {searchResults.map((item) => (
              <div
                key={item.videoId}
                onClick={() => handleSelectSearchResult(item)}
                className="p-2.5 flex items-center justify-between gap-2 hover:bg-th-card-hover cursor-pointer transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-th-text font-semibold truncate">
                    {item.title}
                  </p>
                  <p className="text-[10px] text-th-muted truncate">
                    {item.artist} · {item.duration}
                  </p>
                </div>
                <button
                  type="button"
                  className="px-2.5 py-1 rounded-lg bg-th-accent-soft text-th-accent hover:bg-th-accent hover:text-th-on-accent font-mono text-[10px] font-semibold shrink-0 transition-colors"
                >
                  Seleccionar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <label htmlFor="yt-url" className="ui-label">
          Link del video de YouTube
        </label>
        <input
          id="yt-url"
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          className="ui-input mt-1"
          required
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="track-title" className="ui-label">
            Título de la canción
          </label>
          <input
            id="track-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ej: De Música Ligera"
            className="ui-input mt-1"
            required
          />
        </div>

        <div>
          <label htmlFor="track-artist" className="ui-label">
            Artista
          </label>
          <input
            id="track-artist"
            type="text"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="ej: Soda Stereo"
            className="ui-input mt-1"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer font-mono text-xs text-th-secondary">
        <input
          type="checkbox"
          checked={isExplicit}
          onChange={(e) => setIsExplicit(e.target.checked)}
          className="size-4 rounded accent-blue-600 bg-th-recessed border border-th-border"
        />
        <span>Contenido explícito</span>
      </label>

      <button
        type="submit"
        disabled={loading || !url.trim() || !title.trim()}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-th-accent hover:bg-th-accent-hover py-2.5 font-mono text-xs font-semibold text-th-on-accent shadow-sm transition-all disabled:opacity-50"
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
