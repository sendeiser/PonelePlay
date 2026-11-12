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
  Search,
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

  // Expanded playlists map (supports multi-toggle & collapse all)
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  const [hasInitializedExpanded, setHasInitializedExpanded] = useState(false);
  const [playlistTracks, setPlaylistTracks] = useState<Record<string, TrackRow[]>>({});
  const [trackFilters, setTrackFilters] = useState<Record<string, string>>({});
  const [loadingTracks, setLoadingTracks] = useState<string | null>(null);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedMap((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const collapseAll = () => setExpandedMap({});
  const expandAll = () => {
    const next: Record<string, boolean> = {};
    playlists.forEach((p) => {
      next[p.id] = true;
    });
    setExpandedMap(next);
  };

  const anyExpanded = Object.values(expandedMap).some(Boolean);

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
      if (data.length > 0 && !hasInitializedExpanded) {
        setHasInitializedExpanded(true);
        setExpandedMap({ [data[0].id]: true });
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Error al cargar playlists",
      );
    } finally {
      setLoading(false);
    }
  }, [venueId, hasInitializedExpanded]);

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
    Object.keys(expandedMap).forEach((id) => {
      if (expandedMap[id] && !playlistTracks[id]) {
        void loadTracks(id);
      }
    });
  }, [expandedMap, playlistTracks, loadTracks]);

  async function handleCreatePlaylist(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;

    setCreating(true);
    setError(null);
    try {
      const created = await createPlaylist(venueId, newName, newDesc);
      setPlaylists((prev) => [...prev, created]);
      setExpandedMap((prev) => ({ ...prev, [created.id]: true }));
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
      setExpandedMap((prev) => { const n = { ...prev }; delete n[plId]; return n; });
      setFeedback(`Playlist eliminada.`);
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Error al eliminar la playlist",
      );
    }
  }

  async function handleActivate(pl: VenuePlaylist) {
    const targetSlug = slug || "billar-aurora";
    setBusyActionId(`activate:${pl.id}`);
    setError(null);
    try {
      await setActivePlaylistAsFallback(venueId, pl.id, targetSlug);
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
    } finally {
      setBusyActionId(null);
    }
  }

  async function handlePlayPlaylist(pl: VenuePlaylist) {
    const targetSlug = slug || "billar-aurora";
    setBusyActionId(`play-pl:${pl.id}`);
    setError(null);
    try {
      const res = await playPlaylistNow(venueId, targetSlug, pl.id);
      setPlaylists((prev) =>
        prev.map((p) => ({ ...p, isActive: p.id === pl.id })),
      );
      setFeedback(`▶️ ¡Reproduciendo playlist «${pl.name}» en la TV y encolados ${res.totalTracks} temas! (${res.firstTrackTitle})`);
      onActivatedFallback?.();
      setTimeout(() => setFeedback(null), 4500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al reproducir playlist");
    } finally {
      setBusyActionId(null);
    }
  }

  async function handleEnqueuePlaylist(pl: VenuePlaylist) {
    const targetSlug = slug || "billar-aurora";
    setBusyActionId(`enqueue-pl:${pl.id}`);
    setError(null);
    try {
      const count = await enqueuePlaylistTracks(targetSlug, pl.id);
      setFeedback(`⬆️ Se agregaron ${count} canciones de «${pl.name}» a la cola activa.`);
      onActivatedFallback?.();
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al encolar playlist");
    } finally {
      setBusyActionId(null);
    }
  }

  async function handlePlayTrackSingle(t: TrackRow) {
    const targetSlug = slug || "billar-aurora";
    setBusyActionId(`play-trk:${t.id}`);
    setError(null);
    try {
      await playTrackFromPlaylistNow(targetSlug, t);
      setFeedback(`▶️ Reproduciendo ahora en TV: «${t.title}»`);
      onActivatedFallback?.();
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al reproducir tema");
    } finally {
      setBusyActionId(null);
    }
  }

  async function handleEnqueueTrackSingle(t: TrackRow) {
    const targetSlug = slug || "billar-aurora";
    setBusyActionId(`enqueue-trk:${t.id}`);
    setError(null);
    try {
      await enqueueTrackFromPlaylist(targetSlug, t);
      setFeedback(`⬆️ «${t.title}» agregada a la cola activa.`);
      onActivatedFallback?.();
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al encolar tema");
    } finally {
      setBusyActionId(null);
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-th-border">
        <div>
          <h2 className="font-display text-base font-bold text-th-text tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-th-accent">queue_music</span>
            Playlists Personalizadas del Local
          </h2>
          <p className="text-xs text-th-muted mt-0.5">
            Creá listas temáticas y sumá canciones buscando directamente en YouTube.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              const firstOpen = Object.keys(expandedMap).find((id) => expandedMap[id]);
              setSearchTargetPlaylistId(firstOpen || playlists[0]?.id || null);
              setYtModalOpen(true);
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-mono text-xs font-semibold shadow-sm transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px]">smart_display</span>
            <span>Buscar en YouTube</span>
          </button>

          <button
            type="button"
            onClick={() => setNewModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-th-accent hover:bg-th-accent-hover text-th-on-accent font-mono text-xs font-semibold shadow-sm transition-all active:scale-95"
          >
            <Plus className="size-4" />
            <span>Nueva Playlist</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-th-danger-soft border border-th-danger/30 text-th-danger font-mono text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-base">error</span>
          <span>{error}</span>
        </div>
      )}

      {feedback && (
        <div className="p-3 rounded-xl bg-th-emerald-soft border border-th-emerald/30 text-th-emerald font-mono text-xs flex items-center gap-2">
          <Check className="size-4" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Playlist Grid / Cards */}
      {loading && playlists.length === 0 ? (
        <p className="text-center py-12 text-xs font-mono text-th-muted">
          Cargando playlists...
        </p>
      ) : playlists.length === 0 ? (
        <div className="py-16 text-center text-xs space-y-3 card-panel rounded-2xl p-8">
          <ListMusic className="size-12 text-th-muted mx-auto" />
          <p className="font-display text-sm font-bold text-th-text">
            Aún no creaste ninguna playlist personalizada.
          </p>
          <p className="text-th-muted max-w-sm mx-auto">
            Podés armar playlists como «Rock Nacional», «Cachengue» o «Tardecita Chill» buscando videos en YouTube.
          </p>
          <button
            type="button"
            onClick={() => setNewModalOpen(true)}
            className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-th-accent hover:bg-th-accent-hover text-th-on-accent font-mono text-xs font-semibold shadow-sm"
          >
            <Plus className="size-4" />
            <span>Crear Primera Playlist</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Accordion Controls Bar */}
          <div className="flex items-center justify-between pb-1 text-xs font-mono">
            <span className="text-th-muted">
              {playlists.length} {playlists.length === 1 ? "playlist creada" : "playlists creadas"}
            </span>
            <button
              type="button"
              onClick={anyExpanded ? collapseAll : expandAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-th-card hover:bg-th-card-hover border border-th-border text-th-secondary hover:text-th-text font-mono text-xs font-semibold transition-all active:scale-95 shadow-sm"
              title={anyExpanded ? "Contraer todas las listas" : "Desplegar todas las listas"}
            >
              {anyExpanded ? (
                <>
                  <ChevronDown className="size-3.5 text-th-accent" />
                  <span>Contraer todas</span>
                </>
              ) : (
                <>
                  <ChevronRight className="size-3.5 text-th-accent" />
                  <span>Desplegar todas</span>
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {playlists.map((pl) => {
              const isExpanded = Boolean(expandedMap[pl.id]);
              const tracks = playlistTracks[pl.id] || [];
              const trackQuery = (trackFilters[pl.id] ?? "").trim().toLowerCase();
              const visibleTracks = trackQuery
                ? tracks.filter(
                    (t) =>
                      t.title.toLowerCase().includes(trackQuery) ||
                      t.artist.toLowerCase().includes(trackQuery),
                  )
                : tracks;
              const isLoadingThis = loadingTracks === pl.id;

              return (
                <div
                  key={pl.id}
                  className={`rounded-2xl border transition-all ${
                    pl.isActive
                      ? "bg-th-card border-th-accent/45 shadow-md"
                      : "bg-th-card border-th-border hover:border-th-border-strong shadow-sm"
                  }`}
                >
                  {/* Playlist Header Row */}
                  <div className="p-4 flex flex-wrap items-center justify-between gap-4">
                    <button
                      type="button"
                      onClick={() => toggleExpand(pl.id)}
                      className="flex items-center gap-3 cursor-pointer select-none min-w-0 flex-1 text-left group"
                      title={isExpanded ? "Contraer lista" : "Desplegar lista"}
                    >
                      <div className="size-10 rounded-xl bg-th-accent-soft border border-th-accent/25 flex items-center justify-center text-th-accent shrink-0">
                        <ListMusic className="size-5" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display text-sm font-bold text-th-text truncate">
                            {pl.name}
                          </h3>
                          {pl.isActive && (
                            <span className="px-2 py-0.5 rounded-full bg-th-emerald-soft border border-th-emerald/30 text-th-emerald font-mono text-[10px] font-bold inline-flex items-center gap-1">
                              <span className="size-1.5 rounded-full bg-th-emerald animate-live-dot" />
                              ACTIVA EN TV
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-th-muted truncate mt-0.5">
                          {pl.description || "Sin descripción"} ·{" "}
                          <span className="font-mono font-medium text-th-secondary">
                            {tracks.length > 0 ? tracks.length : (pl.trackCount ?? 0)} temas
                          </span>
                        </p>
                      </div>

                      <div className="px-2.5 py-1.5 rounded-lg bg-th-recessed border border-th-border text-xs font-mono text-th-secondary flex items-center gap-1.5 shrink-0 group-hover:border-th-accent/40 group-hover:text-th-text transition-colors">
                        <span>{isExpanded ? "Contraer" : "Ver temas"}</span>
                        {isExpanded ? (
                          <ChevronDown className="size-3.5 text-th-accent" />
                        ) : (
                          <ChevronRight className="size-3.5 text-th-accent" />
                        )}
                      </div>
                    </button>

                    {/* Actions for this playlist */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={busyActionId === `play-pl:${pl.id}`}
                        onClick={() => void handlePlayPlaylist(pl)}
                        className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-mono text-xs font-semibold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                        title="Reproducir esta playlist inmediatamente en la pantalla TV"
                      >
                        {busyActionId === `play-pl:${pl.id}` ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Play className="size-3.5 fill-white" />
                        )}
                        <span>Reproducir</span>
                      </button>

                      <button
                        type="button"
                        disabled={busyActionId === `enqueue-pl:${pl.id}`}
                        onClick={() => void handleEnqueuePlaylist(pl)}
                        className="px-3 py-1.5 rounded-lg bg-th-recessed hover:bg-th-card-hover disabled:opacity-60 border border-th-border text-th-secondary hover:text-th-text font-mono text-xs font-semibold flex items-center gap-1.5 transition-colors"
                        title="Agregar todas las canciones a la cola en vivo de la noche"
                      >
                        {busyActionId === `enqueue-pl:${pl.id}` ? (
                          <Loader2 className="size-3.5 text-th-accent animate-spin" />
                        ) : (
                          <ListPlus className="size-3.5 text-th-accent" />
                        )}
                        <span>Encolar Todo</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openSearchForPlaylist(pl.id)}
                        className="px-3 py-1.5 rounded-lg bg-th-recessed hover:bg-rose-500/10 border border-th-border hover:border-rose-500/35 text-th-secondary hover:text-rose-500 font-mono text-xs font-semibold flex items-center gap-1.5 transition-colors"
                        title="Buscar videos en YouTube para esta playlist"
                      >
                        <Plus className="size-3.5 text-rose-500" />
                        <span>YouTube</span>
                      </button>

                      {!pl.isActive ? (
                        <button
                          type="button"
                          onClick={() => void handleActivate(pl)}
                          className="px-3 py-1.5 rounded-lg bg-th-accent-soft hover:bg-th-accent text-th-accent hover:text-th-on-accent border border-th-accent/30 font-mono text-xs font-semibold flex items-center gap-1.5 transition-all"
                          title="Activar como música de fondo continua en la TV"
                        >
                          <Radio className="size-3.5" />
                          <span>Activar Fondo</span>
                        </button>
                      ) : (
                        <div className="px-3 py-1.5 rounded-lg bg-th-emerald-soft border border-th-emerald/30 text-th-emerald font-mono text-xs font-semibold flex items-center gap-1">
                          <Check className="size-3.5" />
                          <span>Activa en TV</span>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => void handleDeletePlaylist(pl.id, pl.name)}
                        className="size-8 rounded-lg text-th-muted hover:text-th-danger hover:bg-th-danger-soft flex items-center justify-center transition-colors"
                        title="Eliminar playlist"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Tracks List with Bounded Internal Scroll */}
                  {isExpanded && (
                    <div className="border-t border-th-border p-4 bg-th-recessed/70 rounded-b-2xl space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-th-border">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-xs font-semibold text-th-secondary truncate">
                            Canciones en «{pl.name}» ({visibleTracks.length}/{tracks.length})
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {tracks.length > 4 && (
                            <div className="relative">
                              <Search className="size-3.5 text-th-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                              <input
                                type="search"
                                value={trackFilters[pl.id] ?? ""}
                                onChange={(e) =>
                                  setTrackFilters((prev) => ({
                                    ...prev,
                                    [pl.id]: e.target.value,
                                  }))
                                }
                                placeholder="Filtrar lista..."
                                className="ui-input !h-8 !py-1 !pl-8 !pr-2.5 w-44 text-[11px]"
                              />
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => openSearchForPlaylist(pl.id)}
                            className="text-th-accent hover:underline font-mono text-xs font-medium flex items-center gap-1"
                          >
                            <Plus className="size-3.5" />
                            <span>Sumar de YouTube</span>
                          </button>
                        </div>
                      </div>

                      {isLoadingThis ? (
                        <div className="py-6 text-center text-xs font-mono text-th-muted">
                          <Loader2 className="size-4 animate-spin inline-block mr-2" />
                          Cargando canciones...
                        </div>
                      ) : tracks.length === 0 ? (
                        <div className="py-8 text-center text-xs font-mono text-th-muted space-y-2">
                          <p>Esta playlist todavía no tiene canciones.</p>
                          <button
                            type="button"
                            onClick={() => openSearchForPlaylist(pl.id)}
                            className="px-3 py-1.5 rounded-lg bg-th-accent text-th-on-accent font-mono text-xs font-semibold"
                          >
                            Buscar videos en YouTube
                          </button>
                        </div>
                      ) : visibleTracks.length === 0 ? (
                        <p className="py-6 text-center text-xs font-mono text-th-muted">
                          Ninguna canción coincide con &ldquo;{trackFilters[pl.id]}&rdquo;.
                        </p>
                      ) : (
                        <div className="max-h-[420px] min-h-0 rounded-xl border border-th-border bg-th-card/60 p-2 space-y-1.5 ui-scroll-container">
                          {visibleTracks.map((t, idx) => (
                            <div
                              key={t.id}
                              className="p-2.5 rounded-xl bg-th-card border border-th-border/80 flex items-center justify-between gap-3 hover:border-th-border-strong transition-colors"
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <span className="font-mono text-xs text-th-muted w-6 text-center shrink-0">
                                  #{idx + 1}
                                </span>

                                <div className="relative size-10 rounded-lg overflow-hidden bg-th-recessed shrink-0 border border-th-border">
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
                                    <div className="w-full h-full flex items-center justify-center text-th-muted">
                                      <Music2 className="size-4" />
                                    </div>
                                  )}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <h4 className="text-xs font-semibold text-th-text truncate">
                                    {t.title}
                                  </h4>
                                  <p className="text-[11px] text-th-muted truncate">
                                    {t.artist}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="font-mono text-xs text-th-muted mr-1 hidden sm:inline">
                                  {formatDuration(t.durationSeconds)}
                                </span>

                                <button
                                  type="button"
                                  disabled={busyActionId === `play-trk:${t.id}`}
                                  onClick={() => void handlePlayTrackSingle(t)}
                                  className="px-2.5 py-1.5 rounded-lg bg-th-accent-soft hover:bg-th-accent disabled:opacity-60 text-th-accent hover:text-th-on-accent border border-th-accent/25 transition-all flex items-center gap-1 font-mono text-[11px] font-medium"
                                  title="Reproducir este tema ahora en la TV"
                                >
                                  {busyActionId === `play-trk:${t.id}` ? (
                                    <Loader2 className="size-3 animate-spin" />
                                  ) : (
                                    <Play className="size-3 fill-current" />
                                  )}
                                  <span className="hidden sm:inline">Reproducir</span>
                                </button>

                                <button
                                  type="button"
                                  disabled={busyActionId === `enqueue-trk:${t.id}`}
                                  onClick={() => void handleEnqueueTrackSingle(t)}
                                  className="px-2.5 py-1.5 rounded-lg bg-th-recessed hover:bg-th-card-hover disabled:opacity-60 text-th-secondary hover:text-th-teal border border-th-border transition-colors flex items-center gap-1 font-mono text-[11px] font-medium"
                                  title="Poner como siguiente en la cola en vivo"
                                >
                                  {busyActionId === `enqueue-trk:${t.id}` ? (
                                    <Loader2 className="size-3 animate-spin text-th-teal" />
                                  ) : (
                                    <Plus className="size-3" />
                                  )}
                                  <span className="hidden sm:inline">Encolar</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => void handleRemoveTrack(pl.id, t.id)}
                                  className="text-th-muted hover:text-th-danger hover:bg-th-danger-soft rounded-lg transition-colors p-1.5 ml-0.5"
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
        </div>
      )}

      {/* New Playlist Modal */}
      {newModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl card-panel p-6 shadow-2xl">
            <h3 className="font-display text-base font-bold text-th-text mb-1">
              Crear Nueva Playlist Personalizada
            </h3>
            <p className="text-xs text-th-muted mb-5">
              Definí un nombre para identificar la temática musical del local.
            </p>

            <form onSubmit={handleCreatePlaylist} className="space-y-4">
              <div>
                <label htmlFor="pl-name-input" className="ui-label">
                  Nombre de la playlist
                </label>
                <input
                  id="pl-name-input"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="ej: Rock Nacional Clásico, Cachengue 2026..."
                  className="ui-input mt-1.5"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label htmlFor="pl-desc-input" className="ui-label">
                  Descripción (Opcional)
                </label>
                <input
                  id="pl-desc-input"
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="ej: Temas para los viernes después de las 23hs"
                  className="ui-input mt-1.5"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-th-border">
                <button
                  type="button"
                  onClick={() => setNewModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-th-recessed border border-th-border text-th-secondary hover:text-th-text font-mono text-xs font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating || !newName.trim()}
                  className="px-4 py-2 rounded-xl bg-th-accent hover:bg-th-accent-hover text-th-on-accent font-mono text-xs font-semibold disabled:opacity-50"
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

