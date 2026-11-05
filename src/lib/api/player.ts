import { z } from "zod";
import { createBrowserSupabase } from "./supabase/browser";

export const playerTrackSchema = z.object({
  itemId: z.string(),
  trackId: z.string(),
  title: z.string(),
  artist: z.string(),
  source: z.enum(["youtube", "upload", "spotify"]),
  durationSeconds: z.number().nullable(),
  youtubeVideoId: z.string().nullable().optional(),
  storagePath: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  voteCount: z.number().default(0),
  startedAt: z.string().nullable().optional(),
  createdAt: z.string().nullable().optional(),
  position: z.number().optional(),
  isKaraoke: z.boolean().optional(),
  guestName: z.string().nullable().optional(),
  dedication: z.string().nullable().optional(),
});

export type PlayerTrack = z.infer<typeof playerTrackSchema>;

export interface PlayerStateResponse {
  ok: boolean;
  deviceId: string;
  venue: {
    id: string;
    name: string;
    slug: string;
  };
  nightId: string | null;
  nightStatus: "active" | "closed";
  nowPlaying: PlayerTrack | null;
  queue: PlayerTrack[];
  fallback: PlayerTrack[];
  serverTime: string;
}

export async function pairPlayerDevice(
  venueId: string,
  name: string = "PC del bar",
): Promise<{ deviceId: string; name: string; token: string }> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase.rpc("owner_pair_player" as never, {
    p_venue_id: venueId,
    p_name: name,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  const res = data as {
    ok?: boolean;
    deviceId?: string;
    name?: string;
    token?: string;
    error?: string;
  };

  if (!res.ok || !res.token || !res.deviceId) {
    throw new Error(res.error || "Error al emparejar el reproductor");
  }

  return {
    deviceId: res.deviceId,
    name: res.name || name,
    token: res.token,
  };
}

export async function revokePlayerDevice(deviceId: string): Promise<void> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase.rpc("owner_revoke_player" as never, {
    p_device_id: deviceId,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  const res = data as { ok?: boolean; error?: string };
  if (!res.ok) {
    throw new Error(res.error || "Error al revocar el reproductor");
  }
}

export async function fetchPlayerState(
  token: string,
): Promise<PlayerStateResponse> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase.rpc("player_state" as never, {
    p_token: token,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  const res = data as PlayerStateResponse & { error?: string };
  if (!res.ok) {
    throw new Error(res.error || "Token de reproductor inválido o revocado");
  }

  return res;
}

export async function sendPlayerEvent(
  token: string,
  action: "started" | "finished" | "failed",
  itemId: string,
  reason?: string,
): Promise<void> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase.rpc("player_event" as never, {
    p_token: token,
    p_action: action,
    p_item_id: itemId,
    p_reason: reason ?? null,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  const res = data as { ok?: boolean; error?: string };
  if (!res.ok) {
    throw new Error(res.error || `Error al notificar evento ${action}`);
  }
}
