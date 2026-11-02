import { createBrowserSupabase } from "./supabase/browser";

export interface TvPairingCodeResponse {
  ok: boolean;
  code: string;
  deviceName: string;
  expiresInSeconds: number;
  error?: string;
}

export interface TvPairingConfirmResponse {
  ok: boolean;
  deviceId: string;
  name: string;
  token: string;
  error?: string;
}

export interface TvPairingStatusResponse {
  ok: boolean;
  paired: boolean;
  token?: string;
  deviceId?: string;
  name?: string;
  error?: string;
}

export interface PlayerDeviceItem {
  id: string;
  name: string;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  isOnline: boolean;
}

export async function requestTvPairingCode(
  slug: string,
  deviceName: string = "TV Salón",
): Promise<TvPairingCodeResponse> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase.rpc("request_tv_pairing_code" as never, {
    p_venue_slug: slug,
    p_device_name: deviceName,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  const res = data as TvPairingCodeResponse;
  if (!res.ok) {
    throw new Error(res.error || "Error al solicitar código de vinculación");
  }

  return res;
}

export async function confirmTvPairingCode(
  slug: string,
  code: string,
  deviceName?: string,
): Promise<TvPairingConfirmResponse> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase.rpc("confirm_tv_pairing_code" as never, {
    p_venue_slug: slug,
    p_code: code,
    p_device_name: deviceName || null,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  const res = data as TvPairingConfirmResponse;
  if (!res.ok) {
    throw new Error(res.error || "Código inválido o vencido");
  }

  // Broadcast to TV in realtime
  try {
    const channels = typeof supabase.getChannels === "function" ? supabase.getChannels() : [];
    const existing = channels.find(
      (c: { topic?: string }) =>
        c.topic === `playback-control:${slug}` ||
        c.topic === `realtime:playback-control:${slug}`,
    );
    const channel = existing ?? supabase.channel(`playback-control:${slug}`);
    if (channel && typeof channel.send === "function") {
      void channel.send({
        type: "broadcast",
        event: "tv_paired",
        payload: {
          code,
          token: res.token,
          deviceId: res.deviceId,
          name: res.name,
        },
      });
    }
  } catch {
    // Non-blocking fallback
  }

  return res;
}

export async function checkTvPairingStatus(
  slug: string,
  code: string,
): Promise<TvPairingStatusResponse> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase.rpc("check_tv_pairing_status" as never, {
    p_venue_slug: slug,
    p_code: code,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  return data as TvPairingStatusResponse;
}

export async function listVenuePlayerDevices(
  slug: string,
): Promise<PlayerDeviceItem[]> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase.rpc("list_venue_player_devices" as never, {
    p_venue_slug: slug,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  const res = data as { ok: boolean; devices?: PlayerDeviceItem[]; error?: string };
  if (!res.ok) {
    throw new Error(res.error || "Error al listar pantallas TV");
  }

  return res.devices || [];
}

export async function revokePlayerDevice(deviceId: string): Promise<boolean> {
  const supabase = createBrowserSupabase();
  const { error } = await supabase
    .from("player_devices")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", deviceId);

  if (error) {
    throw new Error(error.message);
  }
  return true;
}
