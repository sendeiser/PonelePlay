export type KaraokeOverrideMode = "auto" | "force_video" | "force_lyrics" | "off";
export type KaraokePresentation = "none" | "video" | "lyrics";

export interface KaraokeTrackLike {
  title?: string | null;
  artist?: string | null;
  source?: string | null;
  youtubeVideoId?: string | null;
  isKaraoke?: boolean | null;
}

const KARAOKE_KEYWORD_REGEX =
  /\b(?:karaoke|pista\s+karaoke|con\s+letra|sing\s*along|sing\s+king|karafun|versi[oó]n\s+karaoke|karaoke\s+version|instrumental\s+con\s+letra|pista\s+musical)\b/i;

/**
 * Returns true when a track is explicitly marked as karaoke or its YouTube title/channel
 * clearly identifies a karaoke / sing-along video with burned-in lyrics.
 * Intentionally avoids false positives on bare "instrumental" tracks.
 */
export function isTrackKaraokeCandidate(
  track: KaraokeTrackLike | null | undefined,
): boolean {
  if (!track) return false;
  if (track.isKaraoke === true) return true;
  const combined = `${track.title ?? ""} ${track.artist ?? ""}`.trim();
  if (!combined) return false;
  return KARAOKE_KEYWORD_REGEX.test(combined);
}

/**
 * Resolves the active Karaoke presentation for TV (Web & Android TV) and Cabina:
 * - "video": promotes the single YouTube surface to fullscreen (with burned-in karaoke lyrics)
 * - "lyrics": keeps 0% video and renders synchronized lyrics overlay (/api/lyrics + ±0.5s offset)
 * - "none": standard 0%-video music mode (SALON / PORTADA)
 */
export function resolveKaraokePresentation(params: {
  track: KaraokeTrackLike | null | undefined;
  boothKaraokeMode: boolean;
  overrideMode?: KaraokeOverrideMode;
  videoEmbedFailed?: boolean;
}): KaraokePresentation {
  const {
    track,
    boothKaraokeMode,
    overrideMode = "auto",
    videoEmbedFailed = false,
  } = params;

  if (overrideMode === "off") return "none";

  const canShowYoutubeVideo = Boolean(
    track &&
      track.source !== "upload" &&
      typeof track.youtubeVideoId === "string" &&
      track.youtubeVideoId.trim().length > 0 &&
      !videoEmbedFailed,
  );

  if (overrideMode === "force_video") {
    return canShowYoutubeVideo ? "video" : "lyrics";
  }
  if (overrideMode === "force_lyrics") {
    return "lyrics";
  }

  // Auto mode: YouTube karaoke tracks get fullscreen video; normal tracks in Karaoke mode get 0%-video lyrics
  if (isTrackKaraokeCandidate(track)) {
    return canShowYoutubeVideo ? "video" : "lyrics";
  }

  return boothKaraokeMode ? "lyrics" : "none";
}

export function normalizeKaraokeOverrideMode(raw: unknown): KaraokeOverrideMode {
  if (raw === "force_video" || raw === "force_lyrics" || raw === "off" || raw === "auto") {
    return raw;
  }
  return "auto";
}
