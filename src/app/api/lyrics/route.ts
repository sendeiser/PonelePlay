import { NextRequest, NextResponse } from "next/server";
import {
  cleanTrackQuery,
  parseLrcLyrics,
  parsePlainLyrics,
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

interface CacheItem {
  value: ParsedLyricsResult;
  expiresAt: number;
}

const LYRICS_CACHE = new Map<string, CacheItem>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE_SIZE = 200;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=300",
};

function setCache(key: string, value: ParsedLyricsResult) {
  if (LYRICS_CACHE.size >= MAX_CACHE_SIZE) {
    const oldest = LYRICS_CACHE.keys().next().value;
    if (oldest) LYRICS_CACHE.delete(oldest);
  }
  LYRICS_CACHE.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function buildResultFromRecord(rec: LrcLibRecord | null | undefined): ParsedLyricsResult | null {
  if (!rec) return null;
  const syncedLines = parseLrcLyrics(rec.syncedLyrics);
  const plainLines = parsePlainLyrics(rec.plainLyrics);
  if (syncedLines.length === 0 && plainLines.length === 0) return null;

  return {
    found: true,
    synced: syncedLines.length > 0,
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
    (r) => !r.instrumental && ((r.syncedLyrics && r.syncedLyrics.trim()) || (r.plainLyrics && r.plainLyrics.trim())),
  );
  if (usable.length === 0) return null;

  // Prefer synced lyrics, and among those prefer closest duration when known
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

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 4500): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "PonelePlay/3.1 (https://poneleplay.netlify.app)",
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

export async function GET(req: NextRequest) {
  const rawTitle = req.nextUrl.searchParams.get("title")?.trim() || "";
  const rawArtist = req.nextUrl.searchParams.get("artist")?.trim() || "";
  const durationSec = Number(req.nextUrl.searchParams.get("duration") || 0);

  if (!rawTitle) {
    return NextResponse.json(
      { ok: false, found: false, synced: false, lines: [], plainLines: [], error: "title_required" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const { title, artist } = cleanTrackQuery(rawTitle, rawArtist);
  const cacheKey = `${title.toLowerCase()}|${artist.toLowerCase()}`;

  const cached = LYRICS_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ ok: true, ...cached.value }, { headers: CORS_HEADERS });
  }

  let resolved: ParsedLyricsResult | null = null;

  // 1. Exact lookup on LRCLIB when both title and artist are present
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
    resolved = buildResultFromRecord(exact);
  }

  // 2. Fuzzy search on LRCLIB using cleaned "artist title"
  if (!resolved) {
    const query = [artist, title].filter(Boolean).join(" ").trim();
    if (query) {
      const searchParams = new URLSearchParams({ q: query });
      const list = await fetchJsonWithTimeout<LrcLibRecord[]>(
        `https://lrclib.net/api/search?${searchParams.toString()}`,
      );
      if (Array.isArray(list) && list.length > 0) {
        resolved = buildResultFromRecord(pickBestSearchRecord(list, durationSec));
      }
    }
  }

  // 3. Fallback fuzzy search using title alone (helps when YouTube uploader is a Karaoke channel)
  if (!resolved && title && artist) {
    const searchParams = new URLSearchParams({ q: title });
    const list = await fetchJsonWithTimeout<LrcLibRecord[]>(
      `https://lrclib.net/api/search?${searchParams.toString()}`,
    );
    if (Array.isArray(list) && list.length > 0) {
      resolved = buildResultFromRecord(pickBestSearchRecord(list, durationSec));
    }
  }

  const finalResult: ParsedLyricsResult = resolved ?? {
    found: false,
    synced: false,
    lines: [],
    plainLines: [],
  };

  setCache(cacheKey, finalResult);
  return NextResponse.json({ ok: true, ...finalResult }, { headers: CORS_HEADERS });
}
