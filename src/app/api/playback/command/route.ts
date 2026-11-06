import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/api/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      slug?: string;
      command?: string;
      payload?: Record<string, unknown>;
    };

    const slug = body.slug?.trim();
    const command = body.command?.trim();
    const payload = body.payload || {};

    if (!slug || !command) {
      return NextResponse.json(
        { ok: false, error: "slug_and_command_required" },
        { status: 400 },
      );
    }

    const admin = createAdminSupabase();

    // 1. Resolve venue
    const { data: venue, error: venueErr } = await admin
      .from("venues")
      .select("id, name, slug")
      .eq("slug", slug)
      .maybeSingle();

    if (venueErr || !venue) {
      return NextResponse.json(
        { ok: false, error: "venue_not_found" },
        { status: 404 },
      );
    }

    // 2. Load current playback state
    let { data: playState } = await admin
      .from("venue_playback_state")
      .select("*")
      .eq("venue_id", venue.id)
      .maybeSingle();

    if (!playState) {
      const { data: inserted } = await admin
        .from("venue_playback_state")
        .insert({ venue_id: venue.id })
        .select("*")
        .single();
      playState = inserted;
    }

    const nowMs = Date.now();
    const curTrack = ((playState?.current_track as Record<string, unknown>) || {}) as Record<
      string,
      unknown
    >;

    const prevPos = Number(curTrack.positionSeconds ?? 0);
    const prevAnchorMs = Number(curTrack.anchorTimestampMs ?? 0);
    const prevSeekSeq = Number(curTrack.seekSeq ?? 0);
    const wasPaused = Boolean(playState?.is_paused);

    // Compute exact live position right before this command
    const liveElapsed =
      !wasPaused && prevAnchorMs > 0
        ? Math.max(0, prevPos + Math.max(0, nowMs - prevAnchorMs) / 1000)
        : prevPos;

    let newPaused = wasPaused;
    let newVolume = Number(playState?.volume ?? 85);
    let newMuted = Boolean(playState?.is_muted);
    let newKaraoke = Boolean(playState?.karaoke_mode);
    let newCurrentTrack: Record<string, unknown> | null =
      Object.keys(curTrack).length > 0 ? { ...curTrack } : null;

    if (command === "pause") {
      newPaused = true;
      if (newCurrentTrack) {
        newCurrentTrack = {
          ...newCurrentTrack,
          positionSeconds: Math.round(liveElapsed * 100) / 100,
          anchorTimestampMs: nowMs,
        };
      }
    } else if (command === "resume") {
      newPaused = false;
      if (newCurrentTrack) {
        newCurrentTrack = {
          ...newCurrentTrack,
          positionSeconds: prevPos,
          anchorTimestampMs: nowMs,
          seekSeq: prevSeekSeq + 1,
        };
      }
    } else if (command === "toggle_pause") {
      newPaused = !wasPaused;
      if (newCurrentTrack) {
        newCurrentTrack = {
          ...newCurrentTrack,
          positionSeconds: newPaused ? Math.round(liveElapsed * 100) / 100 : prevPos,
          anchorTimestampMs: nowMs,
          seekSeq: newPaused ? prevSeekSeq : prevSeekSeq + 1,
        };
      }
    } else if (command === "seek") {
      const targetSec = Math.max(0, Number(payload.seconds ?? 0));
      if (newCurrentTrack) {
        newCurrentTrack = {
          ...newCurrentTrack,
          positionSeconds: Math.round(targetSec * 100) / 100,
          anchorTimestampMs: nowMs,
          seekSeq: prevSeekSeq + 1,
        };
      }
    } else if (command === "set_volume") {
      newVolume = Math.max(0, Math.min(100, Number(payload.volume ?? newVolume)));
      newMuted = false;
    } else if (command === "mute") {
      newMuted = true;
    } else if (command === "unmute") {
      newMuted = false;
    } else if (command === "toggle_mute") {
      newMuted = !newMuted;
    } else if (command === "set_tv_mute") {
      const tvMuted = Boolean(payload.tvMuted);
      if (newCurrentTrack) {
        newCurrentTrack = {
          ...newCurrentTrack,
          tvMuted,
        };
      }
    } else if (command === "set_karaoke_mode") {
      newKaraoke =
        typeof payload.enabled === "boolean" ? payload.enabled : !newKaraoke;
    } else if (command === "play_now") {
      newPaused = false;
      const incoming = (payload.track || {}) as Record<string, unknown>;
      const startSeconds = Math.max(0, Number(payload.seconds ?? 0));
      const startDelayMs = Math.max(0, Number(payload.startDelayMs ?? 1200));

      if (incoming.title) {
        let trackId = incoming.trackId ? String(incoming.trackId) : null;
        const ytId = incoming.youtubeVideoId ? String(incoming.youtubeVideoId) : null;

        if (!trackId || trackId.startsWith("manual-") || trackId.startsWith("fb-")) {
          const { data: existingTrack } = await admin
            .from("tracks")
            .select("id")
            .eq("venue_id", venue.id)
            .eq("youtube_video_id", ytId || "")
            .maybeSingle();

          if (existingTrack?.id) {
            trackId = existingTrack.id;
          } else if (ytId) {
            const { data: createdTrack } = await admin
              .from("tracks")
              .insert({
                venue_id: venue.id,
                source: "youtube",
                title: String(incoming.title).trim(),
                artist: String(incoming.artist || "YouTube").trim(),
                duration_seconds: Number(incoming.durationSeconds ?? 210),
                thumbnail_url: incoming.thumbnailUrl ? String(incoming.thumbnailUrl) : null,
                youtube_video_id: ytId,
                dedupe_key: `yt:${ytId}`,
                created_by_kind: "owner",
              })
              .select("id")
              .maybeSingle();
            if (createdTrack?.id) trackId = createdTrack.id;
          }
        }

        newCurrentTrack = {
          itemId: String(incoming.itemId || `manual-${nowMs}`),
          trackId: trackId || String(incoming.trackId || `manual-${nowMs}`),
          title: String(incoming.title),
          artist: String(incoming.artist || "YouTube"),
          source: String(incoming.source || "youtube"),
          durationSeconds: Number(incoming.durationSeconds ?? 210),
          youtubeVideoId: ytId,
          thumbnailUrl: incoming.thumbnailUrl ?? null,
          voteCount: Number(incoming.voteCount ?? 0),
          guestName: incoming.guestName ?? null,
          dedication: incoming.dedication ?? null,
          isKaraoke: Boolean(incoming.isKaraoke),
          tvMuted: curTrack.tvMuted ?? false,
          positionSeconds: startSeconds,
          anchorTimestampMs: nowMs + startDelayMs,
          startedAtMs: nowMs,
          seekSeq: prevSeekSeq + 1,
        };

        // Sync queue_items in active night session
        const { data: openNight } = await admin
          .from("night_sessions")
          .select("id")
          .eq("venue_id", venue.id)
          .eq("status", "open")
          .order("opened_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (openNight?.id && trackId) {
          await admin
            .from("queue_items")
            .update({ status: "skipped", ended_at: new Date().toISOString() })
            .eq("night_session_id", openNight.id)
            .eq("status", "playing")
            .neq("track_id", trackId);

          const { data: existingQueueItem } = await admin
            .from("queue_items")
            .select("id")
            .eq("night_session_id", openNight.id)
            .eq("track_id", trackId)
            .in("status", ["queued", "playing"])
            .limit(1)
            .maybeSingle();

          if (existingQueueItem?.id) {
            await admin
              .from("queue_items")
              .update({
                status: "playing",
                started_at: new Date().toISOString(),
                ended_at: null,
              })
              .eq("id", existingQueueItem.id);
            newCurrentTrack.itemId = existingQueueItem.id;
          }
        }
      }
    } else if (command === "skip") {
      // Idempotency guard: if a skip already happened within the last 3s for a different track, return current state
      const expectedVideoId = payload.expectedVideoId
        ? String(payload.expectedVideoId)
        : null;
      const curVideoId = curTrack.youtubeVideoId ? String(curTrack.youtubeVideoId) : null;
      const startedAtMs = Number(curTrack.startedAtMs ?? 0);

      if (
        (expectedVideoId && curVideoId && expectedVideoId !== curVideoId) ||
        (startedAtMs > 0 && nowMs - startedAtMs < 2500 && playState?.last_command === "play_now")
      ) {
        return NextResponse.json({
          ok: true,
          command: "skip_deduped",
          isPaused: wasPaused,
          volume: newVolume,
          isMuted: newMuted,
          karaokeMode: newKaraoke,
          commandSeq: Number(playState?.command_seq ?? 0),
          currentTrack: newCurrentTrack,
        });
      }

      const { data: openNight } = await admin
        .from("night_sessions")
        .select("id")
        .eq("venue_id", venue.id)
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let nextPicked: Record<string, unknown> | null = null;

      if (openNight?.id) {
        await admin
          .from("queue_items")
          .update({ status: "skipped", ended_at: new Date().toISOString() })
          .eq("night_session_id", openNight.id)
          .eq("status", "playing");

        const { data: nextQueueItems } = await admin
          .from("queue_items")
          .select("id, track_id, vote_count, created_at")
          .eq("night_session_id", openNight.id)
          .eq("status", "queued")
          .order("vote_count", { ascending: false })
          .order("created_at", { ascending: true })
          .limit(5);

        if (nextQueueItems && nextQueueItems.length > 0) {
          const chosen =
            nextQueueItems.find((q) => String(q.track_id) !== String(curTrack.trackId || "")) ||
            nextQueueItems[0];

          const { data: trk } = await admin
            .from("tracks")
            .select("id, title, artist, source, duration_seconds, thumbnail_url, youtube_video_id")
            .eq("id", chosen.track_id)
            .maybeSingle();

          if (trk) {
            await admin
              .from("queue_items")
              .update({ status: "playing", started_at: new Date().toISOString() })
              .eq("id", chosen.id);

            nextPicked = {
              itemId: chosen.id,
              trackId: trk.id,
              title: trk.title,
              artist: trk.artist,
              source: trk.source || "youtube",
              durationSeconds: Number(trk.duration_seconds ?? 210),
              youtubeVideoId: trk.youtube_video_id,
              thumbnailUrl: trk.thumbnail_url ?? null,
              voteCount: Number(chosen.vote_count ?? 0),
              tvMuted: curTrack.tvMuted ?? false,
              positionSeconds: 0,
              anchorTimestampMs: nowMs + 1200,
              startedAtMs: nowMs,
              seekSeq: prevSeekSeq + 1,
            };
          }
        }
      }

      // If no queued items, rotate to next venue fallback track
      if (!nextPicked) {
        const { data: fallbacks } = await admin
          .from("fallback_tracks")
          .select("id, position, tracks(id, title, artist, source, duration_seconds, thumbnail_url, youtube_video_id)")
          .eq("venue_id", venue.id)
          .order("position", { ascending: true });

        const fbList = (fallbacks || [])
          .map((row) => {
            const t = Array.isArray(row.tracks) ? row.tracks[0] : row.tracks;
            return t as {
              id: string;
              title: string;
              artist: string;
              source: string;
              duration_seconds: number | null;
              thumbnail_url: string | null;
              youtube_video_id: string | null;
            } | null;
          })
          .filter((t): t is NonNullable<typeof t> => Boolean(t && t.youtube_video_id));

        if (fbList.length > 0) {
          const curIdx = fbList.findIndex(
            (t) =>
              t.youtube_video_id === curVideoId ||
              String(t.id) === String(curTrack.trackId || ""),
          );
          const nextFb = fbList[(curIdx + 1) % fbList.length];
          nextPicked = {
            itemId: `fb-${nextFb.id}`,
            trackId: nextFb.id,
            title: nextFb.title,
            artist: nextFb.artist,
            source: nextFb.source || "youtube",
            durationSeconds: Number(nextFb.duration_seconds ?? 210),
            youtubeVideoId: nextFb.youtube_video_id,
            thumbnailUrl: nextFb.thumbnail_url ?? null,
            voteCount: 0,
            tvMuted: curTrack.tvMuted ?? false,
            positionSeconds: 0,
            anchorTimestampMs: nowMs + 1200,
            startedAtMs: nowMs,
            seekSeq: prevSeekSeq + 1,
          };
        }
      }

      newPaused = false;
      if (nextPicked) {
        newCurrentTrack = nextPicked;
      }
    }

    const nextSeq = Number(playState?.command_seq ?? 0) + 1;

    const { data: updatedState, error: updateErr } = await admin
      .from("venue_playback_state")
      .update({
        is_paused: newPaused,
        volume: newVolume,
        is_muted: newMuted,
        karaoke_mode: newKaraoke,
        current_track: newCurrentTrack,
        last_command: command,
        command_seq: nextSeq,
        updated_at: new Date().toISOString(),
      })
      .eq("venue_id", venue.id)
      .select("*")
      .single();

    if (updateErr) {
      return NextResponse.json(
        { ok: false, error: updateErr.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      command,
      isPaused: Boolean(updatedState.is_paused),
      volume: Number(updatedState.volume ?? 85),
      isMuted: Boolean(updatedState.is_muted),
      karaokeMode: Boolean(updatedState.karaoke_mode),
      commandSeq: Number(updatedState.command_seq ?? nextSeq),
      lastCommand: updatedState.last_command ?? command,
      currentTrack: updatedState.current_track ?? null,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "server_error" },
      { status: 500 },
    );
  }
}

