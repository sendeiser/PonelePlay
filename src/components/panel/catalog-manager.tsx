"use client";

import { useEffect, useState, useCallback } from "react";
import { Archive, Music, Plus, RefreshCw, Search } from "lucide-react";
import { SourceBadge } from "@/components/source-badge";
import { TrackForm } from "./track-form";
import { UploadTrack } from "./upload-track";
import { FallbackList } from "./fallback-list";
import {
  archiveTrack,
  fetchCatalog,
  fetchFallback,
  type TrackRow,
} from "@/lib/api/catalog";
import { createBrowserSupabase } from "@/lib/api/supabase/browser";

interface CatalogManagerProps {
  slug: string;
  venueId?: string;
}

export function CatalogManager({ slug, venueId: propVenueId }: CatalogManagerProps) {
  const [venueId, setVenueId] = useState<string | null>(propVenueId || null);
  const [tab, setTab] = useState<"catalog" | "fallback" | "add">("catalog");
  const [tracks, setTracks] = useState<TrackRow[]>([]);
  const [fallbackTracks, setFallbackTracks] = useState<TrackRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Resolve venueId if not provided
  useEffect(() => {
    if (propVenueId) {
      setVenueId(propVenueId);
      return;
    }

    async function resolveVenue() {
      const supabase = createBrowserSupabase();
      const { data } = await supabase
        .from("venues")
        .select("id")
        .eq("slug", slug)
        .single();

      if (data && typeof data === "object" && "id" in data) {
        setVenueId(String((data as { id: string }).id));
      }
    }

    void resolveVenue();
  }, [slug, propVenueId]);

  const loadData = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    setError(null);
    try {
      const [cat, fb] = await Promise.all([
        fetchCatalog(venueId),
        fetchFallback(venueId),
      ]);
      setTracks(cat);
      setFallbackTracks(fb);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Error al cargar el catálogo",
      );
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleArchive(trackId: string) {
    try {
      await archiveTrack(trackId);
      setTracks((prev) =>
        prev.map((t) => (t.id === trackId ? { ...t, status: "archived" } : t)),
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Error al archivar la canción",
      );
    }
  }

  const filteredTracks = tracks.filter((t) => {
    const q = search.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-cream/10 pb-5">
        <div>
          <h1 className="text-2xl font-display font-bold text-cream">
            Catálogo y Respaldo
          </h1>
          <p className="mt-1 text-xs text-cream/50">
            Administrá las canciones disponibles para el local y la lista de respaldo
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab("catalog")}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === "catalog"
                ? "bg-amber text-[#041611]"
                : "border border-cream/10 text-cream/70 hover:bg-cream/5"
            }`}
          >
            Canciones ({tracks.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("fallback")}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === "fallback"
                ? "bg-amber text-[#041611]"
                : "border border-cream/10 text-cream/70 hover:bg-cream/5"
            }`}
          >
            Lista de Respaldo ({fallbackTracks.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("add")}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === "add"
                ? "bg-amber text-[#041611]"
                : "border border-cream/10 text-cream/70 hover:bg-cream/5"
            }`}
          >
            <Plus className="size-3.5" />
            Sumar canción
          </button>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-coral/30 bg-coral/10 p-3 text-xs text-coral"
        >
          {error}
        </div>
      ) : null}

      {!venueId ? (
        <div className="py-12 text-center font-mono text-xs text-cream/40">
          Cargando datos del local...
        </div>
      ) : null}

      {/* Tab: Catalog List */}
      {venueId && tab === "catalog" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-2.5 size-4 text-cream/30" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por título o artista..."
                className="w-full rounded-xl border border-cream/10 bg-white/5 pl-9 pr-3 py-2 text-xs text-cream placeholder:text-cream/30 focus:border-amber focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => void loadData()}
              className="grid size-8 place-items-center rounded-lg border border-cream/10 text-cream/60 hover:text-cream"
              aria-label="Actualizar catálogo"
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          {filteredTracks.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-cream/10 bg-white/[0.015]">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-cream/10 font-mono text-[10px] uppercase text-cream/40">
                    <th className="p-3 pl-4">Canción</th>
                    <th className="p-3">Origen</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3 pr-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream/5">
                  {filteredTracks.map((track) => (
                    <tr key={track.id} className="hover:bg-white/[0.02]">
                      <td className="p-3 pl-4">
                        <p className="font-semibold text-cream">
                          {track.title}
                        </p>
                        <p className="text-[11px] text-cream/50">
                          {track.artist}
                        </p>
                      </td>
                      <td className="p-3">
                        <SourceBadge source={track.source} />
                      </td>
                      <td className="p-3">
                        <span
                          className={`rounded-md px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
                            track.status === "active"
                              ? "bg-mint/15 text-mint"
                              : "bg-cream/10 text-cream/40"
                          }`}
                        >
                          {track.status === "active" ? "Activa" : "Archivada"}
                        </span>
                      </td>
                      <td className="p-3 pr-4 text-right">
                        {track.status === "active" ? (
                          <button
                            type="button"
                            onClick={() => void handleArchive(track.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-coral/20 px-2 py-1 text-[11px] font-medium text-coral hover:bg-coral/10"
                            aria-label={`Archivar ${track.title}`}
                          >
                            <Archive className="size-3" />
                            Archivar
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-cream/10 p-12 text-center text-xs text-cream/40">
              <Music className="mx-auto size-8 text-cream/20 mb-2" />
              No se encontraron canciones en el catálogo.
            </div>
          )}
        </div>
      ) : null}

      {/* Tab: Fallback Playlist */}
      {venueId && tab === "fallback" ? (
        <FallbackList
          venueId={venueId}
          tracks={fallbackTracks}
          onOrderSaved={() => void loadData()}
        />
      ) : null}

      {/* Tab: Add Tracks */}
      {venueId && tab === "add" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <TrackForm
            venueId={venueId}
            onAdded={(newTrack) => {
              setTracks((prev) => [newTrack, ...prev]);
              setTab("catalog");
            }}
          />
          <UploadTrack
            venueId={venueId}
            onUploaded={(newTrack) => {
              setTracks((prev) => [newTrack, ...prev]);
              setTab("catalog");
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
