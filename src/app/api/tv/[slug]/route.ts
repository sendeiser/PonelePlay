import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/api/supabase/admin";
import { partitionQueueAndProposals, MIN_VOTES_FOR_QUEUE } from "@/lib/domain/queue";

interface QueueItemFeed {
  id: string;
  title: string;
  artist: string;
  youtubeVideoId?: string | null;
  thumbnailUrl?: string | null;
  durationSeconds?: number | null;
  voteCount: number;
  createdAt: string;
  status?: string;
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

    // Map now playing track
    const nowPlayingTrack = playState?.current_track
      ? (playState.current_track as Record<string, unknown>)
      : (rawState.nowPlaying as Record<string, unknown>) || null;

    // Partition queue items and candidate proposals
    const { activeQueue, candidateProposals } = partitionQueueAndProposals<QueueItemFeed>(
      rawQueue,
      rawCandidates,
    );

    const sanitizeVoteCount = (count: unknown): number => {
      const n = Number(count ?? 0);
      return n >= 9999 ? 0 : Math.max(0, n);
    };

    // Clean up any legacy 99999 vote counts in DB in background
    void admin.from("queue_items").update({ vote_count: 0 }).gte("vote_count", 9999);

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
    };

    try {
      if (deviceId) {
        const { data: dev } = await admin
          .from("player_devices")
          .select("display_config")
          .eq("id", deviceId)
          .eq("venue_id", venue.id)
          .maybeSingle();
        const conf = dev?.display_config;
        if (conf && typeof conf === "object") {
          displayConfig = { ...displayConfig, ...(conf as Record<string, unknown>) };
        }
      } else {
        // Fallback: check most recently updated player device in this venue
        const { data: latestDev } = await admin
          .from("player_devices")
          .select("display_config")
          .eq("venue_id", venue.id)
          .not("display_config", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const conf = latestDev?.display_config;
        if (conf && typeof conf === "object") {
          displayConfig = { ...displayConfig, ...(conf as Record<string, unknown>) };
        }
      }
    } catch {
      // Fallback to default
    }

    return NextResponse.json(
      {
        ok: true,
        venue: {
          id: venue.id,
          name: venue.name,
          slug: venue.slug,
        },
        isOpen: rawState.night ? (rawState.night as Record<string, unknown>).status === "open" : false,
        playback: {
          isPaused: Boolean(playState?.is_paused),
          volume: Number(playState?.volume ?? 85),
          isMuted: Boolean(playState?.is_muted),
          karaokeMode: Boolean(playState?.karaoke_mode),
          lastCommand: playState?.last_command ?? null,
          commandSeq: playState?.command_seq ?? 0,
          positionSeconds: Number((playState?.current_track as Record<string, unknown>)?.positionSeconds ?? 0),
          displayConfig,
        },
        nowPlaying: nowPlayingTrack
          ? {
              id: String(nowPlayingTrack.itemId || nowPlayingTrack.id || ""),
              title: String(nowPlayingTrack.title || "Sin título"),
              artist: String(nowPlayingTrack.artist || "Desconocido"),
              youtubeVideoId: nowPlayingTrack.youtubeVideoId ? String(nowPlayingTrack.youtubeVideoId) : null,
              thumbnailUrl: nowPlayingTrack.thumbnailUrl ? String(nowPlayingTrack.thumbnailUrl) : null,
              durationSeconds: Number(nowPlayingTrack.durationSeconds ?? 210),
              voteCount: sanitizeVoteCount(nowPlayingTrack.voteCount),
              isKaraoke: Boolean(nowPlayingTrack.isKaraoke),
            }
          : null,
        queue: activeQueue.map((item, idx) => ({
          id: item.id,
          title: item.title,
          artist: item.artist,
          youtubeVideoId: item.youtubeVideoId,
          thumbnailUrl: item.thumbnailUrl,
          durationSeconds: item.durationSeconds,
          voteCount: sanitizeVoteCount(item.voteCount),
          position: idx + 1,
        })),
        proposals: candidateProposals.map((item) => ({
          id: item.id,
          title: item.title,
          artist: item.artist,
          youtubeVideoId: item.youtubeVideoId,
          thumbnailUrl: item.thumbnailUrl,
          voteCount: sanitizeVoteCount(item.voteCount),
          neededVotes: MIN_VOTES_FOR_QUEUE,
        })),
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
