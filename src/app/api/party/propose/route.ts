import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/api/supabase/admin";
import { resolveEffectiveQueueThreshold, sanitizeDedication } from "@/lib/domain/party";
import { youtubeDedupeKey } from "@/lib/domain/youtube";
import { loadVenuePartyConfigFromDb, type PartyItemMeta } from "@/lib/api/party-server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
    const track = body?.track || {};

    if (!slug || !track?.title) {
      return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
    }

    const admin = createAdminSupabase();
    const { venueId, partyConfig, itemMeta } = await loadVenuePartyConfigFromDb(admin, slug);

    if (!venueId) {
      return NextResponse.json({ ok: false, error: "venue_not_found" }, { status: 404 });
    }

    // 1. Find open night session (or auto-open if none exists in Party Mode)
    let { data: night } = await admin
      .from("night_sessions")
      .select("id, status")
      .eq("venue_id", venueId)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!night?.id) {
      const { data: createdNight } = await admin
        .from("night_sessions")
        .insert({
          venue_id: venueId,
          status: "open",
          opened_by_kind: "owner",
        })
        .select("id, status")
        .single();
      night = createdNight;
    }

    if (!night?.id) {
      return NextResponse.json({ ok: false, error: "night_closed" }, { status: 400 });
    }

    // 2. Find or insert track in public.tracks
    const title = String(track.title).trim();
    const artist = String(track.artist || "Artista").trim();
    const durationSeconds = Number(track.durationSeconds) || 210;
    const youtubeVideoId = track.youtubeVideoId ? String(track.youtubeVideoId).trim() : null;
    const thumbnailUrl = track.thumbnailUrl ? String(track.thumbnailUrl).trim() : null;
    const dedupeKey =
      track.dedupeKey ||
      (youtubeVideoId ? youtubeDedupeKey(youtubeVideoId) : `title:${title.toLowerCase()}`);

    const guestName = track.guestName ? String(track.guestName).trim().slice(0, 40) : null;
    const dedication = sanitizeDedication(track.dedication);
    const isKaraoke = Boolean(track.isKaraoke);

    let { data: existingTrack } = await admin
      .from("tracks")
      .select("id")
      .eq("venue_id", venueId)
      .eq("dedupe_key", dedupeKey)
      .limit(1)
      .maybeSingle();

    if (!existingTrack?.id) {
      const { data: insertedTrack, error: trackErr } = await admin
        .from("tracks")
        .insert({
          venue_id: venueId,
          source: "youtube",
          title,
          artist,
          duration_seconds: durationSeconds,
          thumbnail_url: thumbnailUrl,
          youtube_video_id: youtubeVideoId,
          dedupe_key: dedupeKey,
          created_by_kind: "client",
        })
        .select("id")
        .single();

      if (trackErr || !insertedTrack?.id) {
        return NextResponse.json(
          { ok: false, error: trackErr?.message || "track_insert_failed" },
          { status: 500 },
        );
      }
      existingTrack = insertedTrack;
    }

    // 3. Check if already in active queue or proposals for this night
    const { data: duplicateItem } = await admin
      .from("queue_items")
      .select("id, status, vote_count")
      .eq("night_session_id", night.id)
      .eq("track_id", existingTrack.id)
      .in("status", ["queued", "playing", "proposed"])
      .limit(1)
      .maybeSingle();

    if (duplicateItem?.id) {
      return NextResponse.json({
        ok: false,
        error: "duplicate_active",
        trackId: existingTrack.id,
        itemId: duplicateItem.id,
      });
    }

    // 4. Determine initial status based on effective threshold
    const threshold = resolveEffectiveQueueThreshold({
      ...partyConfig,
      venueType: "party",
    });
    const initialStatus = threshold <= 1 ? "queued" : "proposed";

    // Try inserting with guest_name, dedication, is_karaoke first; fallback if columns don't exist
    let queueItemId = "";
    const { data: insertedWithCols, error: colErr } = await admin
      .from("queue_items")
      .insert({
        venue_id: venueId,
        night_session_id: night.id,
        track_id: existingTrack.id,
        status: initialStatus,
        vote_count: 1,
        guest_name: guestName,
        dedication,
        is_karaoke: isKaraoke,
      } as never)
      .select("id")
      .single();

    if (!colErr && insertedWithCols?.id) {
      queueItemId = insertedWithCols.id;
    } else {
      const { data: insertedBasic, error: basicErr } = await admin
        .from("queue_items")
        .insert({
          venue_id: venueId,
          night_session_id: night.id,
          track_id: existingTrack.id,
          status: initialStatus,
          vote_count: 1,
        })
        .select("id")
        .single();

      if (basicErr || !insertedBasic?.id) {
        return NextResponse.json(
          { ok: false, error: basicErr?.message || "queue_insert_failed" },
          { status: 500 },
        );
      }
      queueItemId = insertedBasic.id;
    }

    // 5. Persist guest metadata in venue_playlists (__party_item_meta__) so it always resolves
    if (guestName || dedication || isKaraoke) {
      const nextMeta: Record<string, PartyItemMeta> = {
        ...itemMeta,
        [queueItemId]: { guestName, dedication, isKaraoke },
        [existingTrack.id]: { guestName, dedication, isKaraoke },
      };

      const { data: metaRow } = await admin
        .from("venue_playlists")
        .select("id")
        .eq("venue_id", venueId)
        .eq("name", "__party_item_meta__")
        .maybeSingle();

      if (metaRow?.id) {
        await admin
          .from("venue_playlists")
          .update({ description: JSON.stringify(nextMeta) })
          .eq("id", metaRow.id);
      } else {
        await admin.from("venue_playlists").insert({
          venue_id: venueId,
          name: "__party_item_meta__",
          description: JSON.stringify(nextMeta),
          is_active: false,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      itemId: queueItemId,
      trackId: existingTrack.id,
      duplicate: false,
      voteCount: 1,
      status: initialStatus,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "server_error" },
      { status: 500 },
    );
  }
}

