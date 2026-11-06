import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/api/supabase/admin";
import { sanitizeDedication } from "@/lib/domain/party";
import { loadVenuePartyConfigFromDb } from "@/lib/api/party-server";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      slug?: string;
      guestName?: string;
      dedication?: string;
    };

    const slug = (body.slug || "").trim().toLowerCase();
    if (!slug) {
      return NextResponse.json({ error: "slug requerido" }, { status: 400 });
    }

    const cleanDedication = sanitizeDedication(body.dedication);
    if (!cleanDedication) {
      return NextResponse.json(
        { error: "La dedicatoria no puede estar vacía (máximo 90 caracteres)" },
        { status: 400 },
      );
    }

    const cleanGuestName = (body.guestName || "").trim().slice(0, 40) || null;

    const admin = createAdminSupabase();
    const { data: venue } = await admin
      .from("venues")
      .select("id, name, slug")
      .eq("slug", slug)
      .maybeSingle();

    if (!venue) {
      return NextResponse.json({ error: "Salón no encontrado" }, { status: 404 });
    }

    // 1. Load current party config & item meta
    const { itemMeta } = await loadVenuePartyConfigFromDb(admin, slug);

    // 2. Fetch current nowPlaying track if any
    const { data: liveRow } = await admin
      .from("venue_playlists")
      .select("description")
      .eq("venue_id", venue.id)
      .eq("name", "__live_night_now_playing__")
      .maybeSingle();

    let nowPlayingId: string | null = null;
    let nowPlayingTrackId: string | null = null;
    let nowPlayingYtId: string | null = null;

    if (liveRow?.description) {
      try {
        const parsed = JSON.parse(liveRow.description);
        nowPlayingId = parsed.itemId || parsed.id || null;
        nowPlayingTrackId = parsed.trackId || null;
        nowPlayingYtId = parsed.youtubeVideoId || null;
      } catch {
        // Non-blocking
      }
    }

    const timestamp = Date.now();
    const dedicationRecord = {
      guestName: cleanGuestName,
      dedication: cleanDedication,
      timestamp,
    };

    const updatedItemMeta: Record<string, { guestName?: string | null; dedication?: string | null; isKaraoke?: boolean; timestamp?: number }> = {
      ...itemMeta,
      __current_dedication__: dedicationRecord,
    };

    if (nowPlayingId) {
      updatedItemMeta[nowPlayingId] = {
        ...(updatedItemMeta[nowPlayingId] || {}),
        guestName: cleanGuestName ?? updatedItemMeta[nowPlayingId]?.guestName ?? null,
        dedication: cleanDedication,
      };
    }
    if (nowPlayingTrackId) {
      updatedItemMeta[nowPlayingTrackId] = {
        ...(updatedItemMeta[nowPlayingTrackId] || {}),
        guestName: cleanGuestName ?? updatedItemMeta[nowPlayingTrackId]?.guestName ?? null,
        dedication: cleanDedication,
      };
    }
    if (nowPlayingYtId) {
      updatedItemMeta[`yt:${nowPlayingYtId}`] = {
        ...(updatedItemMeta[`yt:${nowPlayingYtId}`] || {}),
        guestName: cleanGuestName ?? updatedItemMeta[`yt:${nowPlayingYtId}`]?.guestName ?? null,
        dedication: cleanDedication,
      };
    }

    // Persist updated __party_item_meta__
    await admin.from("venue_playlists").upsert(
      {
        venue_id: venue.id,
        name: "__party_item_meta__",
        description: JSON.stringify(updatedItemMeta),
      },
      { onConflict: "venue_id,name" },
    );

    // If there is an active now playing row, also update its dedication
    if (liveRow?.description) {
      try {
        const parsed = JSON.parse(liveRow.description);
        parsed.dedication = cleanDedication;
        if (cleanGuestName) parsed.guestName = cleanGuestName;
        await admin.from("venue_playlists").upsert(
          {
            venue_id: venue.id,
            name: "__live_night_now_playing__",
            description: JSON.stringify(parsed),
          },
          { onConflict: "venue_id,name" },
        );
      } catch {
        // Non-blocking
      }
    }

    // 3. Broadcast Realtime event to TV and Cabina
    const channelNames = [
      `night-control:${slug}`,
      `venue-party:${slug}`,
      `room:${slug}`,
      `playback-control:${slug}`,
    ];

    for (const chName of channelNames) {
      const channel = admin.channel(chName);
      await channel.send({
        type: "broadcast",
        event: "live_dedication",
        payload: {
          guestName: cleanGuestName,
          dedication: cleanDedication,
          timestamp,
        },
      });
      await admin.removeChannel(channel);
    }

    return NextResponse.json({
      ok: true,
      guestName: cleanGuestName,
      dedication: cleanDedication,
      timestamp,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno al enviar dedicatoria" },
      { status: 500 },
    );
  }
}

