import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/api/supabase/admin";
import { partitionQueueAndProposals } from "@/lib/domain/queue";
import {
  resolveActiveSkipVoteForTrack,
  resolveEffectiveQueueThreshold,
} from "@/lib/domain/party";
import { loadVenuePartyConfigFromDb } from "@/lib/api/party-server";

interface QueueItemFeed {
  id: string;
  trackId?: string;
  title: string;
  artist: string;
  youtubeVideoId?: string | null;
  thumbnailUrl?: string | null;
  durationSeconds?: number | null;
  voteCount: number;
  createdAt: string;
  status?: string;
  guestName?: string | null;
  dedication?: string | null;
  isKaraoke?: boolean;
}

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    if (!slug) {
      return NextResponse.json({ ok: false, error: "slug_required" }, { status: 400 });
    }

    const admin = createAdminSupabase();

    // 1. Get venue
    const { data: venue, error: venueErr } = await admin
      .from("venues")
      .select("id, name, slug")
      .eq("slug", slug)
      .maybeSingle();

    if (venueErr || !venue) {
      return NextResponse.json({ ok: false, error: "venue_not_found" }, { status: 404 });
    }

    // 2. Fetch Night State via RPC
    const { data: stateData } = await admin.rpc(
      "get_night_state" as never,
      { p_venue_slug: slug } as never,
    );

    // 3. Fetch venue_playback_state
    const { data: playState } = await admin
      .from("venue_playback_state")
      .select("*")
      .eq("venue_id", venue.id)
      .maybeSingle();

    const rawState = (stateData || {}) as Record<string, unknown>;
    const rawQueue = (rawState.queue as QueueItemFeed[]) || [];
    const rawCandidates = (rawState.candidates as QueueItemFeed[]) || [];

    // 4. Load Party Mode config & guest metadata
    const { partyConfig, itemMeta } = await loadVenuePartyConfigFromDb(admin, slug);
    const effectiveThreshold = resolveEffectiveQueueThreshold(partyConfig);

    // Map now playing track
    const nowPlayingTrack = playState?.current_track
      ? (playState.current_track as Record<string, unknown>)
      : (rawState.nowPlaying as Record<string, unknown>) || null;

    // Partition queue items and candidate proposals using effective threshold
    const { activeQueue, candidateProposals } = partitionQueueAndProposals<QueueItemFeed>(
      rawQueue,
      rawCandidates,
      effectiveThreshold,
    );

    const sanitizeVoteCount = (count: unknown): number => {
      const n = Number(count ?? 0);
      return n >= 9999 ? 0 : Math.max(0, n);
    };

    // Clean up any legacy 99999 vote counts and self-heal 0-vote guest proposals in DB
    void admin.from("queue_items").update({ vote_count: 0 }).gte("vote_count", 9999);
    void admin
      .from("queue_items")
      .update({ vote_count: 1 })
      .eq("venue_id", venue.id)
      .eq("status", "queued")
      .eq("vote_count", 0)
      .not("proposed_by_participant_id", "is", null);

    const host = req.headers.get("host") || "poneleplay.netlify.app";
    const proto = req.headers.get("x-forwarded-proto") || "https";
    const clientUrl = `${proto}://${host}/p/${slug}`;

    const deviceId = req.nextUrl.searchParams.get("device_id") || req.headers.get("x-device-id");
    let displayConfig = {
      mode: "VIDEO",
      showQueue: true,
      showProposals: true,
      theme: "neon",
      scale: "normal",
      tvMuted: false,
    };

    try {
      const { data: storedRow } = await admin
        .from("venue_playlists")
        .select("description")
        .eq("venue_id", venue.id)
        .eq("name", "__tv_display_config__")
        .maybeSingle();

      if (storedRow?.description) {
        const parsed = JSON.parse(storedRow.description);
        const globalCfg = parsed.global || parsed;
        const devCfg = deviceId && parsed.devices ? parsed.devices[deviceId] : null;
        displayConfig = {
          ...displayConfig,
          ...globalCfg,
          ...(devCfg || {}),
        };
      }
    } catch {
      // Fallback to default
    }

    const nowMs = Date.now();
    const currentDed = itemMeta["__current_dedication__"] as
      | { guestName?: string | null; dedication?: string | null; timestamp?: number }
      | undefined;
    const isCurrentDedActive = Boolean(
      currentDed?.dedication &&
      typeof currentDed.timestamp === "number" &&
      nowMs - currentDed.timestamp < 300000,
    );

    const resolveMeta = (item: Record<string, unknown>) => {
      const id = String(item.itemId || item.id || "");
      const trackId = String(item.trackId || "");
      const ytId = item.youtubeVideoId ? String(item.youtubeVideoId) : "";
      const titleKey = item.title ? `title:${String(item.title).toLowerCase()}` : "";
      const meta =
        itemMeta[id] ||
        (trackId ? itemMeta[trackId] : undefined) ||
        (ytId ? itemMeta[`yt:${ytId}`] : undefined) ||
        (titleKey ? itemMeta[titleKey] : undefined);

      let dedication = (item.dedication as string | null) ?? meta?.dedication ?? null;
      let guestName = (item.guestName as string | null) ?? meta?.guestName ?? null;

      if (isCurrentDedActive && currentDed?.dedication) {
        dedication = currentDed.dedication;
        if (currentDed.guestName) guestName = currentDed.guestName;
      }

      return {
        guestName,
        dedication,
        isKaraoke: Boolean(item.isKaraoke ?? meta?.isKaraoke ?? false),
      };
    };

    let effectiveNowPlaying =
      nowPlayingTrack ||
      (activeQueue.length > 0 ? (activeQueue[0] as unknown as Record<string, unknown>) : null);

    if (!effectiveNowPlaying) {
      const { data: fbRows } = await admin
        .from("fallback_tracks")
        .select("id, position, tracks(id, title, artist, source, duration_seconds, thumbnail_url, youtube_video_id)")
        .eq("venue_id", venue.id)
        .order("position", { ascending: true })
        .limit(1);

      if (fbRows && fbRows.length > 0) {
        const fbTrack = Array.isArray(fbRows[0].tracks) ? fbRows[0].tracks[0] : fbRows[0].tracks;
        if (fbTrack && typeof fbTrack === "object" && "youtube_video_id" in fbTrack && fbTrack.youtube_video_id) {
          effectiveNowPlaying = {
            itemId: `fb-${fbTrack.id}`,
            trackId: fbTrack.id,
            title: fbTrack.title,
            artist: fbTrack.artist,
            youtubeVideoId: fbTrack.youtube_video_id,
            thumbnailUrl: fbTrack.thumbnail_url ?? null,
            durationSeconds: Number(fbTrack.duration_seconds ?? 210),
            voteCount: 0,
          };
        }
      }
    }

    if (!effectiveNowPlaying && isCurrentDedActive) {
      effectiveNowPlaying = {
        itemId: "now-playing-live-dedication",
        trackId: "live-dedication-track",
        title: venue.name,
        artist: "Salón en Vivo",
        youtubeVideoId: "oMpaVIio3UQ",
        durationSeconds: 300,
        voteCount: 0,
        guestName: currentDed?.guestName ?? null,
        dedication: currentDed?.dedication ?? null,
      };
    }

    const curTrackMeta = (playState?.current_track as Record<string, unknown>) || {};
    const anchorPos = Number(curTrackMeta.positionSeconds ?? 0);
    const anchorMs = Number(curTrackMeta.anchorTimestampMs ?? 0);
    const seekSeq = Number(curTrackMeta.seekSeq ?? 0);
    const isPausedFlag = Boolean(playState?.is_paused);
    const trackDur = Number(effectiveNowPlaying?.durationSeconds ?? 210);
    const livePositionSeconds =
      !isPausedFlag && anchorMs > 0
        ? Math.min(
            trackDur > 0 ? trackDur : 9999,
            Math.max(0, Math.round((anchorPos + Math.max(0, nowMs - anchorMs) / 1000) * 100) / 100),
          )
        : Math.max(0, anchorPos);
    const resolvedTvMuted = Boolean(
      displayConfig.tvMuted ?? curTrackMeta.tvMuted ?? false,
    );

    const nowMeta = effectiveNowPlaying ? resolveMeta(effectiveNowPlaying) : null;
    let activeDuel = partyConfig.activeDuel ?? null;
    if (
      activeDuel &&
      typeof activeDuel === "object" &&
      typeof (activeDuel as { startedAt?: number }).startedAt === "number"
    ) {
      const d = activeDuel as { startedAt: number; durationSeconds?: number };
      if (nowMs - d.startedAt > ((d.durationSeconds || 30) + 6) * 1000) {
        activeDuel = null;
      }
    }
    let activeRoulette = partyConfig.activeRoulette ?? null;
    if (
      activeRoulette &&
      typeof activeRoulette === "object" &&
      typeof (activeRoulette as { startedAt?: number }).startedAt === "number"
    ) {
      const r = activeRoulette as { startedAt: number };
      if (nowMs - r.startedAt > 16000) {
        activeRoulette = null;
      }
    }
    // Only show the vote-to-skip badge while the voted song is still playing
    const activeSkipVote = resolveActiveSkipVoteForTrack(
      partyConfig.activeSkipVote ?? null,
      nowPlayingTrack,
      nowMs,
    );

    return NextResponse.json(
      {
        ok: true,
        venue: {
          id: venue.id,
          name: venue.name,
          slug: venue.slug,
          venueType: partyConfig.venueType,
        },
        partyConfig: {
          ...partyConfig,
          activeDuel,
          activeRoulette,
          activeSkipVote,
        },
        activeDuel,
        activeRoulette,
        activeSkipVote,
        isOpen: rawState.night ? (rawState.night as Record<string, unknown>).status === "open" : false,
        playback: {
          isPaused: isPausedFlag,
          volume: Number(playState?.volume ?? 85),
          isMuted: resolvedTvMuted,
          tvMuted: resolvedTvMuted,
          cabinaMuted: Boolean(playState?.is_muted),
          karaokeMode: Boolean(playState?.karaoke_mode),
          lastCommand: playState?.last_command ?? null,
          commandSeq: playState?.command_seq ?? 0,
          seekSeq,
          positionSeconds: livePositionSeconds,
          anchorPositionSeconds: anchorPos,
          anchorTimestampMs: anchorMs,
          serverTimeMs: nowMs,
          displayConfig: {
            ...displayConfig,
            tvMuted: resolvedTvMuted,
          },
        },
        liveDedication: isCurrentDedActive && currentDed?.dedication
          ? {
              guestName: currentDed.guestName ?? null,
              message: currentDed.dedication,
              style: partyConfig.dedicationStyle || "neon",
              repeats: partyConfig.dedicationRepeats ?? 2,
              timestamp: currentDed.timestamp ?? nowMs,
            }
          : null,
        nowPlaying: effectiveNowPlaying
          ? {
              id: String(effectiveNowPlaying.itemId || effectiveNowPlaying.id || ""),
              title: String(effectiveNowPlaying.title || "Sin título"),
              artist: String(effectiveNowPlaying.artist || "Desconocido"),
              youtubeVideoId: effectiveNowPlaying.youtubeVideoId ? String(effectiveNowPlaying.youtubeVideoId) : null,
              thumbnailUrl: effectiveNowPlaying.thumbnailUrl ? String(effectiveNowPlaying.thumbnailUrl) : null,
              durationSeconds: Number(effectiveNowPlaying.durationSeconds ?? 210),
              voteCount: sanitizeVoteCount(effectiveNowPlaying.voteCount),
              isKaraoke: nowMeta?.isKaraoke ?? false,
              guestName: nowMeta?.guestName ?? null,
              dedication: nowMeta?.dedication ?? null,
            }
          : null,
        queue: activeQueue.map((item, idx) => {
          const meta = resolveMeta(item as unknown as Record<string, unknown>);
          return {
            id: item.id,
            title: item.title,
            artist: item.artist,
            youtubeVideoId: item.youtubeVideoId,
            thumbnailUrl: item.thumbnailUrl,
            durationSeconds: item.durationSeconds,
            voteCount: sanitizeVoteCount(item.voteCount),
            position: idx + 1,
            isKaraoke: meta.isKaraoke,
            guestName: meta.guestName,
            dedication: meta.dedication,
          };
        }),
        proposals: candidateProposals.map((item) => {
          const meta = resolveMeta(item as unknown as Record<string, unknown>);
          return {
            id: item.id,
            title: item.title,
            artist: item.artist,
            youtubeVideoId: item.youtubeVideoId,
            thumbnailUrl: item.thumbnailUrl,
            voteCount: sanitizeVoteCount(item.voteCount),
            neededVotes: effectiveThreshold,
            isKaraoke: meta.isKaraoke,
            guestName: meta.guestName,
            dedication: meta.dedication,
          };
        }),
        clientUrl,
        serverTime: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "server_error" },
      { status: 500 },
    );
  }
}
