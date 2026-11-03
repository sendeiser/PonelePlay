import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/api/supabase/admin";
import { DEFAULT_TV_DISPLAY_CONFIG, type TvDisplayConfig } from "@/lib/api/tv-pairing";

interface StoredConfigs {
  global: TvDisplayConfig;
  devices: Record<string, TvDisplayConfig>;
}

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { slug, deviceId, config } = body as {
      slug: string;
      deviceId?: string | null;
      config: Partial<TvDisplayConfig>;
    };

    if (!slug) {
      return NextResponse.json({ ok: false, error: "slug_required" }, { status: 400 });
    }

    const admin = createAdminSupabase();

    // 1. Get venue
    const { data: venue, error: vErr } = await admin
      .from("venues")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (vErr || !venue) {
      return NextResponse.json({ ok: false, error: "venue_not_found" }, { status: 404 });
    }

    // 2. Read existing stored configs from venue_playlists
    const { data: existingRow } = await admin
      .from("venue_playlists")
      .select("id, description")
      .eq("venue_id", venue.id)
      .eq("name", "__tv_display_config__")
      .maybeSingle();

    let stored: StoredConfigs = {
      global: { ...DEFAULT_TV_DISPLAY_CONFIG },
      devices: {},
    };

    if (existingRow?.description) {
      try {
        const parsed = JSON.parse(existingRow.description);
        if (parsed.global) {
          stored = {
            global: { ...DEFAULT_TV_DISPLAY_CONFIG, ...parsed.global },
            devices: parsed.devices || {},
          };
        } else {
          // Legacy format (flat config was global)
          stored = {
            global: { ...DEFAULT_TV_DISPLAY_CONFIG, ...parsed },
            devices: {},
          };
        }
      } catch {
        // Fallback to default
      }
    }

    // 3. Update target
    const isGlobal = !deviceId || deviceId === "all";
    if (isGlobal) {
      stored.global = { ...stored.global, ...config };
      // Also update all individual devices if global was set
      for (const dId of Object.keys(stored.devices)) {
        stored.devices[dId] = { ...stored.devices[dId], ...config };
      }
    } else {
      const curDev = stored.devices[deviceId] || { ...stored.global };
      stored.devices[deviceId] = { ...curDev, ...config };
    }

    // 4. Save into venue_playlists
    const serialized = JSON.stringify(stored);
    if (existingRow?.id) {
      await admin
        .from("venue_playlists")
        .update({ description: serialized, updated_at: new Date().toISOString() })
        .eq("id", existingRow.id);
    } else {
      await admin.from("venue_playlists").insert({
        venue_id: venue.id,
        name: "__tv_display_config__",
        description: serialized,
        is_active: false,
      });
    }

    const appliedConfig = isGlobal ? stored.global : stored.devices[deviceId!];

    // 5. Update venue_playback_state via RPC send_playback_command
    try {
      await admin.rpc("send_playback_command" as never, {
        p_venue_slug: slug,
        p_command: "set_tv_display",
        p_payload: {
          targetDeviceId: deviceId || "all",
          config: appliedConfig,
        },
      } as never);
    } catch {
      // Non-blocking
    }

    // 6. Broadcast via Supabase Realtime channel
    try {
      const channel = admin.channel(`playback-control:${slug}`);
      await channel.send({
        type: "broadcast",
        event: "tv_display_config",
        payload: {
          targetDeviceId: deviceId || "all",
          config: appliedConfig,
          timestamp: Date.now(),
        },
      });
      await channel.send({
        type: "broadcast",
        event: "playback_command",
        payload: {
          command: "set_tv_display",
          payload: {
            targetDeviceId: deviceId || "all",
            config: appliedConfig,
          },
          timestamp: Date.now(),
        },
      });
    } catch {
      // Non-blocking
    }

    return NextResponse.json({
      ok: true,
      displayConfig: appliedConfig,
      stored,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "server_error" },
      { status: 500 },
    );
  }
}
