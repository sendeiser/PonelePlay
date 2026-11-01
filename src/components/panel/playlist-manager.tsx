"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ListMusic,
  ListPlus,
  Loader2,
  Music2,
  Play,
  Plus,
  Radio,
  Trash2,
} from "lucide-react";
import {
  createPlaylist,
  deletePlaylist,
  fetchPlaylists,
  fetchPlaylistTracks,
  removeTrackFromPlaylist,
  setActivePlaylistAsFallback,
  playPlaylistNow,
  enqueuePlaylistTracks,
  playTrackFromPlaylistNow,
  enqueueTrackFromPlaylist,
  type VenuePlaylist,
} from "@/lib/api/playlists";
import type { TrackRow } from "@/lib/api/catalog";
import { YouTubeSearchModal } from "./youtube-search-modal";

interface PlaylistManagerProps {
  venueId: string;
  slug?: string;
  onActivatedFallback?: () => void;
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function PlaylistManager({
  venueId,
  slug,
  onActivatedFallback,
}: PlaylistManagerProps) {
  const [playlists, setPlaylists] = useState<VenuePlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Selected / Expanded playlist
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<Record<string, TrackRow[]>>({});
  const [loadingTracks, setLoadingTracks] = useState<string | null>(null);

  // New Playlist Modal
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  // YouTube Search Modal
  const [ytModalOpen, setYtModalOpen] = useState(false);
  const [searchTargetPlaylistId, setSearchTargetPlaylistId] = useState<string | null>(null);

  const loadPlaylists = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPlaylists(venueId);
      setPlaylists(data);
      if (data.length > 0 && !expandedId) {
        setExpandedId(data[0].id);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Error al cargar playlists",
      );
    } finally {
      setLoading(false);
    }
  }, [venueId, expandedId]);

  useEffect(() => {
    void loadPlaylists();
  }, [loadPlaylists]);

  const loadTracks = useCallback(async (plId: string) => {
    setLoadingTracks(plId);
    try {
      const tr = await fetchPlaylistTracks(plId);
      setPlaylistTracks((prev) => ({ ...prev, [plId]: tr }));
    } catch {
      // Ignored
    } finally {
      setLoadingTracks(null);
    }
  }, []);

  useEffect(() => {
    if (expandedId && !playlistTracks[expandedId]) {
      void loadTracks(expandedId);
    }
  }, [expandedId, playlistTracks, loadTracks]);

  async function handleCreatePlaylist(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;

    setCreating(true);
    setError(null);
    try {
      const created = await createPlaylist(venueId, newName, newDesc);
      setPlaylists((prev) => [...prev, created]);
      setExpandedId(created.id);
      setNewModalOpen(false);
      setNewName("");
      setNewDesc("");
      setFeedback(`Playlist «${created.name}» creada correctamente.`);
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Error al crear la playlist",
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleDeletePlaylist(plId: string, name: string) {
    if (!confirm(`¿Eliminar la playlist «${name}»?`)) return;

    try {
      await deletePlaylist(plId);
      setPlaylists((prev) => prev.filter((p) => p.id !== plId));
      if (expandedId === plId) setExpandedId(null);
      setFeedback(`Playlist eliminada.`);
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Error al eliminar la playlist",
      );
    }
  }

  async function handleActivate(pl: VenuePlaylist) {
    try {
      await setActivePlaylistAsFallback(venueId, pl.id);
      setPlaylists((prev) =>
        prev.map((p) => ({ ...p, isActive: p.id === pl.id })),
      );
      setFeedback(`«${pl.name}» activada como playlist de fondo para la TV.`);
      onActivatedFallback?.();
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Error al activar playlist",
      );
    }
  }

  async function handlePlayPlaylist(pl: VenuePlaylist) {
    const targetSlug = slug || "billar-aurora";
    try {
      const res = await playPlaylistNow(venueId, targetSlug, pl.id);
      setPlaylists((prev) =>
        prev.map((p) => ({ ...p, isActive: p.id === pl.id })),
      );
      setFeedback(`▶️ ¡Reproduciendo playlist «${pl.name}» en la TV! (${res.firstTrackTitle})`);
      onActivatedFallback?.();
      setTimeout(() => setFeedback(null), 4500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al reproducir playlist");
    }
  }

  async function handleEnqueuePlaylist(pl: VenuePlaylist) {
    const targetSlug = slug || "billar-aurora";
    try {
      const count = await enqueuePlaylistTracks(targetSlug, pl.id);
      setFeedback(`⬆️ Se agregaron ${count} canciones de «${pl.name}» a la cola en vivo.`);
      onActivatedFallback?.();
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al encolar playlist");
    }
  }

  async function handlePlayTrackSingle(t: TrackRow) {
    const targetSlug = slug || "billar-aurora";
    try {
      await playTrackFromPlaylistNow(targetSlug, t);
      setFeedback(`▶️ Reproduciendo ahora en TV: «${t.title}»`);
      onActivatedFallback?.();
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al reproducir tema");
    }
  }

  async function handleEnqueueTrackSingle(t: TrackRow) {
    const targetSlug = slug || "billar-aurora";
    try {
      await enqueueTrackFromPlaylist(targetSlug, t);
      setFeedback(`⬆️ «${t.title}» agregada como siguiente en la cola.`);
      onActivatedFallback?.();
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al encolar tema");
    }
  }

  async function handleRemoveTrack(plId: string, trackId: string) {
    try {
      await removeTrackFromPlaylist(plId, trackId);
      setPlaylistTracks((prev) => ({
        ...prev,
        [plId]: (prev[plId] || []).filter((t) => t.id !== trackId),
      }));
      setPlaylists((prev) =>
        prev.map((p) =>
          p.id === plId ? { ...p, trackCount: Math.max(0, (p.trackCount ?? 1) - 1) } : p,
        ),
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Error al quitar canción",
      );
    }
  }

  function openSearchForPlaylist(plId: string) {
    setSearchTargetPlaylistId(plId);
    setYtModalOpen(true);
  }

  return (
    <div className="space-y-6">
      {/* Top action header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#1E2333]">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-indigo-400">queue_music</span>
            Playlists Personalizadas del Local
          </h2>
          <p className="font-mono text-xs text-slate-400">
            Creá listas temáticas y sumá canciones buscando directamente en YouTube.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setSearchTargetPlaylistId(expandedId || playlists[0]?.id || null);
              setYtModalOpen(true);
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-mono text-xs font-bold shadow-md shadow-red-600/30 transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px]">smart_display</span>
            <span>Buscar en YouTube</span>
          </button>

          <button
            type="button"
            onClick={() => setNewModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold shadow-md shadow-indigo-600/30 transition-all active:scale-95"
          >
            <Plus className="size-4" />
            <span>+ Nueva Playlist</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 font-mono text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-red-400 text-base">error</span>
          <span>{error}</span>
        </div>
      )}

      {feedback && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-mono text-xs flex items-center gap-2">
          <Check className="size-4 text-emerald-400" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Playlist Grid / Cards */}
      {loading && playlists.length === 0 ? (
        <p className="text-center py-12 text-xs font-mono text-slate-500">
          Cargando playlists...
        </p>
      ) : playlists.length === 0 ? (
        <div className="py-16 text-center text-xs font-mono text-slate-500 space-y-3 card-panel rounded-2xl p-8">
          <ListMusic className="size-12 text-slate-600 mx-auto" />
          <p className="text-sm font-bold text-slate-300">
            Aún no creaste ninguna playlist personalizada.
          </p>
          <p className="text-slate-500 max-w-sm mx-auto">
            Podés armar playlists como «Rock Nacional», «Cachengue», «Tardecita Chill» buscando videos en YouTube.
          </p>
          <button
            type="button"
            onClick={() => setNewModalOpen(true)}
            className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold"
          >
            <Plus className="size-4" />
            <span>Crear Primera Playlist</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {playlists.map((pl) => {
            const isExpanded = expandedId === pl.id;
            const tracks = playlistTracks[pl.id] || [];
            const isLoadingThis = loadingTracks === pl.id;

            return (
              <div
                key={pl.id}
                className={`rounded-2xl border transition-all ${
                  pl.isActive
                    ? "bg-[#181d2c] border-indigo-500/50 shadow-lg shadow-indigo-600/15"
                    : "bg-[#141824] border-[#232b42] hover:border-[#2d3752]"
                }`}
              >
                {/* Playlist Header Row */}
                <div className="p-4 flex flex-wrap items-center justify-between gap-4">
                  <div
                    onClick={() => {
                      setExpandedId(isExpanded ? null : pl.id);
                    }}
                    className="flex items-center gap-3 cursor-pointer select-none min-w-0 flex-1"
                  >
                    <div className="size-10 rounded-xl bg-[#1c2234] border border-[#283250] flex items-center justify-center text-indigo-400 shrink-0">
                      <ListMusic className="size-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white truncate">
                          {pl.name}
                        </h3>
                        {pl.isActive && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono text-[10px] font-bold flex items-center gap-1">
                            <span className="size-1.5 rounded-full bg-emerald-400 animate-live-dot" />
                            ACTIVA EN TV
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 truncate mt-0.5">
                        {pl.description || "Sin descripción"} ·{" "}
                        <span className="font-mono text-indigo-300">
                          {tracks.length > 0 ? tracks.length : (pl.trackCount ?? 0)} temas
                        </span>
                      </p>
                    </div>

                    {isExpanded ? (
                      <ChevronDown className="size-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="size-4 text-slate-400" />
                    )}
                  </div>

                  {/* Actions for this playlist */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handlePlayPlaylist(pl)}
                      className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-mono text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/30 active:scale-95 transition-all"
                      title="Reproducir esta playlist inmediatamente en la pantalla TV"
                    >
                      <Play className="size-3.5 fill-white" />
                      <span>Reproducir Playlist</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleEnqueuePlaylist(pl)}
                      className="px-3 py-1.5 rounded-lg bg-[#1c2234] hover:bg-[#252c42] border border-[#2a3450] text-slate-300 hover:text-white font-mono text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      title="Agregar todas las canciones a la cola en vivo de la noche"
                    >
                      <ListPlus className="size-3.5 text-indigo-400" />
                      <span>Encolar Todo</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openSearchForPlaylist(pl.id)}
                      className="px-3 py-1.5 rounded-lg bg-[#1c2234] hover:bg-red-950/40 border border-[#2a3450] hover:border-red-500/30 text-slate-300 hover:text-red-300 font-mono text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      title="Buscar videos en YouTube para esta playlist"
                    >
                      <Plus className="size-3.5 text-red-400" />
                      <span>YouTube</span>
                    </button>

                    {!pl.isActive ? (
                      <button
                        type="button"
                        onClick={() => void handleActivate(pl)}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/40 font-mono text-xs font-bold flex items-center gap-1.5 transition-all"
                        title="Activar como música de fondo continua en la TV"
                      >
                        <Radio className="size-3.5 text-cyan-400" />
                        <span>Activar de Fondo</span>
                      </button>
                    ) : (
                      <div className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-bold flex items-center gap-1">
                        <Check className="size-3.5" />
                        <span>Activa en TV</span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => void handleDeletePlaylist(pl.id, pl.name)}
                      className="size-8 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 flex items-center justify-center transition-colors"
                      title="Eliminar playlist"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>

                {/* Expanded Tracks List */}
                {isExpanded && (
                  <div className="border-t border-[#1E2333] p-4 bg-[#0d101a]/80 rounded-b-2xl space-y-3">
                    <div className="flex items-center justify-between text-xs font-mono text-slate-400 pb-2 border-b border-[#1E2333]/50">
                      <span>Canciones en «{pl.name}»</span>
                      <button
                        type="button"
                        onClick={() => openSearchForPlaylist(pl.id)}
                        className="text-cyan-400 hover:underline flex items-center gap-1"
                      >
                        <Plus className="size-3" />
                        <span>Sumar canciones de YouTube</span>
                      </button>
                    </div>

                    {isLoadingThis ? (
                      <div className="py-6 text-center text-xs font-mono text-slate-500">
                        <Loader2 className="size-4 animate-spin inline-block mr-2" />
                        Cargando canciones...
                      </div>
                    ) : tracks.length === 0 ? (
                      <div className="py-8 text-center text-xs font-mono text-slate-500 space-y-2">
                        <p>Esta playlist todavía no tiene canciones.</p>
                        <button
                          type="button"
                          onClick={() => openSearchForPlaylist(pl.id)}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-mono text-xs font-bold"
                        >
                          Buscar videos en YouTube
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {tracks.map((t, idx) => (
                          <div
                            key={t.id}
                            className="p-2.5 rounded-xl bg-[#141824] border border-[#232b42] flex items-center justify-between gap-3 hover:border-[#2d3752]"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <span className="font-mono text-xs text-slate-500 w-5 text-center">
                                #{idx + 1}
                              </span>

                              <div className="relative size-10 rounded-lg overflow-hidden bg-black shrink-0 border border-[#283250]">
                                {t.thumbnailUrl ? (
                                  <Image
                                    src={t.thumbnailUrl}
                                    alt={t.title}
                                    width={40}
                                    height={40}
                                    className="w-full h-full object-cover"
                                    unoptimized
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-slate-500">
                                    <Music2 className="size-4" />
                                  </div>
                                )}
                              </div>

                              <div className="min-w-0 flex-1">
                                <h4 className="text-xs font-bold text-white truncate">
                                  {t.title}
                                </h4>
                                <p className="text-[11px] text-slate-400 truncate">
                                  {t.artist}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-slate-400 mr-1">
                                {formatDuration(t.durationSeconds)}
                              </span>

                              <button
                                type="button"
                                onClick={() => void handlePlayTrackSingle(t)}
                                className="p-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 transition-all flex items-center gap-1 font-mono text-[11px]"
                                title="Reproducir este tema ahora en la TV"
                              >
                                <Play className="size-3 fill-current" />
                                <span className="hidden sm:inline">Reproducir</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => void handleEnqueueTrackSingle(t)}
                                className="p-1.5 rounded-lg bg-[#1c2234] hover:bg-[#252c42] text-slate-300 hover:text-cyan-400 border border-[#2a3450] transition-colors flex items-center gap-1 font-mono text-[11px]"
                                title="Poner como siguiente en la cola en vivo"
                              >
                                <Plus className="size-3" />
                                <span className="hidden sm:inline">Encolar</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => void handleRemoveTrack(pl.id, t.id)}
                                className="text-slate-500 hover:text-rose-400 transition-colors p-1.5 ml-1"
                                title="Quitar de playlist"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* New Playlist Modal */}
      {newModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#141824] border border-[#232b42] p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-2">
              Crear Nueva Playlist Personalizada
            </h3>
            <p className="text-xs text-slate-400 mb-4 font-mono">
              Definí un nombre para identificar la temática acústica del local.
            </p>

            <form onSubmit={handleCreatePlaylist} className="space-y-4">
              <div>
                <label
                  htmlFor="pl-name-input"
                  className="block font-mono text-[11px] uppercase tracking-wider text-slate-400"
                >
                  Nombre de la playlist
                </label>
                <input
                  id="pl-name-input"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="ej: Rock Nacional Clásico, Cachengue 2026..."
                  className="mt-1.5 w-full rounded-xl bg-[#0a0e17] border border-[#232b42] px-3.5 py-2.5 text-xs font-mono text-white placeholder:text-slate-600 focus:border-indigo-400 focus:outline-none"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label
                  htmlFor="pl-desc-input"
                  className="block font-mono text-[11px] uppercase tracking-wider text-slate-400"
                >
                  Descripción (Opcional)
                </label>
                <input
                  id="pl-desc-input"
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="ej: Temas para los viernes después de las 23hs"
                  className="mt-1.5 w-full rounded-xl bg-[#0a0e17] border border-[#232b42] px-3.5 py-2.5 text-xs font-mono text-white placeholder:text-slate-600 focus:border-indigo-400 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1E2333]">
                <button
                  type="button"
                  onClick={() => setNewModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#181b25] text-slate-400 hover:text-white font-mono text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating || !newName.trim()}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold disabled:opacity-50"
                >
                  {creating ? "Creando..." : "Crear Playlist"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* YouTube Live Search Modal */}
      <YouTubeSearchModal
        isOpen={ytModalOpen}
        onClose={() => setYtModalOpen(false)}
        venueId={venueId}
        playlists={playlists}
        defaultPlaylistId={searchTargetPlaylistId}
        onTrackAdded={() => {
          void loadPlaylists();
          if (searchTargetPlaylistId) {
            void loadTracks(searchTargetPlaylistId);
          }
        }}
      />
    </div>
  );
}

