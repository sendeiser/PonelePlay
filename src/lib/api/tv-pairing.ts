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
  slug?: string;
  token?: string;
  deviceId?: string;
  name?: string;
  error?: string;
}

export interface TvDisplayConfig {
  mode: "VIDEO" | "PLAYLIST" | "CLEAN";
  showQueue: boolean;
  showProposals: boolean;
  theme: "neon" | "minimal" | "gold" | "emerald";
  scale: "compact" | "normal" | "large" | "xlarge";
}

export const DEFAULT_TV_DISPLAY_CONFIG: TvDisplayConfig = {
  mode: "VIDEO",
  showQueue: true,
  showProposals: true,
  theme: "neon",
  scale: "normal",
};

export interface PlayerDeviceItem {
  id: string;
  name: string;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  isOnline: boolean;
  displayConfig?: TvDisplayConfig;
}

export async function requestTvPairingCode(
  slug: string = "",
  deviceName: string = "TV Salón",
): Promise<TvPairingCodeResponse> {
  if (slug) {
    try {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.rpc("request_tv_pairing_code" as never, {
        p_venue_slug: slug,
        p_device_name: deviceName,
      } as never);

      if (!error && data) {
        const res = data as TvPairingCodeResponse;
        if (res.ok) return res;
      }
    } catch {
      // Fallback to /api/tv/pair
    }
  }

  try {
    const res = await fetch("/api/tv/pair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "request",
        slug,
        deviceName,
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as TvPairingCodeResponse;
      if (data.ok && data.code) {
        return data;
      }
    }
  } catch {
    // Ignore
  }

  throw new Error("Error al solicitar código de vinculación");
}

export async function confirmTvPairingCode(
  slug: string,
  code: string,
  deviceName?: string,
): Promise<TvPairingConfirmResponse> {
  const supabase = createBrowserSupabase();
  let confirmed: TvPairingConfirmResponse | null = null;

  try {
    const { data, error } = await supabase.rpc("confirm_tv_pairing_code" as never, {
      p_venue_slug: slug,
      p_code: code,
      p_device_name: deviceName || null,
    } as never);

    if (!error && data) {
      const res = data as TvPairingConfirmResponse;
      if (res.ok) {
        confirmed = res;
      }
    }
  } catch {
    // Fallback to /api/tv/pair for zero-state unassigned PINs
  }

  if (!confirmed) {
    let apiErrorMsg: string | null = null;
    try {
      const apiRes = await fetch("/api/tv/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          slug,
          code,
          deviceName: deviceName || null,
        }),
      });
      const apiData = (await apiRes.json()) as TvPairingConfirmResponse;
      if (apiData.ok) {
        confirmed = apiData;
      } else if (apiData.error) {
        apiErrorMsg = apiData.error;
      }
    } catch {
      // Ignore fetch errors in non-browser tests
    }

    if (!confirmed) {
      throw new Error(apiErrorMsg || "Código inválido o vencido");
    }
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
          slug,
          token: confirmed.token,
          deviceId: confirmed.deviceId,
          name: confirmed.name,
        },
      });
    }
  } catch {
    // Non-blocking fallback
  }

  return confirmed;
}

export async function checkTvPairingStatus(
  slug: string,
  code: string,
): Promise<TvPairingStatusResponse> {
  if (slug) {
    try {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.rpc("check_tv_pairing_status" as never, {
        p_venue_slug: slug,
        p_code: code,
      } as never);

      if (!error && data) {
        const res = data as TvPairingStatusResponse;
        if (res.paired) return res;
      }
    } catch {
      // Fallback to /api/tv/pair
    }
  }

  try {
    const apiRes = await fetch("/api/tv/pair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "check",
        slug,
        code,
      }),
    });
    if (apiRes.ok) {
      return (await apiRes.json()) as TvPairingStatusResponse;
    }
  } catch {
    // Ignore
  }

  return { ok: true, paired: false };
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

  const devices = res.devices || [];

  // Fetch stored display configs to populate per-device configs
  try {
    const { data: v } = await supabase.from("venues").select("id").eq("slug", slug).maybeSingle();
    if (v?.id) {
      const { data: cfgRow } = await supabase
        .from("venue_playlists")
        .select("description")
        .eq("venue_id", v.id)
        .eq("name", "__tv_display_config__")
        .maybeSingle();

      if (cfgRow?.description) {
        const parsed = JSON.parse(cfgRow.description);
        const globalCfg = parsed.global || parsed;
        const devMap = (parsed.devices || {}) as Record<string, Partial<TvDisplayConfig>>;

        return devices.map((d) => ({
          ...d,
          displayConfig: {
            ...DEFAULT_TV_DISPLAY_CONFIG,
            ...globalCfg,
            ...(devMap[d.id] || {}),
          },
        }));
      }
    }
  } catch {
    // Non-blocking fallback
  }

  return devices;
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

export async function updateTvDeviceDisplay(
  slug: string,
  deviceId: string | null,
  config: Partial<TvDisplayConfig>,
): Promise<boolean> {
  const supabase = createBrowserSupabase();

  // 1. Broadcast immediately to WebSocket for sub-30ms instant reaction on the TV
  try {
    const channels = typeof supabase.getChannels === "function" ? supabase.getChannels() : [];
    const active = channels.find(
      (c: { topic?: string; state?: string }) =>
        (c.topic === `playback-control:${slug}` ||
          c.topic === `realtime:playback-control:${slug}`) &&
        c.state === "joined",
    );
    if (active && typeof active.send === "function") {
      void active.send({
        type: "broadcast",
        event: "tv_display_config",
        payload: {
          targetDeviceId: deviceId || "all",
          config,
          timestamp: Date.now(),
        },
      });
      void active.send({
        type: "broadcast",
        event: "playback_command",
        payload: {
          command: "set_tv_display",
          payload: {
            targetDeviceId: deviceId || "all",
            config,
          },
          timestamp: Date.now(),
        },
      });
    }
  } catch {
    // Non-blocking fallback
  }

  // 2. Persist in database and broadcast via server route
  try {
    const res = await fetch("/api/tv/display-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, deviceId, config }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
