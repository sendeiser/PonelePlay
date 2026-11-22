import { NextRequest, NextResponse } from "next/server";
import {
  cleanTrackQuery,
  parseLrcLyrics,
  parsePlainLyrics,
  parseYoutubeJson3Captions,
  parseYoutubeXmlCaptions,
  type LyricLine,
  type ParsedLyricsResult,
} from "@/lib/domain/lyrics";

export const dynamic = "force-dynamic";

interface LrcLibRecord {
  trackName?: string;
  artistName?: string;
  duration?: number;
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  instrumental?: boolean;
}

interface YoutubeCaptionTrack {
  baseUrl?: string;
  languageCode?: string;
  kind?: string;
}

interface CacheItem {
  value: ParsedLyricsResult;
  expiresAt: number;
}

const LYRICS_CACHE = new Map<string, CacheItem>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const NEGATIVE_CACHE_TTL_MS = 60 * 1000;
const MAX_CACHE_SIZE = 250;

const RESPONSE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Netlify-CDN-Cache-Control": "no-store",
};

function setCache(key: string, value: ParsedLyricsResult) {
  if (LYRICS_CACHE.size >= MAX_CACHE_SIZE) {
    const oldest = LYRICS_CACHE.keys().next().value;
    if (oldest) LYRICS_CACHE.delete(oldest);
  }
  const ttl = value.found ? CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS;
  LYRICS_CACHE.set(key, { value, expiresAt: Date.now() + ttl });
}

function stripAccents(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildResultFromLrcLib(rec: LrcLibRecord | null | undefined): ParsedLyricsResult | null {
  if (!rec) return null;
  const syncedLines = parseLrcLyrics(rec.syncedLyrics);
  const plainLines = parsePlainLyrics(rec.plainLyrics);
  if (syncedLines.length === 0 && plainLines.length === 0) return null;

  return {
    found: true,
    synced: syncedLines.length > 0,
    source: syncedLines.length > 0 ? "lrclib_synced" : "lrclib_plain",
    trackName: rec.trackName || undefined,
    artistName: rec.artistName || undefined,
    lines: syncedLines,
    plainLines: plainLines.length > 0 ? plainLines : syncedLines.map((l) => l.text),
  };
}

function pickBestSearchRecord(
  records: LrcLibRecord[],
  targetDurationSec: number,
): LrcLibRecord | null {
  const usable = records.filter(
    (r) =>
      !r.instrumental &&
      ((r.syncedLyrics && r.syncedLyrics.trim()) || (r.plainLyrics && r.plainLyrics.trim())),
  );
  if (usable.length === 0) return null;

  usable.sort((a, b) => {
    const aSynced = a.syncedLyrics && a.syncedLyrics.trim() ? 1 : 0;
    const bSynced = b.syncedLyrics && b.syncedLyrics.trim() ? 1 : 0;
    if (aSynced !== bSynced) return bSynced - aSynced;

    if (targetDurationSec > 0) {
      const aDiff = typeof a.duration === "number" ? Math.abs(a.duration - targetDurationSec) : 999;
      const bDiff = typeof b.duration === "number" ? Math.abs(b.duration - targetDurationSec) : 999;
      return aDiff - bDiff;
    }
    return 0;
  });

  return usable[0] ?? null;
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 4000): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "PonelePlay/3.2 (https://poneleplay.netlify.app)",
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTextWithTimeout(
  url: string,
  timeoutMs = 3500,
  extraHeaders?: Record<string, string>,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
        ...extraHeaders,
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches exact time-aligned captions directly from the YouTube video (`videoId`).
 * Returns both manual (high quality, exact timing) and ASR (auto-generated) results.
 */
async function fetchYoutubeVideoCaptions(videoId: string): Promise<{
  manual: LyricLine[];
  asr: LyricLine[];
}> {
  const cleanId = videoId.trim();
  if (!/^[A-Za-z0-9_-]{11}$/.test(cleanId)) {
    return { manual: [], asr: [] };
  }

  // 1. Try extracting captionTracks metadata from watch page (gives exact signed baseUrl + manual vs ASR)
  try {
    const html = await fetchTextWithTimeout(
      `https://www.youtube.com/watch?v=${encodeURIComponent(cleanId)}&hl=es`,
      3200,
    );
    if (html) {
      const idx = html.indexOf('"captionTracks":');
      if (idx !== -1) {
        const startBracket = html.indexOf("[", idx);
        if (startBracket !== -1) {
          let depth = 0;
          let endBracket = -1;
          for (let i = startBracket; i < Math.min(html.length, startBracket + 12000); i++) {
            if (html[i] === "[") depth++;
            else if (html[i] === "]") {
              depth--;
              if (depth === 0) {
                endBracket = i;
                break;
              }
            }
          }
          if (endBracket > startBracket) {
            const rawArr = html.slice(startBracket, endBracket + 1);
            const tracks = JSON.parse(rawArr) as YoutubeCaptionTrack[];
            if (Array.isArray(tracks) && tracks.length > 0) {
              const langScore = (lang?: string) => {
                const l = (lang || "").toLowerCase();
                if (l === "es" || l === "es-419" || l === "es-es" || l.startsWith("es")) return 3;
                if (l === "en" || l.startsWith("en")) return 2;
                return 1;
              };
              const manualTracks = tracks
                .filter((t) => t.baseUrl && t.kind !== "asr")
                .sort((a, b) => langScore(b.languageCode) - langScore(a.languageCode));
              const asrTracks = tracks
                .filter((t) => t.baseUrl && t.kind === "asr")
                .sort((a, b) => langScore(b.languageCode) - langScore(a.languageCode));

              const loadTrackLines = async (track?: YoutubeCaptionTrack): Promise<LyricLine[]> => {
                if (!track?.baseUrl) return [];
                const jsonUrl = track.baseUrl.includes("fmt=")
                  ? track.baseUrl
                  : `${track.baseUrl}&fmt=json3`;
                const jsonPayload = await fetchJsonWithTimeout<unknown>(jsonUrl, 3000);
                const fromJson3 = parseYoutubeJson3Captions(jsonPayload);
                if (fromJson3.length >= 4) return fromJson3;
                const xmlText = await fetchTextWithTimeout(track.baseUrl, 3000);
                return parseYoutubeXmlCaptions(xmlText);
              };

              const manualLines = await loadTrackLines(manualTracks[0]);
              if (manualLines.length >= 4) {
                return { manual: manualLines, asr: [] };
              }
              const asrLines = await loadTrackLines(asrTracks[0]);
              return { manual: [], asr: asrLines.length >= 4 ? asrLines : [] };
            }
          }
        }
      }
    }
  } catch {
    // Non-blocking fallback to timedtext endpoint below
  }

  // 2. Direct timedtext fallback (es / en)
  for (const lang of ["es", "es-419", "en"]) {
    const jsonPayload = await fetchJsonWithTimeout<unknown>(
      `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(cleanId)}&lang=${lang}&fmt=json3`,
      2200,
    );
    const lines = parseYoutubeJson3Captions(jsonPayload);
    if (lines.length >= 4) {
      return { manual: lines, asr: [] };
    }
  }

  return { manual: [], asr: [] };
}

async function fetchLyricsOvhFallback(
  artist: string,
  title: string,
): Promise<ParsedLyricsResult | null> {
  if (!artist || !title) return null;
  const data = await fetchJsonWithTimeout<{ lyrics?: string }>(
    `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
    2500,
  );
  const plainLines = parsePlainLyrics(data?.lyrics);
  if (plainLines.length < 3) return null;
  return {
    found: true,
    synced: false,
    source: "lyrics_ovh",
    trackName: title,
    artistName: artist,
    lines: [],
    plainLines,
  };
}

export async function GET(req: NextRequest) {
  const rawTitle = req.nextUrl.searchParams.get("title")?.trim() || "";
  const rawArtist = req.nextUrl.searchParams.get("artist")?.trim() || "";
  const rawVideoId = req.nextUrl.searchParams.get("videoId")?.trim() || "";
  const durationSec = Number(req.nextUrl.searchParams.get("duration") || 0);

  if (!rawTitle && !rawVideoId) {
    return NextResponse.json(
      {
        ok: false,
        found: false,
        synced: false,
        source: "none",
        lines: [],
        plainLines: [],
        error: "title_required",
      },
      { status: 400, headers: RESPONSE_HEADERS },
    );
  }

  const { title, artist } = cleanTrackQuery(rawTitle, rawArtist);
  const cacheKey = `${rawVideoId}|${title.toLowerCase()}|${artist.toLowerCase()}`;

  const cached = LYRICS_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ ok: true, ...cached.value }, { headers: RESPONSE_HEADERS });
  }

  // Launch YouTube captions lookup in parallel with LRCLIB lookup for minimum latency
  const ytCaptionsPromise = rawVideoId
    ? fetchYoutubeVideoCaptions(rawVideoId)
    : Promise.resolve({ manual: [] as LyricLine[], asr: [] as LyricLine[] });

  const lrcLibPromise = (async (): Promise<ParsedLyricsResult | null> => {
    let resolved: ParsedLyricsResult | null = null;
    if (title && artist) {
      const params = new URLSearchParams({
        track_name: title,
        artist_name: artist,
      });
      if (durationSec > 10 && durationSec < 1200) {
        params.set("duration", String(Math.round(durationSec)));
      }
      const exact = await fetchJsonWithTimeout<LrcLibRecord>(
        `https://lrclib.net/api/get?${params.toString()}`,
      );
      resolved = buildResultFromLrcLib(exact);
    }

    if (!resolved || !resolved.synced) {
      const query = [artist, title].filter(Boolean).join(" ").trim();
      if (query) {
        const searchParams = new URLSearchParams({ q: query });
        const list = await fetchJsonWithTimeout<LrcLibRecord[]>(
          `https://lrclib.net/api/search?${searchParams.toString()}`,
        );
        if (Array.isArray(list) && list.length > 0) {
          const candidate = buildResultFromLrcLib(pickBestSearchRecord(list, durationSec));
          if (candidate && (!resolved || candidate.synced)) {
            resolved = candidate;
          }
        }
      }
    }

    if ((!resolved || !resolved.synced) && title && artist) {
      const searchParams = new URLSearchParams({ q: title });
      const list = await fetchJsonWithTimeout<LrcLibRecord[]>(
        `https://lrclib.net/api/search?${searchParams.toString()}`,
      );
      if (Array.isArray(list) && list.length > 0) {
        const candidate = buildResultFromLrcLib(pickBestSearchRecord(list, durationSec));
        if (candidate && (!resolved || candidate.synced)) {
          resolved = candidate;
        }
      }
    }

    if ((!resolved || !resolved.synced) && title) {
      const asciiTitle = stripAccents(title);
      if (asciiTitle && asciiTitle.toLowerCase() !== title.toLowerCase()) {
        const searchParams = new URLSearchParams({ q: asciiTitle });
        const list = await fetchJsonWithTimeout<LrcLibRecord[]>(
          `https://lrclib.net/api/search?${searchParams.toString()}`,
        );
        if (Array.isArray(list) && list.length > 0) {
          const candidate = buildResultFromLrcLib(pickBestSearchRecord(list, durationSec));
          if (candidate && (!resolved || candidate.synced)) {
            resolved = candidate;
          }
        }
      }
    }
    return resolved;
  })();

  const [ytCaptions, lrcResult] = await Promise.all([ytCaptionsPromise, lrcLibPromise]);

  // Priority order (0% video, highest timing accuracy & coverage):
  // 1. Manual YouTube Captions (100% aligned to this exact videoId!)
  // 2. LRCLIB synced lyrics (clean studio lyrics with timestamps)
  // 3. YouTube Auto-Captions (ASR — exact timestamps for this videoId, covers local/cumbia/karaoke tracks)
  // 4. LRCLIB plain lyrics (proportional scrolling)
  // 5. lyrics.ovh plain lyrics fallback
  let finalResult: ParsedLyricsResult | null = null;

  if (ytCaptions.manual.length >= 4) {
    finalResult = {
      found: true,
      synced: true,
      source: "youtube_captions",
      trackName: title || rawTitle,
      artistName: artist || rawArtist,
      lines: ytCaptions.manual,
      plainLines: ytCaptions.manual.map((l) => l.text),
    };
  } else if (lrcResult?.found && lrcResult.synced) {
    finalResult = lrcResult;
  } else if (ytCaptions.asr.length >= 4) {
    finalResult = {
      found: true,
      synced: true,
      source: "youtube_asr",
      trackName: title || rawTitle,
      artistName: artist || rawArtist,
      lines: ytCaptions.asr,
      plainLines: ytCaptions.asr.map((l) => l.text),
    };
  } else if (lrcResult?.found) {
    finalResult = lrcResult;
  } else {
    finalResult = await fetchLyricsOvhFallback(artist, title);
  }

  const output: ParsedLyricsResult = finalResult ?? {
    found: false,
    synced: false,
    source: "none",
    lines: [],
    plainLines: [],
  };

  setCache(cacheKey, output);
  return NextResponse.json({ ok: true, ...output }, { headers: RESPONSE_HEADERS });
}
