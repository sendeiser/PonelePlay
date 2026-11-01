"use client";

import { useEffect, useState, useCallback } from "react";
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

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
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

  const totalMinutes = tracks.reduce((acc, t) => acc + (t.durationSeconds ?? 0), 0) / 60;

  return (
    <div className="space-y-6">
      {/* SECTION HEADER & METRIC TILES */}
      <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-4 border-b border-[#1E2333]">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs text-cyan-400 mb-1">
            <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20">
              SALÓN PRINCIPAL · AMBIENTACIÓN
            </span>
            <span className="text-slate-500">/panel/{slug}/catalogo</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Gestión de Catálogo & Playlist de Fondo
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Configuración del loop acústico continuo cuando no existan solicitudes pagas activas en la cola.
          </p>
        </div>

        {/* Cabecera Metrics Deck */}
        <div className="grid grid-cols-3 gap-3 min-w-[420px] font-mono text-xs">
          <div className="p-3 rounded-xl bg-[#181b25] border border-[#232b42] flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase">
              <span>TOTAL CATÁLOGO</span>
              <span className="material-symbols-outlined text-sm text-indigo-400">library_music</span>
            </div>
            <div className="mt-2">
              <span className="text-xl font-bold text-white">{tracks.length}</span>
              <span className="text-indigo-300 ml-1 font-bold">Tracks</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#181b25] border border-[#232b42] flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase">
              <span>TIEMPO TOTAL</span>
              <span className="material-symbols-outlined text-sm text-cyan-400">timelapse</span>
            </div>
            <div className="mt-2">
              <span className="text-xl font-bold text-white">{Math.round(totalMinutes)}m</span>
              <span className="text-slate-400 block text-[10px]">Playlist de Fondo</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#181b25] border border-[#232b42] flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase">
              <span>FALLBACK LOOP</span>
              <span className="material-symbols-outlined text-sm text-emerald-400">repeat</span>
            </div>
            <div className="mt-2">
              <span className="text-xl font-bold text-emerald-400">{fallbackTracks.length}</span>
              <span className="text-slate-400 ml-1 text-[10px]">Activas</span>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/60 p-3 text-xs text-red-200 flex items-center gap-2 font-mono">
          <span className="material-symbols-outlined text-base text-red-400">error</span>
          <span>{error}</span>
        </div>
      )}

      {/* Tabs navigation bar */}
      <div className="flex items-center gap-2 border-b border-[#1E2333] pb-3">
        <button
          type="button"
          onClick={() => setTab("catalog")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-xs font-bold transition-all ${
            tab === "catalog"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
              : "bg-[#181b25] text-slate-400 hover:text-white border border-[#232b42]"
          }`}
        >
          <span className="material-symbols-outlined text-base">library_music</span>
          <span>Catálogo de Canciones ({tracks.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setTab("fallback")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-xs font-bold transition-all ${
            tab === "fallback"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
              : "bg-[#181b25] text-slate-400 hover:text-white border border-[#232b42]"
          }`}
        >
          <span className="material-symbols-outlined text-base">queue_music</span>
          <span>Playlist de Fondo ({fallbackTracks.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setTab("add")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-xs font-bold transition-all ${
            tab === "add"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
              : "bg-[#181b25] text-slate-400 hover:text-white border border-[#232b42]"
          }`}
        >
          <span className="material-symbols-outlined text-base">add_circle</span>
          <span>+ Agregar Canción</span>
        </button>
      </div>

      {/* Tab 1: Catalog view */}
      {tab === "catalog" && (
        <div className="card-panel rounded-2xl p-6 shadow-2xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1E2333]">
            <div className="relative flex-1 max-w-md">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-base">
                search
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrar por título, artista..."
                className="w-full h-10 pl-9 pr-3 rounded-xl bg-[#0a0e17] border border-[#232b42] text-xs text-white placeholder:text-slate-500 font-mono focus:outline-none focus:border-indigo-400"
              />
            </div>

            <button
              type="button"
              onClick={() => void loadData()}
              className="size-10 rounded-xl border border-[#232b42] text-slate-400 hover:text-white hover:bg-[#181b25] flex items-center justify-center transition-colors"
            >
              <span className="material-symbols-outlined text-base">refresh</span>
            </button>
          </div>

          {loading && tracks.length === 0 ? (
            <p className="text-center py-12 text-xs font-mono text-slate-500">
              Cargando catálogo...
            </p>
          ) : filteredTracks.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 font-mono space-y-2">
              <span className="material-symbols-outlined text-slate-600 text-3xl">music_off</span>
              <p>No se encontraron canciones en el catálogo.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-[#1E2333] text-slate-500 text-[10px] uppercase">
                    <th className="py-2.5 px-3">Canción</th>
                    <th className="py-2.5 px-3">Artista</th>
                    <th className="py-2.5 px-3">Fuente</th>
                    <th className="py-2.5 px-3">Duración</th>
                    <th className="py-2.5 px-3">Estado</th>
                    <th className="py-2.5 px-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2333]/50">
                  {filteredTracks.map((t) => (
                    <tr key={t.id} className="hover:bg-[#181b25]/50 transition-colors">
                      <td className="py-3 px-3 font-bold text-white">
                        {t.title}
                      </td>
                      <td className="py-3 px-3 text-slate-400">
                        {t.artist}
                      </td>
                      <td className="py-3 px-3">
                        <SourceBadge source={t.source} />
                      </td>
                      <td className="py-3 px-3 text-slate-400">
                        {formatDuration(t.durationSeconds)}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            t.status === "active"
                              ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                              : "bg-slate-800 text-slate-500 border border-slate-700"
                          }`}
                        >
                          {t.status === "active" ? "Activo" : "Archivado"}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        {t.status === "active" && (
                          <button
                            type="button"
                            onClick={() => void handleArchive(t.id)}
                            className="px-2.5 py-1 rounded-md bg-[#181b25] border border-[#232b42] text-slate-400 hover:text-red-400 text-[11px] transition-colors"
                          >
                            Archivar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Fallback List */}
      {tab === "fallback" && venueId && (
        <div className="card-panel rounded-2xl p-6 shadow-2xl">
          <FallbackList
            venueId={venueId}
            tracks={fallbackTracks}
            onOrderSaved={() => void loadData()}
          />
        </div>
      )}

      {/* Tab 3: Add Track */}
      {tab === "add" && venueId && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card-panel rounded-2xl p-6 shadow-2xl">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-indigo-400">smart_display</span>
              Agregar desde YouTube
            </h3>
            <TrackForm
              venueId={venueId}
              onAdded={() => {
                setTab("catalog");
                void loadData();
              }}
            />
          </div>

          <div className="card-panel rounded-2xl p-6 shadow-2xl">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-cyan-400">upload_file</span>
              Subir Archivo de Audio (MP3)
            </h3>
            <UploadTrack
              venueId={venueId}
              onUploaded={() => {
                setTab("catalog");
                void loadData();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
