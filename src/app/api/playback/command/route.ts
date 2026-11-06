import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/api/supabase/admin";
import { loadVenuePartyConfigFromDb } from "@/lib/api/party-server";
import { resolveEffectiveQueueThreshold } from "@/lib/domain/party";
import { DEFAULT_TV_DISPLAY_CONFIG, type TvDisplayConfig } from "@/lib/api/tv-pairing";

export const dynamic = "force-dynamic";

export type AudioRoutingMode = "BOTH" | "CABINA_ONLY" | "TV_ONLY";

async function broadcastFromServer(
  admin: ReturnType<typeof createAdminSupabase>,
  topic: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const channel = admin.channel(topic);
    try {
      await channel.httpSend(event, payload, { timeout: 3500 });
    } finally {
      await admin.removeChannel(channel);
    }
  } catch {
    // Non-blocking: HTTP polling with command_seq also guarantees delivery
  }
}

export function computeLivePositionSeconds(
  trackObj: Record<string, unknown> | null,
  isPaused: boolean,
  nowMs: number = Date.now(),
): number {
  if (!trackObj) return 0;
  const basePos = Math.max(0, Number(trackObj.positionSeconds ?? 0));
  if (isPaused) return Math.floor(basePos);
  const startedAtMs = Number(trackObj.startedAtMs ?? 0);
  if (!startedAtMs || startedAtMs <= 0) return Math.floor(basePos);
  const elapsed = Math.max(0, (nowMs - startedAtMs) / 1000);
  const dur = Number(trackObj.durationSeconds ?? 210);
  const raw = basePos + elapsed;
  return dur > 0 ? Math.min(dur, Math.floor(raw)) : Math.floor(raw);
}

function getTrackKey(track: Record<string, unknown> | null | undefined): string {
  if (!track) return "";
  return String(
    track.youtubeVideoId ||
      track.storagePath ||
      track.trackId ||
      track.itemId ||
      track.id ||
      "",
  );
}

async function resolveNextServerTrack(
  admin: ReturnType<typeof createAdminSupabase>,
  venueId: string,
  slug: string,
  currentTrack: Record<string, unknown> | null,
  markStatus: "played" | "skipped",
): Promise<Record<string, unknown> | null> {
  const curKey = getTrackKey(currentTrack);
  const curItemId = currentTrack?.itemId ? String(currentTrack.itemId) : "";

  const { partyConfig, itemMeta } = await loadVenuePartyConfigFromDb(admin, slug);
  const effectiveThreshold = resolveEffectiveQueueThreshold(partyConfig);

  // 1. Check active night session queue
  const { data: night } = await admin
    .from("night_sessions")
    .select("id")
    .eq("venue_id", venueId)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (night?.id) {
    // Mark currently playing item(s) as played/skipped
    await admin
      .from("queue_items")
      .update({ status: markStatus, ended_at: new Date().toISOString() })
      .eq("night_session_id", night.id)
      .eq("status", "playing");

    if (curItemId && curItemId.length === 36) {
      await admin
        .from("queue_items")
        .update({ status: markStatus, ended_at: new Date().toISOString() })
        .eq("id", curItemId)
        .in("status", ["playing", "queued"]);
    }

    // Fetch candidate/queued items
    const { data: rawItems } = await admin
      .from("queue_items")
      .select(
        "id, track_id, status, vote_count, created_at, tracks(id, title, artist, duration_seconds, thumbnail_url, youtube_video_id, storage_path, source)",
      )
      .eq("night_session_id", night.id)
      .in("status", ["queued", "proposed"]);

    if (Array.isArray(rawItems) && rawItems.length > 0) {
      const eligible = rawItems.filter(
        (it) =>
          it.status === "queued" || Number(it.vote_count ?? 0) >= effectiveThreshold,
      );

      if (eligible.length > 0) {
        const sorted = [...eligible].sort((a, b) => {
          const va = Number(a.vote_count ?? 0) >= 9999 ? 0 : Number(a.vote_count ?? 0);
          const vb = Number(b.vote_count ?? 0) >= 9999 ? 0 : Number(b.vote_count ?? 0);
          if (va !== vb) return vb - va;
          return Date.parse(a.created_at) - Date.parse(b.created_at);
        });

        // Pick first track different from the one that just finished (if possible)
        const chosen =
          sorted.find((candidate) => {
            const tr = (
              Array.isArray(candidate.tracks) ? candidate.tracks[0] : candidate.tracks
            ) as Record<string, unknown> | null;
            const candKey = String(
              tr?.youtube_video_id || tr?.storage_path || candidate.track_id || candidate.id,
            );
            return !curKey || candKey !== curKey;
          }) || sorted[0];

        const tr = (Array.isArray(chosen.tracks) ? chosen.tracks[0] : chosen.tracks) as Record<
          string,
          unknown
        > | null;

        if (chosen && tr) {
          await admin
            .from("queue_items")
            .update({ status: "playing", started_at: new Date().toISOString() })
            .eq("id", chosen.id);

          const ytId = tr.youtube_video_id ? String(tr.youtube_video_id) : "";
          const titleKey = tr.title ? `title:${String(tr.title).toLowerCase()}` : "";
          const meta =
            itemMeta[chosen.id] ||
            itemMeta[String(chosen.track_id)] ||
            (ytId ? itemMeta[`yt:${ytId}`] : undefined) ||
            (titleKey ? itemMeta[titleKey] : undefined) ||
            {};

          const cleanVotes =
            Number(chosen.vote_count ?? 0) >= 9999 ? 0 : Number(chosen.vote_count ?? 0);

          return {
            itemId: chosen.id,
            trackId: chosen.track_id,
            title: String(tr.title || "Canción"),
            artist: String(tr.artist || "Artista"),
            source: String(tr.source || "youtube"),
            durationSeconds: Number(tr.duration_seconds ?? 210),
            youtubeVideoId: ytId || null,
            storagePath: tr.storage_path ? String(tr.storage_path) : null,
            thumbnailUrl: tr.thumbnail_url ? String(tr.thumbnail_url) : null,
            voteCount: cleanVotes,
            guestName: meta.guestName ?? null,
            dedication: meta.dedication ?? null,
            isKaraoke: Boolean(meta.isKaraoke),
          };
        }
      }
    }
  }

  // 2. Fallback tracks from venue's fallback_tracks table
  const { data: fbRows } = await admin
    .from("fallback_tracks")
    .select("position, track_id")
    .eq("venue_id", venueId)
    .order("position", { ascending: true });

  if (Array.isArray(fbRows) && fbRows.length > 0) {
    const trackIds = fbRows.map((r) => r.track_id);
    const { data: tracksData } = await admin
      .from("tracks")
      .select("*")
      .in("id", trackIds);

    const trackMap = new Map((tracksData || []).map((t) => [t.id, t]));
    const orderedFallbacks = fbRows
      .map((item) => trackMap.get(item.track_id))
      .filter((t): t is NonNullable<typeof t> => Boolean(t && (t.youtube_video_id || t.storage_path)));

    if (orderedFallbacks.length > 0) {
      const curIdx = orderedFallbacks.findIndex(
        (t) =>
          (t.youtube_video_id && t.youtube_video_id === curKey) ||
          t.id === currentTrack?.trackId ||
          `fb-${t.id}` === currentTrack?.itemId,
      );
      const nextIdx = curIdx >= 0 ? (curIdx + 1) % orderedFallbacks.length : 0;
      const nextFb = orderedFallbacks[nextIdx];
      return {
        itemId: `fb-${nextFb.id}`,
        trackId: nextFb.id,
        title: String(nextFb.title || "Playlist del Salón"),
        artist: String(nextFb.artist || "Selección Musical"),
        source: String(nextFb.source || "youtube"),
        durationSeconds: Number(nextFb.duration_seconds ?? 210),
        youtubeVideoId: nextFb.youtube_video_id ? String(nextFb.youtube_video_id) : null,
        storagePath: nextFb.storage_path ? String(nextFb.storage_path) : null,
        thumbnailUrl: nextFb.thumbnail_url ? String(nextFb.thumbnail_url) : null,
        voteCount: 0,
        guestName: null,
        dedication: null,
        isKaraoke: false,
      };
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { slug, command, payload = {} } = body as {
      slug: string;
      command: string;
      payload?: Record<string, unknown>;
    };

    if (!slug || !command) {
      return NextResponse.json({ ok: false, error: "missing_params" }, { status: 400 });
    }

    const admin = createAdminSupabase();
    const nowMs = Date.now();

    // 1. Resolve venue
    const { data: venue } = await admin
      .from("venues")
      .select("id, name, slug")
      .eq("slug", slug)
      .maybeSingle();

    if (!venue) {
      return NextResponse.json({ ok: false, error: "venue_not_found" }, { status: 404 });
    }

    // 2. Get or create venue_playback_state
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

    // 3. Load stored displayConfig (__tv_display_config__)
    const { data: displayRow } = await admin
      .from("venue_playlists")
      .select("id, description")
      .eq("venue_id", venue.id)
      .eq("name", "__tv_display_config__")
      .maybeSingle();

    let storedDisplay: {
      global: TvDisplayConfig & { audioRouting?: AudioRoutingMode; cabinaMuted?: boolean };
      devices: Record<string, TvDisplayConfig>;
    } = {
      global: { ...DEFAULT_TV_DISPLAY_CONFIG, audioRouting: "BOTH", cabinaMuted: false },
      devices: {},
    };

    if (displayRow?.description) {
      try {
        const parsed = JSON.parse(displayRow.description);
        if (parsed.global) {
          storedDisplay = {
            global: { ...DEFAULT_TV_DISPLAY_CONFIG, ...parsed.global },
            devices: parsed.devices || {},
          };
        } else {
          storedDisplay = {
            global: { ...DEFAULT_TV_DISPLAY_CONFIG, ...parsed },
            devices: {},
          };
        }
      } catch {
        // Use default
      }
    }

    const prevTrack = (playState?.current_track as Record<string, unknown> | null) || null;
    let newPaused = Boolean(playState?.is_paused);
    let newVolume = Number(playState?.volume ?? 85);
    let cabinaMuted = Boolean(
      prevTrack?.cabinaMuted ?? storedDisplay.global.cabinaMuted ?? playState?.is_muted ?? false,
    );
    let tvMuted = Boolean(prevTrack?.tvMuted ?? storedDisplay.global.tvMuted ?? false);
    let audioRouting: AudioRoutingMode =
      (prevTrack?.audioRouting as AudioRoutingMode) ||
      storedDisplay.global.audioRouting ||
      (cabinaMuted && !tvMuted ? "TV_ONLY" : !cabinaMuted && tvMuted ? "CABINA_ONLY" : "BOTH");
    let newKaraoke = Boolean(playState?.karaoke_mode);
    let newTrack: Record<string, unknown> | null = prevTrack ? { ...prevTrack } : null;
    let displayUpdated = false;

    const livePosBeforeCmd = computeLivePositionSeconds(prevTrack, newPaused, nowMs);

    // 4. Process Command
    if (command === "pause") {
      const reportedPos =
        typeof payload.currentTime === "number" && payload.currentTime >= 0
          ? Math.floor(payload.currentTime)
          : livePosBeforeCmd;
      newPaused = true;
      if (newTrack) {
        newTrack.positionSeconds = reportedPos;
        newTrack.startedAtMs = nowMs;
      }
    } else if (command === "resume") {
      const reportedPos =
        typeof payload.currentTime === "number" && payload.currentTime >= 0
          ? Math.floor(payload.currentTime)
          : Number(newTrack?.positionSeconds ?? livePosBeforeCmd);
      newPaused = false;
      if (newTrack) {
        newTrack.positionSeconds = reportedPos;
        newTrack.startedAtMs = nowMs;
      }
    } else if (command === "toggle_pause") {
      newPaused = !newPaused;
      if (newTrack) {
        newTrack.positionSeconds = livePosBeforeCmd;
        newTrack.startedAtMs = nowMs;
      }
    } else if (command === "seek") {
      const targetSec = Math.max(0, Math.floor(Number(payload.seconds ?? 0)));
      if (newTrack) {
        newTrack.positionSeconds = targetSec;
        newTrack.startedAtMs = nowMs;
      }
    } else if (command === "set_volume") {
      newVolume = Math.max(0, Math.min(100, Number(payload.volume ?? newVolume)));
      cabinaMuted = false;
      audioRouting = tvMuted ? "CABINA_ONLY" : "BOTH";
      storedDisplay.global.cabinaMuted = false;
      storedDisplay.global.audioRouting = audioRouting;
      displayUpdated = true;
    } else if (command === "mute") {
      cabinaMuted = true;
      audioRouting = tvMuted ? "CABINA_ONLY" : "TV_ONLY";
      storedDisplay.global.cabinaMuted = true;
      storedDisplay.global.audioRouting = audioRouting;
      displayUpdated = true;
    } else if (command === "unmute") {
      cabinaMuted = false;
      audioRouting = tvMuted ? "CABINA_ONLY" : "BOTH";
      storedDisplay.global.cabinaMuted = false;
      storedDisplay.global.audioRouting = audioRouting;
      displayUpdated = true;
    } else if (command === "toggle_mute") {
      cabinaMuted = !cabinaMuted;
      audioRouting = cabinaMuted && !tvMuted ? "TV_ONLY" : !cabinaMuted && tvMuted ? "CABINA_ONLY" : "BOTH";
      storedDisplay.global.cabinaMuted = cabinaMuted;
      storedDisplay.global.audioRouting = audioRouting;
      displayUpdated = true;
    } else if (command === "set_tv_mute") {
      tvMuted = Boolean(payload.tvMuted ?? payload.muted);
      audioRouting = cabinaMuted && !tvMuted ? "TV_ONLY" : !cabinaMuted && tvMuted ? "CABINA_ONLY" : "BOTH";
      storedDisplay.global.tvMuted = tvMuted;
      storedDisplay.global.audioRouting = audioRouting;
      for (const dId of Object.keys(storedDisplay.devices)) {
        storedDisplay.devices[dId] = { ...storedDisplay.devices[dId], tvMuted };
      }
      displayUpdated = true;
    } else if (command === "set_audio_routing") {
      const requested = String(payload.routing || "BOTH") as AudioRoutingMode;
      if (requested === "CABINA_ONLY" || requested === "TV_ONLY" || requested === "BOTH") {
        audioRouting = requested;
        cabinaMuted = requested === "TV_ONLY";
        tvMuted = requested === "CABINA_ONLY";
        storedDisplay.global.audioRouting = audioRouting;
        storedDisplay.global.cabinaMuted = cabinaMuted;
        storedDisplay.global.tvMuted = tvMuted;
        for (const dId of Object.keys(storedDisplay.devices)) {
          storedDisplay.devices[dId] = { ...storedDisplay.devices[dId], tvMuted };
        }
        displayUpdated = true;
      }
    } else if (command === "set_karaoke_mode") {
      newKaraoke =
        typeof payload.enabled === "boolean" ? payload.enabled : !newKaraoke;
    } else if (command === "play_now") {
      newPaused = false;
      const incoming = (payload.track as Record<string, unknown> | undefined) || null;
      if (incoming && incoming.title) {
        const ytId = incoming.youtubeVideoId ? String(incoming.youtubeVideoId) : null;
        let trackId = incoming.trackId ? String(incoming.trackId) : null;

        // Ensure track exists in DB tracks table if valid UUID not provided
        if (!trackId || trackId.length !== 36) {
          const { data: existingTrack } = await admin
            .from("tracks")
            .select("id")
            .eq("venue_id", venue.id)
            .eq("youtube_video_id", ytId || "")
            .limit(1)
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
              .single();
            if (createdTrack?.id) trackId = createdTrack.id;
          }
        }

        // Update night_session queue_items so get_night_state matches 100%
        const { data: night } = await admin
          .from("night_sessions")
          .select("id")
          .eq("venue_id", venue.id)
          .eq("status", "open")
          .order("opened_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        let itemId = String(incoming.itemId || `manual-${nowMs}`);
        if (night?.id && trackId && trackId.length === 36) {
          await admin
            .from("queue_items")
            .update({ status: "skipped", ended_at: new Date().toISOString() })
            .eq("night_session_id", night.id)
            .eq("status", "playing")
            .neq("track_id", trackId);

          const { data: qItem } = await admin
            .from("queue_items")
            .select("id")
            .eq("night_session_id", night.id)
            .eq("track_id", trackId)
            .in("status", ["queued", "playing"])
            .limit(1)
            .maybeSingle();

          if (qItem?.id) {
            itemId = qItem.id;
            await admin
              .from("queue_items")
              .update({
                status: "playing",
                started_at: new Date().toISOString(),
                ended_at: null,
              })
              .eq("id", qItem.id);
          } else {
            const { data: newQItem } = await admin
              .from("queue_items")
              .insert({
                venue_id: venue.id,
                night_session_id: night.id,
                track_id: trackId,
                status: "playing",
                vote_count: Number(incoming.voteCount ?? 0),
                started_at: new Date().toISOString(),
              })
              .select("id")
              .single();
            if (newQItem?.id) itemId = newQItem.id;
          }
        }

        newTrack = {
          itemId,
          trackId: trackId || itemId,
          title: String(incoming.title),
          artist: String(incoming.artist || "Artista"),
          source: String(incoming.source || "youtube"),
          durationSeconds: Number(incoming.durationSeconds ?? 210),
          youtubeVideoId: ytId,
          storagePath: incoming.storagePath ? String(incoming.storagePath) : null,
          thumbnailUrl: incoming.thumbnailUrl ? String(incoming.thumbnailUrl) : null,
          voteCount: Number(incoming.voteCount ?? 0),
          guestName: incoming.guestName ?? null,
          dedication: incoming.dedication ?? null,
          isKaraoke: Boolean(incoming.isKaraoke),
          positionSeconds: 0,
          startedAtMs: nowMs,
        };
      }
    } else if (command === "skip" || command === "track_ended") {
      // Idempotency guard for track_ended so multiple devices never double-skip
      if (command === "track_ended") {
        const endedKey = String(payload.endedTrackKey || "");
        const serverCurKey = getTrackKey(prevTrack);
        const startedAgoMs = nowMs - Number(prevTrack?.startedAtMs ?? 0);
        if (
          (endedKey && serverCurKey && endedKey !== serverCurKey) ||
          (Number(prevTrack?.startedAtMs ?? 0) > 0 && startedAgoMs < 4500)
        ) {
          return NextResponse.json({
            ok: true,
            alreadyAdvanced: true,
            command: "play_now",
            isPaused: newPaused,
            volume: newVolume,
            isMuted: cabinaMuted,
            cabinaMuted,
            tvMuted,
            audioRouting,
            karaokeMode: newKaraoke,
            commandSeq: Number(playState?.command_seq ?? 0),
            currentTrack: prevTrack,
            positionSeconds: livePosBeforeCmd,
            startedAtMs: Number(prevTrack?.startedAtMs ?? nowMs),
          });
        }
      }

      const nextResolved = await resolveNextServerTrack(
        admin,
        venue.id,
        slug,
        prevTrack,
        command === "track_ended" ? "played" : "skipped",
      );

      if (nextResolved) {
        newPaused = false;
        newTrack = {
          ...nextResolved,
          positionSeconds: 0,
          startedAtMs: nowMs,
        };
      } else if (newTrack) {
        // Restart current track if no other track exists at all
        newPaused = false;
        newTrack.positionSeconds = 0;
        newTrack.startedAtMs = nowMs;
      }
    } else if (command === "enqueue_top") {
      // Delegate to existing SQL RPC for enqueue_top
      await admin.rpc("send_playback_command" as never, {
        p_venue_slug: slug,
        p_command: "enqueue_top",
        p_payload: payload,
      } as never);
    }

    // Attach authoritative audio routing & clock metadata onto current_track
    if (newTrack) {
      newTrack = {
        ...newTrack,
        audioRouting,
        cabinaMuted,
        tvMuted,
        startedAtMs: Number(newTrack.startedAtMs ?? nowMs),
        positionSeconds: Number(newTrack.positionSeconds ?? 0),
      };
    }

    // Save __tv_display_config__ if modified
    if (displayUpdated) {
      const serialized = JSON.stringify(storedDisplay);
      if (displayRow?.id) {
        await admin
          .from("venue_playlists")
          .update({ description: serialized, updated_at: new Date().toISOString() })
          .eq("id", displayRow.id);
      } else {
        await admin.from("venue_playlists").insert({
          venue_id: venue.id,
          name: "__tv_display_config__",
          description: serialized,
          is_active: false,
        });
      }
    }

    const effectiveCommand =
      (command === "skip" || command === "track_ended") && newTrack ? "play_now" : command;
    const nextSeq = Number(playState?.command_seq ?? 0) + 1;

    const { data: updatedState } = await admin
      .from("venue_playback_state")
      .update({
        is_paused: newPaused,
        volume: newVolume,
        is_muted: cabinaMuted,
        karaoke_mode: newKaraoke,
        current_track: newTrack,
        last_command: effectiveCommand,
        command_seq: nextSeq,
        updated_at: new Date().toISOString(),
      })
      .eq("venue_id", venue.id)
      .select("*")
      .single();

    const finalSeq = Number(updatedState?.command_seq ?? nextSeq);
    const livePosAfter = computeLivePositionSeconds(newTrack, newPaused, nowMs);

    const responsePayload = {
      ok: true,
      command: effectiveCommand,
      isPaused: newPaused,
      volume: newVolume,
      isMuted: cabinaMuted,
      cabinaMuted,
      tvMuted,
      audioRouting,
      karaokeMode: newKaraoke,
      commandSeq: finalSeq,
      lastCommand: effectiveCommand,
      currentTrack: newTrack,
      positionSeconds: livePosAfter,
      startedAtMs: Number(newTrack?.startedAtMs ?? nowMs),
      serverTimeMs: nowMs,
    };

    // Broadcast authoritative event via server-side Supabase Realtime
    await broadcastFromServer(admin, `playback-control:${slug}`, "playback_command", {
      command: effectiveCommand,
      payload: {
        ...payload,
        track: newTrack,
        seconds: livePosAfter,
        positionSeconds: livePosAfter,
        startedAtMs: Number(newTrack?.startedAtMs ?? nowMs),
        volume: newVolume,
        cabinaMuted,
        tvMuted,
        audioRouting,
        isPaused: newPaused,
      },
      state: responsePayload,
      commandSeq: finalSeq,
      timestamp: nowMs,
    });

    return NextResponse.json(responsePayload, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "server_error" },
      { status: 500 },
    );
  }
}

