"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  ClipboardPaste,
  ListMusic,
  Loader2,
  Mic,
  Music2,
  Play,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import {
  searchYouTubeWithDetails,
  type SearchResult,
  type YouTubePlaylistInfo,
} from "@/lib/api/proposals";
import { playTrackNow, enqueueTrackTop } from "@/lib/api/master-control";

interface ManualPlaybackModalProps {
  isOpen: boolean;
  onClose: () => void;
  slug: string;
  defaultKaraoke?: boolean;
  onActionComplete?: () => void;
}

export function ManualPlaybackModal({
  isOpen,
  onClose,
  slug,
  defaultKaraoke = false,
  onActionComplete,
}: ManualPlaybackModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [playlistInfo, setPlaylistInfo] = useState<YouTubePlaylistInfo | null>(null);
  const [singleVideoInfo, setSingleVideoInfo] = useState<SearchResult | null>(null);
  const [viewMode, setViewMode] = useState<"playlist" | "single">("playlist");

  const [searching, setSearching] = useState(false);
  const [isKaraoke, setIsKaraoke] = useState(defaultKaraoke);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setIsKaraoke(defaultKaraoke);
  }, [defaultKaraoke]);

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
      const el = document.getElementById("manual-search-input");
      el?.focus();
    }
  }

  async function handlePlayNow(item: SearchResult) {
    setActionLoadingId(`play-${item.videoId}`);
    setFeedback(null);
    try {
      await playTrackNow(slug, {
        title: item.title,
        artist: item.artist,
        youtubeVideoId: item.videoId,
        durationSeconds: item.durationSeconds,
        thumbnailUrl: item.thumbnailUrl,
        isKaraoke: item.isKaraoke || isKaraoke,
      });

      setFeedback(`▶ Reproduciendo en TV: «${item.title}»`);
      onActionComplete?.();
      setTimeout(() => setFeedback(null), 3500);
    } catch (err: unknown) {
      setFeedback(err instanceof Error ? err.message : "Error al reproducir tema");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleEnqueueTop(item: SearchResult) {
    setActionLoadingId(`queue-${item.videoId}`);
    setFeedback(null);
    try {
      await enqueueTrackTop(slug, {
        title: item.title,
        artist: item.artist,
        youtubeVideoId: item.videoId,
        durationSeconds: item.durationSeconds,
        thumbnailUrl: item.thumbnailUrl,
        isKaraoke: item.isKaraoke || isKaraoke,
      });

      setFeedback(`⬆ «${item.title}» puesta como siguiente en la cola.`);
      onActionComplete?.();
      setTimeout(() => setFeedback(null), 3500);
    } catch (err: unknown) {
      setFeedback(err instanceof Error ? err.message : "Error al encolar tema");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handlePlayEntirePlaylist() {
    if (!playlistInfo || playlistInfo.tracks.length === 0) return;
    setActionLoadingId("playlist-play-all");
    setFeedback(null);

    try {
      const [first, ...rest] = playlistInfo.tracks;
      await playTrackNow(slug, {
        title: first.title,
        artist: first.artist,
        youtubeVideoId: first.videoId,
        durationSeconds: first.durationSeconds,
        thumbnailUrl: first.thumbnailUrl,
        isKaraoke: first.isKaraoke || isKaraoke,
      });

      // Enqueue the rest
      for (const t of rest) {
        await enqueueTrackTop(slug, {
          title: t.title,
          artist: t.artist,
          youtubeVideoId: t.videoId,
          durationSeconds: t.durationSeconds,
          thumbnailUrl: t.thumbnailUrl,
          isKaraoke: t.isKaraoke || isKaraoke,
        });
      }

      setFeedback(`▶ Reproduciendo «${first.title}» y ${rest.length} temas encolados.`);
      onActionComplete?.();
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: unknown) {
      setFeedback(err instanceof Error ? err.message : "Error al reproducir playlist");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleEnqueueEntirePlaylist() {
    if (!playlistInfo || playlistInfo.tracks.length === 0) return;
    setActionLoadingId("playlist-queue-all");
    setFeedback(null);

    try {
      for (const t of playlistInfo.tracks) {
        await enqueueTrackTop(slug, {
          title: t.title,
          artist: t.artist,
          youtubeVideoId: t.videoId,
          durationSeconds: t.durationSeconds,
          thumbnailUrl: t.thumbnailUrl,
          isKaraoke: t.isKaraoke || isKaraoke,
        });
      }

      setFeedback(`➕ ${playlistInfo.tracks.length} temas agregados a la cola.`);
      onActionComplete?.();
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: unknown) {
      setFeedback(err instanceof Error ? err.message : "Error al encolar playlist");
    } finally {
      setActionLoadingId(null);
    }
  }

  const displayedTracks =
    viewMode === "single" && singleVideoInfo ? [singleVideoInfo] : results;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl card-panel rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-th-border bg-th-recessed">
          <div className="flex items-center gap-3">
            <div
              className={`size-10 rounded-xl flex items-center justify-center text-white shadow-sm ${
                isKaraoke
                  ? "bg-gradient-to-br from-pink-600 to-purple-600"
                  : "bg-th-accent"
              }`}
            >
              <span className="material-symbols-outlined text-[22px]">
                {isKaraoke ? "mic_external_on" : "settings_remote"}
              </span>
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-th-text flex flex-wrap items-center gap-2">
                <span>Poner Canción o Playlist</span>
                {isKaraoke ? (
                  <span className="text-[10px] bg-pink-500/15 text-pink-500 border border-pink-500/35 px-2 py-0.5 rounded-full font-mono uppercase font-bold">
                    Modo Karaoke
                  </span>
                ) : (
                  <span className="text-[10px] bg-th-accent-soft text-th-accent border border-th-accent/30 px-2 py-0.5 rounded-full font-mono uppercase font-bold">
                    Staff / Admin VIP
                  </span>
                )}
              </h2>
              <p className="text-xs text-th-muted">
                {isKaraoke
                  ? "Búsqueda con filtro karaoke estricto · Videos más vistos de YouTube"
                  : "Reproducí canciones individuales o listas de reproducción completas"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="size-8 rounded-lg border border-th-border bg-th-card text-th-muted hover:text-th-text hover:bg-th-card-hover flex items-center justify-center transition-colors shrink-0"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Search & Mode Toggles */}
        <div className="p-5 border-b border-th-border bg-th-card space-y-3">
          {/* Mode Tabs */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsKaraoke(false)}
              className={`flex-1 py-2 px-3 rounded-xl font-mono text-xs font-semibold transition-all flex items-center justify-center gap-2 border ${
                !isKaraoke
                  ? "bg-th-accent text-th-on-accent border-th-accent shadow-sm"
                  : "bg-th-recessed text-th-secondary border-th-border hover:text-th-text"
              }`}
            >
              <span className="material-symbols-outlined text-base">smart_display</span>
              <span>YouTube Estándar & Playlists</span>
            </button>

            <button
              type="button"
              onClick={() => setIsKaraoke(true)}
              className={`flex-1 py-2 px-3 rounded-xl font-mono text-xs font-semibold transition-all flex items-center justify-center gap-2 border ${
                isKaraoke
                  ? "bg-pink-600 text-white border-pink-600 shadow-sm"
                  : "bg-th-recessed text-th-secondary border-th-border hover:text-pink-500"
              }`}
            >
              <Mic className="size-4" />
              <span>Modo Karaoke (Más Vistos)</span>
            </button>
          </div>

          {/* Search Input Bar with Paste / Clear Buttons */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-th-muted">
              {searching ? (
                <Loader2 className="size-4 animate-spin text-th-accent" />
              ) : (
                <Search className="size-4" />
              )}
            </div>
            <input
              id="manual-search-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                isKaraoke
                  ? "Escribí el tema o artista (ej: Soda Stereo, Queen, Luis Miguel)..."
                  : "Escribí tema, artista o pegá link de video / playlist..."
              }
              className="ui-input !pl-10 !pr-24 !py-3 !text-sm"
              autoFocus
            />

            <div className="absolute inset-y-0 right-2 flex items-center gap-1">
              {query ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setResults([]);
                    setPlaylistInfo(null);
                    setSingleVideoInfo(null);
                  }}
                  className="size-7 rounded-lg text-th-muted hover:text-th-text hover:bg-th-card-hover flex items-center justify-center transition-colors"
                >
                  <X className="size-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handlePaste()}
                  title="Pegar link del portapapeles"
                  className="px-2.5 py-1 rounded-lg bg-th-card hover:bg-th-accent-soft text-th-secondary hover:text-th-accent font-mono text-[11px] font-semibold flex items-center gap-1 border border-th-border transition-all active:scale-95"
                >
                  <ClipboardPaste className="size-3.5 text-th-accent" />
                  <span>Pegar</span>
                </button>
              )}
            </div>
          </div>

          {/* Banner notification / feedback */}
          {feedback && (
            <div className="p-2.5 rounded-xl bg-th-accent-soft border border-th-accent/30 text-th-accent text-xs font-mono flex items-center gap-2 animate-fade-in">
              <Sparkles className="size-4 shrink-0" />
              <span>{feedback}</span>
            </div>
          )}

          {/* PLAYLIST DETECTED HERO BANNER */}
          {playlistInfo && (
            <div className="p-3.5 rounded-xl bg-th-recessed border border-rose-500/35 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-11 rounded-xl bg-rose-500/15 border border-rose-500/35 flex items-center justify-center text-rose-500 shrink-0">
                  <ListMusic className="size-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-rose-500/15 text-rose-500 border border-rose-500/30 font-bold uppercase">
                      Playlist Detectada
                    </span>
                    <span className="text-[11px] font-mono text-th-muted">
                      {playlistInfo.tracks.length} canciones
                    </span>
                  </div>
                  <h3 className="text-xs font-bold text-th-text truncate mt-0.5">
                    {playlistInfo.title}
                  </h3>
                  <p className="text-[10px] font-mono text-th-muted truncate">
                    Canal: {playlistInfo.author}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={actionLoadingId !== null}
                  onClick={() => void handlePlayEntirePlaylist()}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                >
                  {actionLoadingId === "playlist-play-all" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Play className="size-3.5 fill-current" />
                  )}
                  <span>Reproducir Toda</span>
                </button>

                <button
                  type="button"
                  disabled={actionLoadingId !== null}
                  onClick={() => void handleEnqueueEntirePlaylist()}
                  className="px-3 py-1.5 rounded-lg bg-th-accent hover:bg-th-accent-hover text-th-on-accent font-mono text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                >
                  {actionLoadingId === "playlist-queue-all" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Plus className="size-3.5" />
                  )}
                  <span>Encolar Toda</span>
                </button>
              </div>
            </div>
          )}

          {/* Toggle if both video and playlist in the URL */}
          {playlistInfo && singleVideoInfo && (
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-th-muted">Ver:</span>
              <button
                type="button"
                onClick={() => setViewMode("playlist")}
                className={`px-2.5 py-1 rounded-lg font-mono text-[11px] transition-all border ${
                  viewMode === "playlist"
                    ? "bg-th-accent-soft text-th-accent border-th-accent/40 font-semibold"
                    : "bg-th-recessed text-th-secondary border-th-border hover:text-th-text"
                }`}
              >
                Toda la lista ({playlistInfo.tracks.length})
              </button>
              <button
                type="button"
                onClick={() => setViewMode("single")}
                className={`px-2.5 py-1 rounded-lg font-mono text-[11px] transition-all border ${
                  viewMode === "single"
                    ? "bg-th-accent-soft text-th-accent border-th-accent/40 font-semibold"
                    : "bg-th-recessed text-th-secondary border-th-border hover:text-th-text"
                }`}
              >
                Solo este video
              </button>
            </div>
          )}
        </div>

        {/* Results List */}
        <div className="flex-1 p-4 space-y-2 min-h-[260px] ui-scroll-container bg-th-recessed/50">
          {searching ? (
            <div className="h-48 flex flex-col items-center justify-center text-th-muted gap-2">
              <Loader2 className="size-6 animate-spin text-th-accent" />
              <span className="font-mono text-xs">
                {isKaraoke
                  ? "Buscando versiones karaoke más vistas..."
                  : "Buscando en YouTube..."}
              </span>
            </div>
          ) : displayedTracks.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-th-muted gap-2 text-center px-4">
              <Music2 className="size-8 stroke-[1.5] text-th-muted/70" />
              {query.trim() ? (
                <>
                  <p className="text-sm font-semibold text-th-secondary">
                    No se encontraron resultados
                  </p>
                  <p className="text-xs text-th-muted">
                    Probá con otro término de búsqueda o pegá un enlace directo de YouTube.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-th-secondary">
                    Buscador Directo a Cabina
                  </p>
                  <p className="text-xs text-th-muted max-w-sm">
                    Escribí una canción, artista o pegá el link de una playlist para controlarla desde la cabina.
                  </p>
                </>
              )}
            </div>
          ) : (
            displayedTracks.map((item) => (
              <div
                key={item.videoId}
                className="group flex items-center justify-between p-2.5 rounded-xl bg-th-card hover:bg-th-card-hover border border-th-border hover:border-th-accent/40 transition-all gap-3"
              >
                {/* Track Info */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="relative size-12 rounded-lg overflow-hidden bg-th-recessed shrink-0 border border-th-border">
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
                      <div className="w-full h-full flex items-center justify-center text-th-muted">
                        <Music2 className="size-5" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-th-text truncate group-hover:text-th-accent transition-colors">
                      {item.title}
                    </h4>
                    <p className="text-[11px] text-th-secondary truncate mt-0.5">
                      {item.artist}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 font-mono text-[10px] text-th-muted">
                      <span>{item.duration}</span>
                      {item.isKaraoke && (
                        <span className="text-pink-500 font-bold bg-pink-500/10 px-1.5 rounded">
                          KARAOKE
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={actionLoadingId !== null}
                    onClick={() => void handlePlayNow(item)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-semibold transition-all shadow-sm active:scale-95 disabled:opacity-50"
                  >
                    {actionLoadingId === `play-${item.videoId}` ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Play className="size-3.5 fill-current" />
                    )}
                    <span>Poner Ahora</span>
                  </button>

                  <button
                    type="button"
                    disabled={actionLoadingId !== null}
                    onClick={() => void handleEnqueueTop(item)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-th-accent hover:bg-th-accent-hover text-th-on-accent font-mono text-xs font-semibold transition-all shadow-sm active:scale-95 disabled:opacity-50"
                  >
                    {actionLoadingId === `queue-${item.videoId}` ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Plus className="size-3.5" />
                    )}
                    <span>Encolar</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
