"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Loader2, Music2, Play, Plus, Search, Sparkles, X, Mic } from "lucide-react";
import { searchYouTube, type SearchResult } from "@/lib/api/proposals";
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
  const [searching, setSearching] = useState(false);
  const [isKaraoke, setIsKaraoke] = useState(defaultKaraoke);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setIsKaraoke(defaultKaraoke);
  }, [defaultKaraoke]);

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
        const data = await searchYouTube(query, isKaraoke);
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
  }, [query, isKaraoke]);

  if (!isOpen) return null;

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl bg-[#0e121e] border border-[#232b42] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E2333] bg-[#0A0E17]/90">
          <div className="flex items-center gap-3">
            <div className={`size-10 rounded-xl flex items-center justify-center text-white ${
              isKaraoke
                ? "bg-gradient-to-br from-pink-600 to-purple-600 shadow-lg shadow-pink-500/25"
                : "bg-gradient-to-br from-indigo-600 to-violet-600 shadow-lg shadow-indigo-600/25"
            }`}>
              <span className="material-symbols-outlined text-[22px]">
                {isKaraoke ? "mic_external_on" : "settings_remote"}
              </span>
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Poner Canción Manualmente</span>
                {isKaraoke ? (
                  <span className="text-[10px] bg-pink-500/20 text-pink-300 border border-pink-500/40 px-2 py-0.5 rounded-full font-mono uppercase font-bold">
                    Modo Karaoke
                  </span>
                ) : (
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-2 py-0.5 rounded-full font-mono uppercase font-bold">
                    Staff / Admin VIP
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                {isKaraoke
                  ? "Búsqueda con filtro karaoke estricto · Videos más vistos de YouTube"
                  : "Reproducí de inmediato en la TV o insertá al tope de la cola"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Search & Mode Toggles */}
        <div className="p-5 border-b border-[#1E2333] bg-[#121624] space-y-3">
          {/* Mode Tabs */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsKaraoke(false)}
              className={`flex-1 py-2 px-3 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center gap-2 border ${
                !isKaraoke
                  ? "bg-indigo-600/30 text-indigo-200 border-indigo-500/60 shadow-md shadow-indigo-600/20"
                  : "bg-[#181b25] text-slate-400 border-[#232b42] hover:text-white"
              }`}
            >
              <span className="material-symbols-outlined text-base">smart_display</span>
              <span>YouTube Estándar</span>
            </button>

            <button
              type="button"
              onClick={() => setIsKaraoke(true)}
              className={`flex-1 py-2 px-3 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center gap-2 border ${
                isKaraoke
                  ? "bg-pink-600/30 text-pink-200 border-pink-500/60 shadow-md shadow-pink-600/20"
                  : "bg-[#181b25] text-slate-400 border-[#232b42] hover:text-pink-300"
              }`}
            >
              <Mic className="size-4 text-pink-400" />
              <span>🎤 Modo Karaoke (Más Vistos)</span>
            </button>
          </div>

          {/* Search Input Bar */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              {searching ? (
                <Loader2 className="size-4 animate-spin text-indigo-400" />
              ) : (
                <Search className="size-4" />
              )}
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                isKaraoke
                  ? "Escribí el tema o artista (ej: Soda Stereo, Queen, Luis Miguel)..."
                  : "Buscar en YouTube o pegar URL..."
              }
              className="w-full pl-10 pr-10 py-3 bg-[#0a0e17] border border-[#232b42] focus:border-indigo-500 rounded-xl text-sm text-white placeholder-slate-500 font-sans outline-none transition-all shadow-inner"
              autoFocus
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {/* Banner notification / feedback */}
          {feedback && (
            <div className="p-2.5 rounded-lg bg-indigo-950/40 border border-indigo-500/40 text-indigo-200 text-xs font-mono flex items-center gap-2 animate-fade-in">
              <Sparkles className="size-4 text-cyan-400 shrink-0" />
              <span>{feedback}</span>
            </div>
          )}
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-[260px] custom-scrollbar">
          {searching ? (
            <div className="h-48 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="size-6 animate-spin text-indigo-400" />
              <span className="font-mono text-xs">
                {isKaraoke
                  ? "Buscando versiones karaoke más vistas..."
                  : "Buscando en YouTube..."}
              </span>
            </div>
          ) : results.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-slate-500 gap-2 text-center px-4">
              <Music2 className="size-8 stroke-[1.5] text-slate-600" />
              <p className="text-xs font-mono">
                {query.trim()
                  ? "No se encontraron resultados para esta búsqueda."
                  : isKaraoke
                    ? "Escribí una canción para buscar las versiones Karaoke con más visualizaciones."
                    : "Escribí el nombre de una canción, artista o pegá un enlace de YouTube."}
              </p>
            </div>
          ) : (
            results.map((item) => (
              <div
                key={item.videoId}
                className="flex items-center justify-between p-3 rounded-xl bg-[#141824] hover:bg-[#1a2030] border border-[#232b42] transition-colors gap-3"
              >
                {/* Thumbnail */}
                <div className="relative size-14 rounded-lg overflow-hidden shrink-0 bg-[#0a0e17] border border-white/5">
                  {item.thumbnailUrl ? (
                    <Image
                      src={item.thumbnailUrl}
                      alt={item.title}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-600">
                      <Music2 className="size-6" />
                    </div>
                  )}
                  <div className="absolute bottom-1 right-1 bg-black/85 px-1 py-0.2 rounded text-[9px] font-mono font-bold text-white">
                    {item.duration}
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-xs font-semibold text-white truncate max-w-full">
                      {item.title}
                    </p>
                    {item.isKaraoke && (
                      <span className="text-[9px] bg-pink-500/20 text-pink-300 border border-pink-500/30 px-1.5 py-0.2 rounded font-mono font-bold">
                        KARAOKE
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
                    <span>{item.artist}</span>
                    {item.views && (
                      <>
                        <span>•</span>
                        <span className="text-cyan-400 font-semibold">{item.views}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions: Reproducir Ya vs Poner Siguiente */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Reproducir Ya */}
                  <button
                    type="button"
                    disabled={Boolean(actionLoadingId)}
                    onClick={() => void handlePlayNow(item)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold transition-all shadow-md shadow-emerald-600/20 active:scale-95 disabled:opacity-50"
                    title="Reproducir de inmediato en la pantalla de TV"
                  >
                    {actionLoadingId === `play-${item.videoId}` ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Play className="size-3.5 fill-current" />
                    )}
                    <span>Reproducir Ya</span>
                  </button>

                  {/* Poner Siguiente */}
                  <button
                    type="button"
                    disabled={Boolean(actionLoadingId)}
                    onClick={() => void handleEnqueueTop(item)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#202534] hover:bg-indigo-600/30 text-indigo-300 hover:text-white border border-indigo-500/40 font-mono text-xs font-bold transition-all active:scale-95 disabled:opacity-50"
                    title="Insertar al tope de la cola con prioridad"
                  >
                    {actionLoadingId === `queue-${item.videoId}` ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Plus className="size-3.5" />
                    )}
                    <span>Poner Siguiente</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-[#1E2333] bg-[#0A0E17]/90 flex items-center justify-between">
          <span className="text-xs font-mono text-slate-400">
            Control Maestro en Vivo · Sincronizado con Pantallas TV
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#181b25] hover:bg-[#202534] text-slate-300 hover:text-white font-mono text-xs font-bold transition-colors border border-[#232b42]"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
