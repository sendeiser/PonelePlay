"use client";

import { useEffect, useMemo, useState } from "react";
import { Mic } from "lucide-react";
import {
  resolveActiveLyricIndex,
  type LyricLine,
  type LyricsSource,
  type ParsedLyricsResult,
} from "@/lib/domain/lyrics";

export interface KaraokeLyricsOverlayProps {
  title: string;
  artist: string;
  videoId?: string | null;
  durationSec: number;
  elapsedSec: number;
  offsetSec?: number;
  onAdjustOffset?: (deltaSec: number) => void;
  onResetOffset?: () => void;
  isPlaying: boolean;
  /** "compact" fits inside SALON hero column; "stage" fills center showcase in PORTADA mode. */
  variant?: "compact" | "stage";
}

const CLIENT_LYRICS_CACHE = new Map<string, ParsedLyricsResult>();

function sourceBadgeLabel(source: LyricsSource, synced: boolean): string {
  switch (source) {
    case "youtube_captions":
      return "⚡ Subtítulos YouTube";
    case "youtube_asr":
      return "⚡ Subtítulos Auto YT";
    case "lrclib_synced":
      return "⚡ Letra Sincronizada";
    case "lrclib_plain":
    case "lyrics_ovh":
      return "📝 Letra Estimada";
    default:
      return synced ? "⚡ Sincronizada" : "🎤 Cantá en vivo";
  }
}

export function KaraokeLyricsOverlay({
  title,
  artist,
  videoId,
  durationSec,
  elapsedSec,
  offsetSec = 0,
  onAdjustOffset,
  onResetOffset,
  isPlaying,
  variant = "stage",
}: KaraokeLyricsOverlayProps) {
  const cleanVid = (videoId || "").trim();
  const cacheKey = `${cleanVid}|${title.trim().toLowerCase()}|${artist.trim().toLowerCase()}`;
  const [loading, setLoading] = useState(false);
  const [lyrics, setLyrics] = useState<ParsedLyricsResult | null>(
    () => CLIENT_LYRICS_CACHE.get(cacheKey) ?? null,
  );

  useEffect(() => {
    const cleanTitle = title.trim();
    if (!cleanTitle && !cleanVid) {
      setLyrics(null);
      return;
    }

    const cached = CLIENT_LYRICS_CACHE.get(cacheKey);
    if (cached) {
      setLyrics(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({
      title: cleanTitle,
      artist: artist.trim(),
      duration: String(Math.round(durationSec || 0)),
    });
    if (cleanVid) {
      params.set("videoId", cleanVid);
    }

    void fetch(`/api/lyrics?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        const parsed: ParsedLyricsResult = data?.found
          ? {
              found: true,
              synced: Boolean(data.synced),
              source: (data.source as LyricsSource) || (data.synced ? "lrclib_synced" : "lrclib_plain"),
              trackName: data.trackName,
              artistName: data.artistName,
              lines: Array.isArray(data.lines) ? (data.lines as LyricLine[]) : [],
              plainLines: Array.isArray(data.plainLines) ? (data.plainLines as string[]) : [],
            }
          : { found: false, synced: false, source: "none", lines: [], plainLines: [] };
        CLIENT_LYRICS_CACHE.set(cacheKey, parsed);
        setLyrics(parsed);
      })
      .catch(() => {
        if (!cancelled) {
          setLyrics({ found: false, synced: false, source: "none", lines: [], plainLines: [] });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, title, artist, cleanVid, durationSec]);

  const displayLines = useMemo(() => {
    if (!lyrics?.found) return [];
    return lyrics.lines.length > 0 ? lyrics.lines.map((l) => l.text) : lyrics.plainLines;
  }, [lyrics]);

  const activeIdx = useMemo(() => {
    if (!lyrics?.found) return -1;
    return resolveActiveLyricIndex(
      lyrics.lines,
      lyrics.plainLines,
      elapsedSec,
      durationSec,
      offsetSec,
    );
  }, [lyrics, elapsedSec, durationSec, offsetSec]);

  const isStage = variant === "stage";
  const roundedOffset = Math.round(offsetSec * 10) / 10;
  const formattedOffset = `${roundedOffset > 0 ? "+" : ""}${roundedOffset.toFixed(1)}s`;

  return (
    <div
      data-testid="karaoke-lyrics-overlay"
      className={`w-full rounded-2xl border border-pink-500/45 bg-gradient-to-b from-[#1a0b2e]/90 via-[#100920]/92 to-[#090d1a]/95 backdrop-blur-md shadow-2xl flex flex-col justify-between overflow-hidden ${
        isStage ? "px-6 py-5 min-h-[260px] sm:min-h-[310px]" : "px-3.5 py-3 min-h-[168px]"
      }`}
    >
      {/* Top Karaoke Header + Live Offset Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-pink-500/25">
        <div className="inline-flex items-center gap-1.5">
          <span className="size-5 rounded-md bg-pink-500/25 border border-pink-400/50 flex items-center justify-center">
            <Mic className="size-3 text-pink-300" />
          </span>
          <span className="font-mono text-[10px] sm:text-xs font-extrabold uppercase tracking-widest text-pink-300">
            Karaoke en Vivo
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onAdjustOffset && lyrics?.found && (
            <div className="inline-flex items-center gap-1 bg-black/45 border border-white/15 rounded-lg px-1.5 py-0.5 font-mono text-[10px]">
              <button
                type="button"
                onClick={() => onAdjustOffset(-0.5)}
                className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-pink-500/40 text-white font-bold transition-colors cursor-pointer"
                title="Atrasar letra 0.5s (Tecla [)"
              >
                -0.5s
              </button>
              <button
                type="button"
                onClick={() => onResetOffset?.()}
                className={`px-1.5 py-0.5 rounded font-bold cursor-pointer ${
                  roundedOffset === 0 ? "text-slate-300" : "text-amber-300 bg-amber-500/15"
                }`}
                title="Resetear desfase de letra a 0.0s"
              >
                {formattedOffset}
              </button>
              <button
                type="button"
                onClick={() => onAdjustOffset(0.5)}
                className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-cyan-500/40 text-white font-bold transition-colors cursor-pointer"
                title="Adelantar letra 0.5s (Tecla ])"
              >
                +0.5s
              </button>
            </div>
          )}

          <span className="font-mono text-[10px] text-cyan-300/90 font-semibold">
            {loading
              ? "Buscando letra..."
              : lyrics?.found
                ? sourceBadgeLabel(lyrics.source, lyrics.synced)
                : isPlaying
                  ? "🎤 Cantá en vivo"
                  : "⏸ En pausa"}
          </span>
        </div>
      </div>

      {/* Main Synchronized Lyric Lines */}
      <div
        className={`flex-1 flex flex-col items-center justify-center text-center ${
          isStage ? "gap-3 py-4" : "gap-1.5 py-2.5"
        }`}
      >
        {loading ? (
          <p className="font-mono text-xs sm:text-sm text-pink-200/80 animate-pulse">
            Buscando letra y subtítulos de {title}...
          </p>
        ) : displayLines.length > 0 && activeIdx >= 0 ? (
          <>
            {/* Previous Line */}
            <p
              className={`font-semibold text-slate-400/70 transition-all duration-300 line-clamp-1 ${
                isStage ? "text-sm sm:text-lg" : "text-[11px]"
              }`}
            >
              {activeIdx > 0 ? displayLines[activeIdx - 1] : "♪ ♪ ♪"}
            </p>

            {/* Current Active Line (Highlighted) */}
            <p
              className={`font-black text-white tracking-tight leading-snug drop-shadow-[0_0_16px_rgba(236,72,153,0.75)] transition-all duration-300 ${
                isStage ? "text-xl sm:text-3xl md:text-4xl px-2" : "text-sm sm:text-base px-1"
              }`}
            >
              {displayLines[activeIdx]}
            </p>

            {/* Next Line 1 */}
            {activeIdx + 1 < displayLines.length && (
              <p
                className={`font-bold text-cyan-200/90 transition-all duration-300 line-clamp-1 ${
                  isStage ? "text-base sm:text-xl" : "text-xs"
                }`}
              >
                {displayLines[activeIdx + 1]}
              </p>
            )}

            {/* Next Line 2 */}
            {activeIdx + 2 < displayLines.length && (
              <p
                className={`font-medium text-slate-300/65 transition-all duration-300 line-clamp-1 ${
                  isStage ? "text-sm sm:text-base" : "text-[11px]"
                }`}
              >
                {displayLines[activeIdx + 2]}
              </p>
            )}
          </>
        ) : (
          <div className="space-y-1">
            <p
              className={`font-bold text-pink-200 ${isStage ? "text-lg sm:text-2xl" : "text-xs"}`}
            >
              🎤 Modo Karaoke Activo
            </p>
            <p className="font-mono text-[11px] text-slate-400">
              No se encontró letra ni subtítulos de YouTube para esta pista.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
