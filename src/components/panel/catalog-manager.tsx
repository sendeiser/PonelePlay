"use client";

import { useEffect, useState, useCallback } from "react";
import { SourceBadge } from "@/components/source-badge";
import { TrackForm } from "./track-form";
import { UploadTrack } from "./upload-track";
import { FallbackList } from "./fallback-list";
import { PlaylistManager } from "./playlist-manager";
import { YouTubeSearchModal } from "./youtube-search-modal";
import {
  archiveTrack,
  deleteTrack,
  fetchCatalog,
  fetchFallback,
  type TrackRow,
} from "@/lib/api/catalog";
import { fetchPlaylists, type VenuePlaylist } from "@/lib/api/playlists";
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
  const [tab, setTab] = useState<"playlists" | "catalog" | "fallback" | "add">("playlists");
  const [tracks, setTracks] = useState<TrackRow[]>([]);
  const [fallbackTracks, setFallbackTracks] = useState<TrackRow[]>([]);
  const [playlists, setPlaylists] = useState<VenuePlaylist[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ytModalOpen, setYtModalOpen] = useState(false);
  const [deletingTrack, setDeletingTrack] = useState<TrackRow | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

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
      const [cat, fb, pls] = await Promise.all([
        fetchCatalog(venueId),
        fetchFallback(venueId),
        fetchPlaylists(venueId),
      ]);
      setTracks(cat);
      setFallbackTracks(fb);
      setPlaylists(pls);
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

  
  async function handleDelete(trackId: string) {
    setActionLoading(true);
    try {
      await deleteTrack(trackId);
      setTracks((prev) => prev.filter((t) => t.id !== trackId));
      setDeletingTrack(null);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Error al eliminar la canción",
      );
    } finally {
      setActionLoading(false);
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
    <div className="space-y-6 pb-36 md:pb-48">
      {/* SECTION HEADER */}
      <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-th-border">
        <div>
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-th-teal mb-1.5">
            <span className="px-2.5 py-0.5 rounded-full bg-th-teal-soft border border-th-teal/25 font-semibold">
              SALÓN PRINCIPAL · AMBIENTACIÓN & YOUTUBE
            </span>
            <span className="text-th-muted">/panel/{slug}/catalogo</span>
          </div>
          <h1 className="font-display text-xl font-bold text-th-text tracking-tight">
            Playlists Personalizadas & Catálogo
          </h1>
          <p className="text-xs text-th-muted mt-0.5">
            Creá listas musicales buscando en YouTube o subiendo MP3 para la pantalla de TV y la música de fondo.
          </p>
        </div>

        {/* Action button: Search YouTube directly */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setYtModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-mono text-xs font-semibold shadow-sm transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px]">smart_display</span>
            <span>Buscar o Importar Playlist</span>
          </button>
        </div>
      </section>

      {/* Cabecera Metrics Deck */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs">
        <div className="p-4 rounded-2xl card-panel flex flex-col justify-between">
          <div className="flex items-center justify-between text-th-muted text-[10px] uppercase font-semibold tracking-wider">
            <span>PLAYLISTS CREADAS</span>
            <span className="material-symbols-outlined text-base text-th-teal">queue_music</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-display text-2xl font-bold text-th-text tabular-nums">
              {playlists.length}
            </span>
            <span className="text-th-teal font-semibold">Listas</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl card-panel flex flex-col justify-between">
          <div className="flex items-center justify-between text-th-muted text-[10px] uppercase font-semibold tracking-wider">
            <span>TOTAL CANCIONES</span>
            <span className="material-symbols-outlined text-base text-th-accent">library_music</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-display text-2xl font-bold text-th-text tabular-nums">
              {tracks.length}
            </span>
            <span className="text-th-accent font-semibold">Tracks ({Math.round(totalMinutes)}m)</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl card-panel flex flex-col justify-between">
          <div className="flex items-center justify-between text-th-muted text-[10px] uppercase font-semibold tracking-wider">
            <span>ACTIVA EN TV (LOOP)</span>
            <span className="material-symbols-outlined text-base text-th-emerald">repeat</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-display text-2xl font-bold text-th-emerald tabular-nums">
              {fallbackTracks.length}
            </span>
            <span className="text-th-muted text-[11px]">En Rotación</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-th-danger/35 bg-th-danger-soft p-3 text-xs text-th-danger flex items-center gap-2 font-mono">
          <span className="material-symbols-outlined text-base">error</span>
          <span>{error}</span>
        </div>
      )}

      {/* Tabs navigation bar */}
      <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-th-recessed border border-th-border overflow-x-auto">
        <button
          type="button"
          onClick={() => setTab("playlists")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-mono text-xs font-semibold transition-all shrink-0 ${
            tab === "playlists"
              ? "bg-th-accent text-th-on-accent shadow-sm"
              : "text-th-secondary hover:text-th-text hover:bg-th-card/70"
          }`}
        >
          <span className="material-symbols-outlined text-base">queue_music</span>
          <span>Playlists Personalizadas ({playlists.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setTab("catalog")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-mono text-xs font-semibold transition-all shrink-0 ${
            tab === "catalog"
              ? "bg-th-accent text-th-on-accent shadow-sm"
              : "text-th-secondary hover:text-th-text hover:bg-th-card/70"
          }`}
        >
          <span className="material-symbols-outlined text-base">library_music</span>
          <span>Catálogo General ({tracks.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setTab("fallback")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-mono text-xs font-semibold transition-all shrink-0 ${
            tab === "fallback"
              ? "bg-th-accent text-th-on-accent shadow-sm"
              : "text-th-secondary hover:text-th-text hover:bg-th-card/70"
          }`}
        >
          <span className="material-symbols-outlined text-base">repeat</span>
          <span>Fondo en Vivo TV ({fallbackTracks.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setTab("add")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-mono text-xs font-semibold transition-all shrink-0 ${
            tab === "add"
              ? "bg-th-accent text-th-on-accent shadow-sm"
              : "text-th-secondary hover:text-th-text hover:bg-th-card/70"
          }`}
        >
          <span className="material-symbols-outlined text-base">add_circle</span>
          <span>Agregar Canción</span>
        </button>
      </div>

      {/* Tab 0: Custom Playlists View */}
      {tab === "playlists" && venueId && (
        <PlaylistManager
          venueId={venueId}
          slug={slug}
          onActivatedFallback={() => void loadData()}
        />
      )}

      {/* Tab 1: Catalog view */}
      {tab === "catalog" && (
        <div className="card-panel rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-th-border">
            <div className="relative flex-1 max-w-md">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-th-muted text-base pointer-events-none">
                search
              </span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrar por título o artista..."
                className="ui-input !pl-9"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setYtModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-rose-500/12 hover:bg-rose-500/20 text-rose-500 border border-rose-500/30 text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">smart_display</span>
                <span>Buscar o Importar</span>
              </button>

              <button
                type="button"
                onClick={() => void loadData()}
                className="size-10 rounded-xl border border-th-border text-th-muted hover:text-th-text hover:bg-th-card-hover flex items-center justify-center transition-colors"
                title="Actualizar catálogo"
              >
                <span className="material-symbols-outlined text-base">refresh</span>
              </button>
            </div>
          </div>

          {loading && tracks.length === 0 ? (
            <p className="text-center py-12 text-xs font-mono text-th-muted">
              Cargando catálogo...
            </p>
          ) : filteredTracks.length === 0 ? (
            <div className="py-12 text-center text-xs font-mono text-th-muted space-y-2.5">
              <span className="material-symbols-outlined text-th-muted text-3xl">music_off</span>
              <p>No se encontraron canciones en el catálogo.</p>
              <button
                type="button"
                onClick={() => setYtModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-th-accent text-th-on-accent font-mono text-xs font-semibold"
              >
                Buscar en YouTube
              </button>
            </div>
          ) : (
            <>
              {/* Mobile Card List (sm:hidden) with Bounded Internal Scroll */}
              <div className="sm:hidden max-h-[460px] min-h-0 rounded-xl bg-th-recessed border border-th-border p-2 space-y-2 ui-scroll-container">
                {filteredTracks.map((t) => (
                  <div
                    key={t.id}
                    className="p-3 rounded-xl bg-th-card border border-th-border flex items-center justify-between gap-3 font-mono"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-th-text text-xs truncate">{t.title}</p>
                      <p className="text-[11px] text-th-muted truncate">{t.artist}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <SourceBadge source={t.source} />
                        <span className="text-[10px] text-th-muted">
                          {formatDuration(t.durationSeconds)}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                            t.status === "active"
                              ? "bg-th-emerald-soft text-th-emerald"
                              : "bg-th-recessed text-th-muted"
                          }`}
                        >
                          {t.status === "active" ? "Activo" : "Archivado"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {t.status === "active" && (
                        <button
                          type="button"
                          onClick={() => void handleArchive(t.id)}
                          className="px-2 py-1 rounded-lg bg-th-recessed border border-th-border text-th-secondary hover:text-th-text text-xs"
                          title="Archivar canción"
                        >
                          Archivar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setDeletingTrack(t)}
                        className="p-1.5 rounded-lg bg-th-danger-soft hover:bg-th-danger text-th-danger hover:text-white border border-th-danger/30 text-xs flex items-center justify-center transition-colors active:scale-95"
                        title="Eliminar canción del catálogo"
                      >
                        <span className="material-symbols-outlined text-base">delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table (hidden sm:block) with Bounded Internal Scroll */}
              <div className="hidden sm:block max-h-[460px] min-h-0 rounded-xl border border-th-border bg-th-recessed/50 overflow-x-auto ui-scroll-container">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="sticky top-0 z-10 bg-th-recessed border-b border-th-border">
                    <tr className="text-th-muted text-[10px] uppercase">
                      <th className="py-2.5 px-3">Canción</th>
                      <th className="py-2.5 px-3">Artista</th>
                      <th className="py-2.5 px-3">Fuente</th>
                      <th className="py-2.5 px-3">Duración</th>
                      <th className="py-2.5 px-3">Estado</th>
                      <th className="py-2.5 px-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-th-border bg-th-card">
                    {filteredTracks.map((t) => (
                      <tr key={t.id} className="hover:bg-th-card-hover transition-colors">
                        <td className="py-3 px-3 font-semibold text-th-text">
                          {t.title}
                        </td>
                        <td className="py-3 px-3 text-th-secondary">
                          {t.artist}
                        </td>
                        <td className="py-3 px-3">
                          <SourceBadge source={t.source} />
                        </td>
                        <td className="py-3 px-3 text-th-muted">
                          {formatDuration(t.durationSeconds)}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              t.status === "active"
                                ? "bg-th-emerald-soft border border-th-emerald/25 text-th-emerald"
                                : "bg-th-recessed text-th-muted border border-th-border"
                            }`}
                          >
                            {t.status === "active" ? "Activo" : "Archivado"}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {t.status === "active" && (
                              <button
                                type="button"
                                onClick={() => void handleArchive(t.id)}
                                className="px-2.5 py-1 rounded-lg bg-th-recessed border border-th-border text-th-secondary hover:text-th-text text-[11px] transition-colors"
                                title="Archivar canción"
                              >
                                Archivar
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setDeletingTrack(t)}
                              className="px-2.5 py-1 rounded-lg bg-th-danger-soft hover:bg-th-danger text-th-danger hover:text-white border border-th-danger/30 text-[11px] font-mono font-semibold transition-all flex items-center gap-1 active:scale-95"
                              title="Eliminar definitivamente del catálogo"
                            >
                              <span className="material-symbols-outlined text-sm">delete</span>
                              <span>Eliminar</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab 2: Fallback List */}
      {tab === "fallback" && venueId && (
        <div className="card-panel rounded-2xl p-6">
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
          <div className="card-panel rounded-2xl p-6">
            <h3 className="font-display text-sm font-bold text-th-text mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-th-accent">smart_display</span>
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

          <div className="card-panel rounded-2xl p-6">
            <h3 className="font-display text-sm font-bold text-th-text mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-th-teal">upload_file</span>
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

      {/* YouTube Live Search Modal */}
      {venueId && (
        <YouTubeSearchModal
          isOpen={ytModalOpen}
          onClose={() => setYtModalOpen(false)}
          venueId={venueId}
          playlists={playlists}
          onTrackAdded={() => void loadData()}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingTrack && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="card-panel rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-th-danger">
              <span className="material-symbols-outlined text-3xl">warning</span>
              <div>
                <h3 className="font-display text-base font-bold text-th-text">
                  ¿Eliminar canción del catálogo?
                </h3>
                <span className="text-[11px] text-th-danger font-mono font-medium">
                  Acción irreversible
                </span>
              </div>
            </div>
            <p className="text-xs text-th-secondary leading-relaxed">
              Se eliminará definitivamente «<strong className="text-th-text">{deletingTrack.title}</strong>» de{" "}
              <span className="text-th-accent font-medium">{deletingTrack.artist}</span> del catálogo y de todas las listas del bar.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-th-border">
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setDeletingTrack(null)}
                className="px-4 py-2 rounded-xl border border-th-border bg-th-recessed text-th-secondary hover:text-th-text font-mono text-xs transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => void handleDelete(deletingTrack.id)}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-mono text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
              >
                {actionLoading ? (
                  <span className="inline-block size-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span className="material-symbols-outlined text-sm">delete</span>
                )}
                <span>{actionLoading ? "Eliminando..." : "Sí, eliminar"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
