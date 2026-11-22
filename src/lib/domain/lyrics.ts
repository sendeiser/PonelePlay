export interface LyricLine {
  timeSec: number;
  text: string;
}

export interface ParsedLyricsResult {
  found: boolean;
  synced: boolean;
  trackName?: string;
  artistName?: string;
  lines: LyricLine[];
  plainLines: string[];
}

const NOISE_PATTERNS: RegExp[] = [
  /\((?:official|video|audio|lyric|lyrics|letra|karaoke|hd|4k|hq|live|en vivo|visualizer|remastered|version|versión|explicit|clean|prod\.?[^)]*|ft\.?[^)]*|feat\.?[^)]*)[^)]*\)/gi,
  /\[(?:official|video|audio|lyric|lyrics|letra|karaoke|hd|4k|hq|live|en vivo|visualizer|remastered|version|versión|explicit|clean|ft\.?[^\]]*|feat\.?[^\]]*)[^\]]*\]/gi,
  /\b(?:official\s+music\s+video|official\s+video|official\s+audio|video\s+oficial|audio\s+oficial|letra\s+oficial|con\s+letra|lyrics?|karaoke\s+version|versión\s+karaoke|karaoke|instrumental|hd|4k)\b/gi,
  /\|.*$/g,
];

function stripNoise(input: string): string {
  let out = input
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/🎤|🎵|🎶|🔥|✨/g, " ");
  for (const rx of NOISE_PATTERNS) {
    out = out.replace(rx, " ");
  }
  return out
    .replace(/\s*[-–—:]\s*$/, "")
    .replace(/^\s*[-–—:]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts clean song title and artist from messy YouTube titles such as:
 * "Soda Stereo - De Música Ligera (Video Oficial) [Karaoke]"
 */
export function cleanTrackQuery(
  rawTitle: string,
  rawArtist?: string | null,
): { title: string; artist: string } {
  const cleanedTitleFull = stripNoise(rawTitle || "");
  const cleanedArtistRaw = stripNoise(rawArtist || "")
    .replace(/\s*-\s*Topic$/i, "")
    .replace(/\bVEVO\b/gi, "")
    .replace(/\bOficial\b/gi, "")
    .replace(/\bOfficial\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  // If the YouTube title itself embeds "Artist - Song", split cleanly
  const dashMatch = cleanedTitleFull.match(/^(.{2,60}?)\s+[-–—]\s+(.{2,100})$/);
  if (dashMatch) {
    const left = dashMatch[1].trim();
    const right = dashMatch[2].trim();
    const genericArtist =
      !cleanedArtistRaw ||
      cleanedArtistRaw.toLowerCase() === "youtube" ||
      cleanedArtistRaw.toLowerCase() === "artista" ||
      cleanedArtistRaw.toLowerCase() === "desconocido" ||
      cleanedArtistRaw.toLowerCase().includes("karaoke") ||
      cleanedArtistRaw.toLowerCase().includes("letras");
    if (genericArtist) {
      return { title: right, artist: left };
    }
    // If left matches or contains artist, use right as clean title
    if (
      left.toLowerCase().includes(cleanedArtistRaw.toLowerCase()) ||
      cleanedArtistRaw.toLowerCase().includes(left.toLowerCase())
    ) {
      return { title: right, artist: left };
    }
    return { title: right, artist: left };
  }

  return {
    title: cleanedTitleFull || (rawTitle || "").trim(),
    artist:
      cleanedArtistRaw.toLowerCase() === "youtube" ||
      cleanedArtistRaw.toLowerCase() === "artista" ||
      cleanedArtistRaw.toLowerCase() === "desconocido"
        ? ""
        : cleanedArtistRaw,
  };
}

/**
 * Parses standard LRC format ("[mm:ss.xx] line text") into sorted LyricLine entries.
 * Supports multiple timestamps per line ("[00:12.00][01:02.50] Chorus").
 */
export function parseLrcLyrics(lrc: string | null | undefined): LyricLine[] {
  if (!lrc || !lrc.trim()) return [];
  const results: LyricLine[] = [];
  const rawLines = lrc.split(/\r?\n/);
  const tagRegex = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

  for (const raw of rawLines) {
    const matches = Array.from(raw.matchAll(tagRegex));
    if (matches.length === 0) continue;
    const text = raw.replace(tagRegex, "").trim();
    if (!text) continue;

    for (const m of matches) {
      const mins = Number(m[1] || 0);
      const secs = Number(m[2] || 0);
      const fracRaw = m[3] || "0";
      const frac =
        fracRaw.length === 3
          ? Number(fracRaw) / 1000
          : fracRaw.length === 2
            ? Number(fracRaw) / 100
            : Number(fracRaw) / 10;
      const timeSec = Math.round((mins * 60 + secs + frac) * 1000) / 1000;
      if (Number.isFinite(timeSec) && timeSec >= 0) {
        results.push({ timeSec, text });
      }
    }
  }

  results.sort((a, b) => a.timeSec - b.timeSec);
  return results;
}

/**
 * Splits plain (unsynced) lyrics into clean displayable lines.
 */
export function parsePlainLyrics(plain: string | null | undefined): string[] {
  if (!plain || !plain.trim()) return [];
  return plain
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Returns the active lyric line index for the given playback position.
 * Works for both timestamped LRC lines and proportional plain-text fallback.
 */
export function resolveActiveLyricIndex(
  lines: LyricLine[],
  plainLines: string[],
  elapsedSec: number,
  durationSec: number,
): number {
  const safeElapsed = Math.max(0, elapsedSec);

  if (lines.length > 0) {
    // Small 0.25s lead so singers see the cue right on the beat
    const target = safeElapsed + 0.25;
    let active = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].timeSec <= target) {
        active = i;
      } else {
        break;
      }
    }
    return Math.max(0, active);
  }

  if (plainLines.length > 0) {
    const safeDur = Math.max(15, durationSec || 210);
    // Reserve small 6% intro & 6% outro margin for proportional scrolling
    const ratio = Math.max(0, Math.min(0.999, (safeElapsed - safeDur * 0.04) / (safeDur * 0.9)));
    return Math.min(plainLines.length - 1, Math.floor(ratio * plainLines.length));
  }

  return -1;
}
