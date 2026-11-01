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
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export async function searchYouTube(
  query: string,
): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // 1. First, call our local Next.js YouTube search API route
  try {
    const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(trimmed)}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.results) && data.results.length > 0) {
        return data.results;
      }
    }
  } catch {
    // If running in environment where /api is unreachable or mock, continue to fallbacks
  }

  // 2. Direct YouTube link check
  const directId = parseYoutubeVideoId(trimmed);
  if (directId) {
    return [
      {
        videoId: directId,
        title: `Video de YouTube (${directId})`,
        artist: "Link directo",
        duration: "4:00",
        durationSeconds: 240,
        thumbnailUrl: `https://img.youtube.com/vi/${directId}/hqdefault.jpg`,
      },
    ];
  }

  // 3. Query YouTube proxy function if available, otherwise search local catalog
  try {
    const supabase = createBrowserSupabase();
    const { data, error } = await supabase.functions.invoke("youtube-search", {
      body: { query: trimmed },
    });

    if (!error && data?.results && Array.isArray(data.results)) {
      return data.results.map((item: {
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
    }
  } catch {
    // Fall back to local catalog search
  }

  // 4. Fallback matching against demo / venue catalog
  const term = trimmed.toLowerCase();
  const matched = demoSearchCatalog.filter((item) =>
    `${item.title} ${item.artist}`.toLowerCase().includes(term),
  );

  return matched.map((item) => ({
    videoId: `demo-${item.id}`,
    title: item.title,
    artist: item.artist,
    duration: item.duration,
    durationSeconds: 210,
    thumbnailUrl: "",
  }));
}

export interface ProposeInput {
  title: string;
  artist: string;
  durationSeconds: number;
  youtubeVideoId?: string;
  thumbnailUrl?: string;
  dedupeKey?: string;
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
  const supabase = createBrowserSupabase();

  const dedupeKey =
    input.dedupeKey ||
    (input.youtubeVideoId
      ? youtubeDedupeKey(input.youtubeVideoId)
      : `title:${input.title.toLowerCase()}`);

  const payload = {
    title: input.title,
    artist: input.artist,
    durationSeconds: input.durationSeconds,
    youtubeVideoId: input.youtubeVideoId,
    thumbnailUrl: input.thumbnailUrl,
    dedupeKey,
  };

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

