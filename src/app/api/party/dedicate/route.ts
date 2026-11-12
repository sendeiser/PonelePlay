import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/api/supabase/admin";
import { sanitizeDedication } from "@/lib/domain/party";
import { loadVenuePartyConfigFromDb } from "@/lib/api/party-server";
import { notifySyncRoom } from "@/lib/sync/server-notify";

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

    // 2. Fetch current active track: check venue_playback_state first, then playing queue_item, then next queued item
    const { data: playState } = await admin
      .from("venue_playback_state")
      .select("current_track, is_paused, volume")
      .eq("venue_id", venue.id)
      .maybeSingle();

    const { data: playingQueueItem } = await admin
      .from("queue_items")
      .select("id, track_id")
      .eq("venue_id", venue.id)
      .eq("status", "playing")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: nextQueueItem } = !playingQueueItem
      ? await admin
          .from("queue_items")
          .select("id, track_id")
          .eq("venue_id", venue.id)
          .eq("status", "queued")
          .order("vote_count", { ascending: false })
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle()
      : { data: null };

    const activeTrackObj = (playState?.current_track as Record<string, unknown> | null) ?? null;
    const activeItem = playingQueueItem || nextQueueItem;

    let trackDetails: {
      id?: string;
      title?: string;
      artist?: string;
      youtube_video_id?: string | null;
      thumbnail_url?: string | null;
      duration_seconds?: number | null;
    } | null = null;

    if (activeItem?.track_id) {
      const { data: tr } = await admin
        .from("tracks")
        .select("id, title, artist, youtube_video_id, thumbnail_url, duration_seconds")
        .eq("id", activeItem.track_id)
        .maybeSingle();
      trackDetails = tr;
    }

    const nowPlayingId = String(activeTrackObj?.itemId || activeTrackObj?.id || activeItem?.id || "");
    const nowPlayingTrackId = String(activeTrackObj?.trackId || activeItem?.track_id || trackDetails?.id || "");
    const nowPlayingYtId = String(activeTrackObj?.youtubeVideoId || trackDetails?.youtube_video_id || "");
    const nowPlayingTitle = String(activeTrackObj?.title || trackDetails?.title || "");

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
        timestamp,
      };
    }
    if (nowPlayingTrackId) {
      updatedItemMeta[nowPlayingTrackId] = {
        ...(updatedItemMeta[nowPlayingTrackId] || {}),
        guestName: cleanGuestName ?? updatedItemMeta[nowPlayingTrackId]?.guestName ?? null,
        dedication: cleanDedication,
        timestamp,
      };
    }
    if (nowPlayingYtId) {
      updatedItemMeta[`yt:${nowPlayingYtId}`] = {
        ...(updatedItemMeta[`yt:${nowPlayingYtId}`] || {}),
        guestName: cleanGuestName ?? updatedItemMeta[`yt:${nowPlayingYtId}`]?.guestName ?? null,
        dedication: cleanDedication,
        timestamp,
      };
    }
    if (nowPlayingTitle) {
      const titleKey = `title:${nowPlayingTitle.toLowerCase()}`;
      updatedItemMeta[titleKey] = {
        ...(updatedItemMeta[titleKey] || {}),
        guestName: cleanGuestName ?? updatedItemMeta[titleKey]?.guestName ?? null,
        dedication: cleanDedication,
        timestamp,
      };
    }

    // Persist updated __party_item_meta__ in venue_playlists
    await admin.from("venue_playlists").upsert(
      {
        venue_id: venue.id,
        name: "__party_item_meta__",
        description: JSON.stringify(updatedItemMeta),
      },
      { onConflict: "venue_id,name" },
    );

    // 3. Update venue_playback_state.current_track so every TV poller immediately receives it
    if (activeTrackObj) {
      const nextCurrentTrack = {
        ...activeTrackObj,
        guestName: cleanGuestName ?? activeTrackObj.guestName ?? null,
        dedication: cleanDedication,
      };
      await admin
        .from("venue_playback_state")
        .update({ current_track: nextCurrentTrack })
        .eq("venue_id", venue.id);
    } else if (activeItem && trackDetails) {
      const nextCurrentTrack = {
        itemId: activeItem.id,
        trackId: activeItem.track_id,
        title: trackDetails.title,
        artist: trackDetails.artist,
        youtubeVideoId: trackDetails.youtube_video_id,
        thumbnailUrl: trackDetails.thumbnail_url,
        durationSeconds: trackDetails.duration_seconds,
        guestName: cleanGuestName,
        dedication: cleanDedication,
      };
      await admin
        .from("venue_playback_state")
        .update({ current_track: nextCurrentTrack })
        .eq("venue_id", venue.id);
    }

    // 4. Also update queue_items row if applicable
    if (activeItem?.id) {
      try {
        await admin
          .from("queue_items")
          .update({
            guest_name: cleanGuestName,
            dedication: cleanDedication,
          } as never)
          .eq("id", activeItem.id);
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

    void notifySyncRoom(slug, {
      partyEvent: {
        type: "live_dedication",
        guestName: cleanGuestName,
        dedication: cleanDedication,
        timestamp,
      },
      refreshFromOrigin: true,
    });

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

