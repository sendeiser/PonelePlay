export interface LyricLine {
  timeSec: number;
  text: string;
}

export type LyricsSource =
  | "youtube_captions"
  | "youtube_asr"
  | "lrclib_synced"
  | "lrclib_plain"
  | "lyrics_ovh"
  | "none";

export interface ParsedLyricsResult {
  found: boolean;
  synced: boolean;
  source: LyricsSource;
  trackName?: string;
  artistName?: string;
  lines: LyricLine[];
  plainLines: string[];
}

const NOISE_PATTERNS: RegExp[] = [
  /\((?:official|video|audio|lyric|lyrics|letra|karaoke|pista|instrumental|hd|4k|hq|live|en vivo|visualizer|remastered|version|versión|explicit|clean|prod\.?[^)]*|ft\.?[^)]*|feat\.?[^)]*|con letra[^)]*|sub\.?[^)]*)[^)]*\)/gi,
  /\[(?:official|video|audio|lyric|lyrics|letra|karaoke|pista|instrumental|hd|4k|hq|live|en vivo|visualizer|remastered|version|versión|explicit|clean|ft\.?[^\]]*|feat\.?[^\]]*|con letra[^\]]*|sub\.?[^\]]*)[^\]]*\]/gi,
  /\b(?:official\s+music\s+video|official\s+video|official\s+audio|video\s+oficial|audio\s+oficial|letra\s+oficial|con\s+letra|pista\s+karaoke|karaoke\s+con\s+letra|karaoke\s+version|versión\s+karaoke|version\s+karaoke|lyrics?|karaoke|instrumental|hd|4k)\b/gi,
  /\|.*$/g,
];

const CAPTION_NOISE_REGEX =
  /^\s*[\[(]?(?:m[uú]sica|music|aplausos|applause|risas|laughter|instrumental|intro|outro|silencio|♪+|♫+)[\])]?\s*$/i;

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code);
      return Number.isFinite(n) ? String.fromCharCode(n) : "";
    });
}

function stripNoise(input: string): string {
  let out = decodeXmlEntities(input).replace(/🎤|🎵|🎶|🔥|✨|⭐|🎧/g, " ");
  for (const rx of NOISE_PATTERNS) {
    out = out.replace(rx, " ");
  }
  return out
    .replace(/\s*\(\s*\)\s*/g, " ")
    .replace(/\s*\[\s*\]\s*/g, " ")
    .replace(/\s*[-–—:]\s*$/, "")
    .replace(/^\s*[-–—:]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts clean song title and artist from messy YouTube / Karaoke titles such as:
 * "Soda Stereo - De Música Ligera (Video Oficial) [Karaoke HD]"
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
    .replace(/\bKaraoke\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  // If the YouTube title itself embeds "Artist - Song", split cleanly
  const dashMatch = cleanedTitleFull.match(/^(.{2,60}?)\s+[-–—]\s+(.{2,100})$/);
  if (dashMatch) {
    const left = dashMatch[1].trim();
    const right = dashMatch[2].trim();
    return { title: right, artist: left };
  }

  const lowerArtist = cleanedArtistRaw.toLowerCase();
  const isGenericArtist =
    !cleanedArtistRaw ||
    lowerArtist === "youtube" ||
    lowerArtist === "artista" ||
    lowerArtist === "desconocido" ||
    lowerArtist.includes("karaoke") ||
    lowerArtist.includes("pista") ||
    lowerArtist.includes("letras");

  return {
    title: cleanedTitleFull || (rawTitle || "").trim(),
    artist: isGenericArtist ? "" : cleanedArtistRaw,
  };
}

/**
 * Parses standard LRC format ("[mm:ss.xx] line text") into sorted LyricLine entries.
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
    if (!text || CAPTION_NOISE_REGEX.test(text)) continue;

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
 * Parses YouTube timedtext JSON3 format (`events[].tStartMs` + `segs[].utf8`).
 */
export function parseYoutubeJson3Captions(payload: unknown): LyricLine[] {
  if (!payload || typeof payload !== "object") return [];
  const events = (payload as { events?: unknown }).events;
  if (!Array.isArray(events)) return [];

  const results: LyricLine[] = [];
  for (const ev of events) {
    if (!ev || typeof ev !== "object") continue;
    const rec = ev as { tStartMs?: unknown; segs?: unknown };
    const startMs = typeof rec.tStartMs === "number" ? rec.tStartMs : -1;
    if (startMs < 0 || !Array.isArray(rec.segs)) continue;

    const rawText = rec.segs
      .map((seg) => (seg && typeof seg === "object" && typeof (seg as { utf8?: unknown }).utf8 === "string" ? (seg as { utf8: string }).utf8 : ""))
      .join("")
      .replace(/\r?\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const cleaned = decodeXmlEntities(rawText).trim();
    if (!cleaned || CAPTION_NOISE_REGEX.test(cleaned)) continue;

    const timeSec = Math.round(startMs) / 1000;
    const prev = results[results.length - 1];
    if (prev && prev.text === cleaned && Math.abs(prev.timeSec - timeSec) < 0.8) {
      continue;
    }
    results.push({ timeSec, text: cleaned });
  }

  results.sort((a, b) => a.timeSec - b.timeSec);
  return results;
}

/**
 * Parses YouTube timedtext XML format (`<text start="12.34" dur="2.1">Hello</text>`).
 */
export function parseYoutubeXmlCaptions(xml: string | null | undefined): LyricLine[] {
  if (!xml || !xml.trim()) return [];
  const results: LyricLine[] = [];
  const rx = /<text\b[^>]*\bstart="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/gi;
  let match: RegExpExecArray | null = rx.exec(xml);
  while (match !== null) {
    const startSec = Number(match[1]);
    const text = decodeXmlEntities(match[2].replace(/<[^>]+>/g, " "))
      .replace(/\r?\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (Number.isFinite(startSec) && startSec >= 0 && text && !CAPTION_NOISE_REGEX.test(text)) {
      results.push({ timeSec: Math.round(startSec * 1000) / 1000, text });
    }
    match = rx.exec(xml);
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
    .filter((line) => line.length > 0 && !CAPTION_NOISE_REGEX.test(line));
}

/**
 * Returns the active lyric line index for the given playback position + optional manual offsetSec.
 * Positive offsetSec advances the lyrics (use when lyrics are lagging behind the audio);
 * negative offsetSec delays the lyrics (use when video has an extra intro).
 */
export function resolveActiveLyricIndex(
  lines: LyricLine[],
  plainLines: string[],
  elapsedSec: number,
  durationSec: number,
  offsetSec = 0,
): number {
  const safeOffset = Number.isFinite(offsetSec) ? Math.max(-15, Math.min(15, offsetSec)) : 0;
  const effectiveElapsed = Math.max(0, elapsedSec + safeOffset);

  if (lines.length > 0) {
    // Small 0.25s lead so singers see the cue right on the beat
    const target = effectiveElapsed + 0.25;
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
    const ratio = Math.max(0, Math.min(0.999, (effectiveElapsed - safeDur * 0.04) / (safeDur * 0.9)));
    return Math.min(plainLines.length - 1, Math.floor(ratio * plainLines.length));
  }

  return -1;
}
