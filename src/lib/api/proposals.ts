import { createBrowserSupabase } from "./supabase/browser";
import { parseYoutubeVideoId, youtubeDedupeKey } from "@/lib/domain/youtube";
import { demoSearchCatalog } from "@/lib/demo-data";

export interface SearchResult {
  videoId: string;
  title: string;
  artist: string;
  duration: string;
  durationSeconds: number;
  thumbnailUrl: string;
  isKaraoke?: boolean;
  views?: string;
  viewsCount?: number;
}

interface ClientCacheEntry {
  timestamp: number;
  results: SearchResult[];
}

const clientSearchCache = new Map<string, ClientCacheEntry>();
const CLIENT_CACHE_TTL = 3 * 60 * 1000; // 3 minutes cache
const MAX_CLIENT_CACHE = 100;

function getClientCached(key: string): SearchResult[] | null {
  const item = clientSearchCache.get(key);
  if (!item) return null;
  if (Date.now() - item.timestamp > CLIENT_CACHE_TTL) {
    clientSearchCache.delete(key);
    return null;
  }
  return item.results;
}

function setClientCached(key: string, results: SearchResult[]) {
  if (clientSearchCache.size >= MAX_CLIENT_CACHE) {
    const oldestKey = clientSearchCache.keys().next().value;
    if (oldestKey) clientSearchCache.delete(oldestKey);
  }
  clientSearchCache.set(key, { timestamp: Date.now(), results });
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export async function searchYouTube(
  query: string,
  isKaraoke: boolean = false,
): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const cacheKey = `${trimmed.toLowerCase()}_${isKaraoke}`;
  const cached = getClientCached(cacheKey);
  if (cached) {
    return cached;
  }

  // Helper to store in cache before returning
  const returnWithCache = (res: SearchResult[]): SearchResult[] => {
    if (res.length > 0) {
      setClientCached(cacheKey, res);
    }
    return res;
  };

  // 1. First, call our local Next.js YouTube search API route
  try {
    const karaokeParam = isKaraoke ? "&karaoke=true" : "";
    const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(trimmed)}${karaokeParam}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.results) && data.results.length > 0) {
        return returnWithCache(data.results);
      }
    }
  } catch {
    // If running in environment where /api is unreachable or mock, continue to fallbacks
  }

  // 2. Direct YouTube link check
  const directId = parseYoutubeVideoId(trimmed);
  if (directId) {
    return returnWithCache([
      {
        videoId: directId,
        title: `Video de YouTube (${directId})`,
        artist: "Link directo",
        duration: "4:00",
        durationSeconds: 240,
        thumbnailUrl: `https://img.youtube.com/vi/${directId}/hqdefault.jpg`,
      },
    ]);
  }

  // 3. Query YouTube proxy function if available, otherwise search local catalog
  try {
    const supabase = createBrowserSupabase();
    const { data, error } = await supabase.functions.invoke("youtube-search", {
      body: { query: trimmed },
    });

    if (!error && data?.results && Array.isArray(data.results)) {
      const mapped = data.results.map((item: {
        videoId: string;
        title: string;
        channelTitle: string;
        durationSeconds: number;
        thumbnailUrl: string;
      }) => ({
        videoId: item.videoId,
        title: item.title,
        artist: item.channelTitle,
        duration: formatDuration(item.durationSeconds || 180),
        durationSeconds: item.durationSeconds || 180,
        thumbnailUrl: item.thumbnailUrl,
      }));
      return returnWithCache(mapped);
    }
  } catch {
    // Fall back to local catalog search
  }

  // 4. Fallback matching against demo / venue catalog
  const term = trimmed.toLowerCase();
  const matched = demoSearchCatalog.filter((item) =>
    `${item.title} ${item.artist}`.toLowerCase().includes(term),
  );

  return returnWithCache(matched.map((item) => ({
    videoId: `demo-${item.id}`,
    title: item.title,
    artist: item.artist,
    duration: item.duration,
    durationSeconds: 210,
    thumbnailUrl: "",
  })));
}

export interface ProposeInput {
  title: string;
  artist: string;
  durationSeconds: number;
  youtubeVideoId?: string;
  thumbnailUrl?: string;
  dedupeKey?: string;
  guestName?: string | null;
  dedication?: string | null;
  isKaraoke?: boolean;
  slug?: string;
  isPartyMode?: boolean;
}

export interface ProposeResult {
  itemId: string;
  trackId: string;
  duplicate: boolean;
  voteCount: number;
}

export async function proposeTrack(
  input: ProposeInput,
): Promise<ProposeResult> {
  const dedupeKey =
    input.dedupeKey ||
    (input.youtubeVideoId
      ? youtubeDedupeKey(input.youtubeVideoId)
      : `title:${input.title.toLowerCase()}`);

  const payload: Record<string, unknown> = {
    title: input.title,
    artist: input.artist,
    durationSeconds: input.durationSeconds,
    youtubeVideoId: input.youtubeVideoId,
    thumbnailUrl: input.thumbnailUrl,
    dedupeKey,
  };

  if (input.guestName) payload.guestName = input.guestName;
  if (input.dedication) payload.dedication = input.dedication;
  if (typeof input.isKaraoke === "boolean") payload.isKaraoke = input.isKaraoke;

  // In Party Mode, use /api/party/propose so there is no bar cooldown and threshold/metadata are applied
  if (input.isPartyMode && input.slug) {
    try {
      const partyRes = await fetch("/api/party/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: input.slug,
          track: payload,
        }),
      });
      const partyData = await partyRes.json();
      if (partyData?.ok) {
        return {
          itemId: partyData.itemId ?? "",
          trackId: partyData.trackId ?? "",
          duplicate: Boolean(partyData.duplicate),
          voteCount: Number(partyData.voteCount ?? 1),
        };
      }
      if (partyData?.error === "duplicate_active") {
        throw new Error("duplicate_active");
      }
      if (partyData?.error === "night_closed") {
        throw new Error("night_closed");
      }
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message === "duplicate_active" || err.message === "night_closed")
      ) {
        throw err;
      }
      // Otherwise fall through to Supabase RPC
    }
  }

  const supabase = createBrowserSupabase();

  const { data, error } = await supabase.rpc("propose_track" as never, {
    p_track: payload,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  const res = data as {
    error?: string;
    itemId?: string;
    trackId?: string;
    duplicate?: boolean;
    voteCount?: number;
  };

  if (res.error) {
    throw new Error(res.error);
  }

  return {
    itemId: res.itemId ?? "",
    trackId: res.trackId ?? "",
    duplicate: res.duplicate ?? false,
    voteCount: res.voteCount ?? 0,
  };
}

export interface YouTubePlaylistInfo {
  id: string;
  title: string;
  author: string;
  trackCount: number;
  thumbnailUrl?: string;
  tracks: SearchResult[];
}

export interface YouTubeSearchResultPayload {
  results: SearchResult[];
  playlist?: YouTubePlaylistInfo;
  singleVideo?: SearchResult;
}

export async function searchYouTubeWithDetails(
  query: string,
  isKaraoke: boolean = false,
): Promise<YouTubeSearchResultPayload> {
  const trimmed = query.trim();
  if (!trimmed) return { results: [] };

  try {
    const karaokeParam = isKaraoke ? '&karaoke=true' : '';
    const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(trimmed)}${karaokeParam}`);
    if (res.ok) {
      const data = await res.json();
      return {
        results: Array.isArray(data.results) ? data.results : [],
        playlist: data.playlist,
        singleVideo: data.singleVideo,
      };
    }
  } catch {}

  const standardResults = await searchYouTube(query, isKaraoke);
  return { results: standardResults };
}

export async function fetchYouTubePlaylist(
  playlistIdOrUrl: string,
): Promise<YouTubePlaylistInfo | null> {
  try {
    const res = await fetch(`/api/youtube/playlist?id=${encodeURIComponent(playlistIdOrUrl)}`);
    if (res.ok) {
      const data = await res.json();
      return data.playlist || null;
    }
  } catch {}
  return null;
}
