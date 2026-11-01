import { createBrowserSupabase } from "./supabase/browser";
import { parseYoutubeVideoId, youtubeDedupeKey } from "@/lib/domain/youtube";
import type { TrackRow } from "./catalog";

export interface VenuePlaylist {
  id: string;
  venueId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  trackCount?: number;
  createdAt: string;
  updatedAt: string;
}

export async function fetchPlaylists(venueId: string): Promise<VenuePlaylist[]> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from("venue_playlists")
    .select("*, playlist_tracks(count)")
    .eq("venue_id", venueId)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map((row) => {
    const ptCount =
      Array.isArray(row.playlist_tracks) && row.playlist_tracks[0]
        ? Number(row.playlist_tracks[0].count || 0)
        : 0;

    return {
      id: row.id,
      venueId: row.venue_id,
      name: row.name,
      description: row.description,
      isActive: Boolean(row.is_active),
      trackCount: ptCount,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

export async function createPlaylist(
  venueId: string,
  name: string,
  description?: string,
): Promise<VenuePlaylist> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("El nombre de la playlist es obligatorio");

  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from("venue_playlists")
    .insert({
      venue_id: venueId,
      name: trimmed,
      description: description?.trim() || null,
      is_active: false,
    } as never)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    venueId: String(row.venue_id),
    name: String(row.name),
    description: row.description ? String(row.description) : null,
    isActive: Boolean(row.is_active),
    trackCount: 0,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  const supabase = createBrowserSupabase();
  const { error } = await supabase
    .from("venue_playlists")
    .delete()
    .eq("id", playlistId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function fetchPlaylistTracks(
  playlistId: string,
): Promise<TrackRow[]> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from("playlist_tracks")
    .select("position, track_id")
    .eq("playlist_id", playlistId)
    .order("position", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.length === 0) {
    return [];
  }

  const trackIds = data.map((d) => d.track_id);
  const { data: trackData, error: trackError } = await supabase
    .from("tracks")
    .select("*")
    .in("id", trackIds);

  if (trackError) {
    throw new Error(trackError.message);
  }

  const trackMap = new Map((trackData || []).map((t) => [t.id, t]));

  return data
    .map((item) => trackMap.get(item.track_id))
    .filter((t): t is NonNullable<typeof t> => t !== undefined)
    .map((track) => ({
      id: track.id,
      venueId: track.venue_id,
      source: track.source,
      title: track.title,
      artist: track.artist,
      durationSeconds: track.duration_seconds,
      youtubeVideoId: track.youtube_video_id ?? undefined,
      storagePath: track.storage_path ?? undefined,
      thumbnailUrl: track.thumbnail_url ?? undefined,
      isExplicit: track.is_explicit,
      status: track.status,
    }));
}

export async function addTrackToPlaylist(
  playlistId: string,
  trackId: string,
): Promise<void> {
  const supabase = createBrowserSupabase();

  // Find max position
  const { data: posData } = await supabase
    .from("playlist_tracks")
    .select("position")
    .eq("playlist_id", playlistId)
    .order("position", { ascending: false })
    .limit(1);

  const nextPos =
    posData && posData.length > 0 ? (posData[0].position ?? 0) + 1 : 0;

  const { error } = await supabase
    .from("playlist_tracks")
    .insert({
      playlist_id: playlistId,
      track_id: trackId,
      position: nextPos,
    } as never);

  if (error && !error.message.includes("duplicate key")) {
    throw new Error(error.message);
  }
}

export async function removeTrackFromPlaylist(
  playlistId: string,
  trackId: string,
): Promise<void> {
  const supabase = createBrowserSupabase();
  const { error } = await supabase
    .from("playlist_tracks")
    .delete()
    .eq("playlist_id", playlistId)
    .eq("track_id", trackId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function setActivePlaylistAsFallback(
  venueId: string,
  playlistId: string,
): Promise<void> {
  const supabase = createBrowserSupabase();

  // 1. Update is_active flags
  await supabase
    .from("venue_playlists")
    .update({ is_active: false } as never)
    .eq("venue_id", venueId);

  await supabase
    .from("venue_playlists")
    .update({ is_active: true } as never)
    .eq("id", playlistId);

  // 2. Fetch tracks in this playlist
  const tracks = await fetchPlaylistTracks(playlistId);

  // 3. Clear existing fallback tracks for venue and insert new list
  await supabase.from("fallback_tracks").delete().eq("venue_id", venueId);

  if (tracks.length > 0) {
    const rows = tracks.map((t, idx) => ({
      venue_id: venueId,
      track_id: t.id,
      position: idx,
    }));

    const { error: insErr } = await supabase
      .from("fallback_tracks")
      .insert(rows as never);

    if (insErr) {
      throw new Error(insErr.message);
    }
  }
}

export async function addYouTubeTrackToVenue(
  venueId: string,
  trackInfo: {
    videoId: string;
    title: string;
    artist: string;
    durationSeconds?: number;
    thumbnailUrl?: string;
  },
  playlistId?: string,
): Promise<TrackRow> {
  const videoId = parseYoutubeVideoId(trackInfo.videoId) || trackInfo.videoId.trim();
  const supabase = createBrowserSupabase();
  const dedupeKey = youtubeDedupeKey(videoId);

  // Check if track already exists in catalog
  const { data: existing } = await supabase
    .from("tracks")
    .select("*")
    .eq("venue_id", venueId)
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();

  let trackRow: TrackRow;

  if (existing) {
    trackRow = {
      id: existing.id,
      venueId: existing.venue_id,
      source: existing.source,
      title: existing.title,
      artist: existing.artist,
      durationSeconds: existing.duration_seconds,
      youtubeVideoId: existing.youtube_video_id ?? videoId,
      thumbnailUrl: existing.thumbnail_url,
      isExplicit: existing.is_explicit,
      status: existing.status,
    };
  } else {
    const { data: created, error } = await supabase
      .from("tracks")
      .insert({
        venue_id: venueId,
        source: "youtube",
        title: trackInfo.title.trim(),
        artist: trackInfo.artist.trim() || "YouTube",
        duration_seconds: trackInfo.durationSeconds ?? 210,
        youtube_video_id: videoId,
        thumbnail_url:
          trackInfo.thumbnailUrl ||
          `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        is_explicit: false,
        dedupe_key: dedupeKey,
        status: "active",
        created_by_kind: "owner",
      } as never)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const row = created as Record<string, unknown>;
    trackRow = {
      id: String(row.id),
      venueId: String(row.venue_id),
      source: "youtube",
      title: String(row.title),
      artist: String(row.artist || "YouTube"),
      durationSeconds:
        row.duration_seconds !== null ? Number(row.duration_seconds) : 210,
      youtubeVideoId: videoId,
      thumbnailUrl: String(row.thumbnail_url),
      isExplicit: false,
      status: "active",
    };
  }

  // If playlistId is provided, also add track to playlist
  if (playlistId) {
    await addTrackToPlaylist(playlistId, trackRow.id);
  }

  return trackRow;
}
