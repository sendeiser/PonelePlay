import { z } from "zod";
import { createBrowserSupabase } from "./supabase/browser";
import { parseYoutubeVideoId, youtubeDedupeKey } from "@/lib/domain/youtube";
import {
  sha256File,
  uploadTrackPath,
  validateUpload,
} from "@/lib/domain/upload";

export const trackRowSchema = z.object({
  id: z.string(),
  venueId: z.string(),
  source: z.enum(["youtube", "upload", "spotify"]),
  title: z.string(),
  artist: z.string(),
  durationSeconds: z.number().nullable(),
  youtubeVideoId: z.string().nullable().optional(),
  storagePath: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  isExplicit: z.boolean().default(false),
  status: z.enum(["active", "archived"]),
});

export type TrackRow = z.infer<typeof trackRowSchema>;

export async function fetchCatalog(venueId: string): Promise<TrackRow[]> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from("tracks")
    .select("*")
    .eq("venue_id", venueId)
    .order("title", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map((row) => ({
    id: row.id,
    venueId: row.venue_id,
    source: row.source,
    title: row.title,
    artist: row.artist,
    durationSeconds: row.duration_seconds,
    youtubeVideoId: row.youtube_video_id ?? undefined,
    storagePath: row.storage_path ?? undefined,
    thumbnailUrl: row.thumbnail_url ?? undefined,
    isExplicit: row.is_explicit,
    status: row.status,
  }));
}

export async function fetchFallback(venueId: string): Promise<TrackRow[]> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from("fallback_tracks")
    .select("position, track_id")
    .eq("venue_id", venueId)
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

export async function addTrackByUrl(
  venueId: string,
  url: string,
  metadata: {
    title: string;
    artist: string;
    isExplicit?: boolean;
    durationSeconds?: number;
  },
): Promise<TrackRow> {
  const videoId = parseYoutubeVideoId(url.trim());
  if (!videoId) {
    throw new Error("El link proporcionado no es un video de YouTube válido");
  }

  const supabase = createBrowserSupabase();
  const dedupeKey = youtubeDedupeKey(videoId);

  const { data, error } = await supabase
    .from("tracks")
    .insert({
      venue_id: venueId,
      source: "youtube",
      title: metadata.title.trim(),
      artist: metadata.artist.trim(),
      duration_seconds: metadata.durationSeconds ?? 210,
      youtube_video_id: videoId,
      thumbnail_url: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      is_explicit: metadata.isExplicit ?? false,
      dedupe_key: dedupeKey,
      status: "active",
      created_by_kind: "owner",
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
    source: "youtube",
    title: String(row.title),
    artist: String(row.artist || ""),
    durationSeconds:
      row.duration_seconds !== null ? Number(row.duration_seconds) : null,
    youtubeVideoId: videoId,
    thumbnailUrl: String(row.thumbnail_url),
    isExplicit: Boolean(row.is_explicit),
    status: "active",
  };
}

export async function uploadMp3Track(
  venueId: string,
  file: File,
  metadata: {
    title: string;
    artist: string;
    isExplicit?: boolean;
    durationSeconds?: number;
  },
): Promise<TrackRow> {
  const validation = validateUpload({
    name: file.name,
    size: file.size,
    type: file.type,
  });

  if (validation === "too_large") {
    throw new Error("El archivo excede el límite máximo de 25 MB.");
  }
  if (validation === "invalid_type") {
    throw new Error("Solo se admiten archivos de audio en formato .mp3.");
  }

  const sha256 = await sha256File(file);
  const storagePath = uploadTrackPath(venueId, sha256);
  const dedupeKey = `file:${sha256}`;

  const supabase = createBrowserSupabase();

  // Upload to Supabase Storage bucket 'track-audio'
  const { error: uploadError } = await supabase.storage
    .from("track-audio")
    .upload(storagePath, file, {
      upsert: false,
      contentType: "audio/mpeg",
    });

  // If already uploaded (duplicate file), it's fine to proceed to database insert
  if (uploadError && !uploadError.message.includes("already exists")) {
    throw new Error(`Error al subir archivo: ${uploadError.message}`);
  }

  const { data, error } = await supabase
    .from("tracks")
    .insert({
      venue_id: venueId,
      source: "upload",
      title: metadata.title.trim(),
      artist: metadata.artist.trim(),
      duration_seconds: metadata.durationSeconds ?? 180,
      storage_path: storagePath,
      is_explicit: metadata.isExplicit ?? false,
      dedupe_key: dedupeKey,
      status: "active",
      created_by_kind: "owner",
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
    source: "upload",
    title: String(row.title),
    artist: String(row.artist || ""),
    durationSeconds:
      row.duration_seconds !== null ? Number(row.duration_seconds) : null,
    storagePath,
    isExplicit: Boolean(row.is_explicit),
    status: "active",
  };
}

export async function archiveTrack(trackId: string): Promise<void> {
  const supabase = createBrowserSupabase();
  const { error } = await supabase
    .from("tracks")
    .update({ status: "archived" as const })
    .eq("id", trackId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function reorderFallback(
  venueId: string,
  trackIds: string[],
): Promise<void> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase.rpc(
    "owner_reorder_fallback" as never,
    {
      p_venue_id: venueId,
      p_track_ids: trackIds,
    } as never,
  );

  if (error) {
    throw new Error(error.message);
  }

  const res = data as { ok?: boolean; error?: string };
  if (!res.ok) {
    throw new Error(res.error || "Error al reordenar lista de respaldo");
  }
}

