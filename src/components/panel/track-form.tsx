"use client";

import { useState } from "react";
import { Plus, RefreshCw, Video } from "lucide-react";
import { addTrackByUrl, type TrackRow } from "@/lib/api/catalog";

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
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Error al agregar canción",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-cream/10 bg-white/[0.02] p-5 space-y-4"
    >
      <div className="flex items-center gap-2 border-b border-cream/10 pb-3">
        <Video className="size-4 text-coral" />
        <h3 className="font-display text-sm font-bold text-cream">
          Agregar desde YouTube
        </h3>
      </div>

      {error ? (
        <p role="alert" className="text-xs text-coral">
          {error}
        </p>
      ) : null}

      <div>
        <label
          htmlFor="yt-url"
          className="block font-mono text-[10px] uppercase tracking-wider text-cream/50"
        >
          Link del video de YouTube
        </label>
        <input
          id="yt-url"
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          className="mt-1 w-full rounded-xl border border-cream/15 bg-white/5 px-3 py-2 text-xs text-cream placeholder:text-cream/25 focus:border-amber focus:outline-none"
          required
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="track-title"
            className="block font-mono text-[10px] uppercase tracking-wider text-cream/50"
          >
            Título de la canción
          </label>
          <input
            id="track-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ej: De Música Ligera"
            className="mt-1 w-full rounded-xl border border-cream/15 bg-white/5 px-3 py-2 text-xs text-cream placeholder:text-cream/25 focus:border-amber focus:outline-none"
            required
          />
        </div>

        <div>
          <label
            htmlFor="track-artist"
            className="block font-mono text-[10px] uppercase tracking-wider text-cream/50"
          >
            Artista o Banda
          </label>
          <input
            id="track-artist"
            type="text"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="ej: Soda Stereo"
            className="mt-1 w-full rounded-xl border border-cream/15 bg-white/5 px-3 py-2 text-xs text-cream placeholder:text-cream/25 focus:border-amber focus:outline-none"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer pt-1">
        <input
          type="checkbox"
          checked={isExplicit}
          onChange={(e) => setIsExplicit(e.target.checked)}
          className="size-4 rounded border-cream/20 bg-white/5 text-amber focus:ring-0"
        />
        <span className="text-xs text-cream/70">
          Marcar como contenido explícito
        </span>
      </label>

      <button
        type="submit"
        disabled={loading || !url.trim() || !title.trim()}
        className="flex items-center justify-center gap-1.5 w-full rounded-xl bg-amber py-2.5 font-display text-xs font-bold text-[#041611] hover:bg-amber/90 disabled:opacity-50"
      >
        {loading ? (
          <RefreshCw className="size-3.5 animate-spin" />
        ) : (
          <Plus className="size-3.5" />
        )}
        Agregar al catálogo
      </button>
    </form>
  );
}

