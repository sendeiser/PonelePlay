import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/api/supabase/admin";
import { loadVenuePartyConfigFromDb } from "@/lib/api/party-server";
import type { PartySkipVoteState } from "@/lib/domain/party";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
    const voterId = typeof body?.voterId === "string" ? body.voterId.trim() : "";
    const trackId = typeof body?.trackId === "string" ? body.trackId.trim() : "";
    const itemId = typeof body?.itemId === "string" ? body.itemId.trim() : "";
    const title = typeof body?.title === "string" ? body.title.trim() : "Canción actual";
    const artist = typeof body?.artist === "string" ? body.artist.trim() : "Artista";

    if (!slug || !voterId) {
      return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
    }

    const admin = createAdminSupabase();
    const { venueId, partyConfig, itemMeta } = await loadVenuePartyConfigFromDb(admin, slug);

    if (!venueId) {
      return NextResponse.json({ ok: false, error: "venue_not_found" }, { status: 404 });
    }

    if (partyConfig.skipVoteEnabled === false) {
      return NextResponse.json({ ok: false, error: "skip_vote_disabled" }, { status: 403 });
    }

    const threshold = Math.max(1, Number(partyConfig.skipVotesThreshold ?? 3));

    const { data: playState } = await admin
      .from("venue_playback_state")
      .select("*")
      .eq("venue_id", venueId)
      .maybeSingle();

    const curTrack = (playState?.current_track as Record<string, unknown> | null) || null;
    const targetTrackKey =
      trackId ||
      itemId ||
      String(curTrack?.trackId || curTrack?.itemId || curTrack?.youtubeVideoId || "current");

    const prevVote = partyConfig.activeSkipVote;
    const prevStartedAt = typeof prevVote?.startedAt === "number"
      ? prevVote.startedAt
      : prevVote?.startedAt
        ? Date.parse(String(prevVote.startedAt)) || 0
        : 0;
    const isSameTrack =
      prevVote &&
      (prevVote.trackId === targetTrackKey ||
        (itemId && prevVote.itemId === itemId)) &&
      Date.now() - prevStartedAt < 15 * 60 * 1000;

    const existingVoters = isSameTrack ? [...(prevVote.voterIds || prevVote.voters || [])] : [];
    const alreadyVoted = existingVoters.includes(voterId);
    if (!alreadyVoted) {
      existingVoters.push(voterId);
    }

    const currentVotes = existingVoters.length;
    const shouldSkip = currentVotes >= threshold;

    let nextSkipState: PartySkipVoteState | null = {
      trackId: targetTrackKey,
      itemId: itemId || String(curTrack?.itemId || ""),
      title: title || String(curTrack?.title || "Canción actual"),
      artist: artist || String(curTrack?.artist || "Artista"),
      voterIds: existingVoters,
      voters: existingVoters,
      votes: currentVotes,
      votesCount: currentVotes,
      threshold,
      startedAt: isSameTrack ? prevVote.startedAt : Date.now(),
    };

    let nextTrackPayload: Record<string, unknown> | null = null;

    if (shouldSkip) {
      nextSkipState = null;

      // Advance playback in DB
      const { data: night } = await admin
        .from("night_sessions")
        .select("id")
        .eq("venue_id", venueId)
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (night?.id) {
        await admin
          .from("queue_items")
          .update({ status: "skipped", ended_at: new Date().toISOString() })
          .eq("night_session_id", night.id)
          .eq("status", "playing");

        // Also mark the item matching itemId as skipped if it was still 'queued'
        if (itemId && itemId.length === 36) {
          await admin
            .from("queue_items")
            .update({ status: "skipped", ended_at: new Date().toISOString() })
            .eq("id", itemId);
        }

        const { data: queuedItems } = await admin
          .from("queue_items")
          .select("id, track_id, vote_count, created_at, tracks(id, title, artist, duration_seconds, thumbnail_url, youtube_video_id, source)")
          .eq("night_session_id", night.id)
          .eq("status", "queued");

        if (Array.isArray(queuedItems) && queuedItems.length > 0) {
          const sorted = [...queuedItems].sort((a, b) => {
            const va = Number(a.vote_count ?? 0) >= 9999 ? 0 : Number(a.vote_count ?? 0);
            const vb = Number(b.vote_count ?? 0) >= 9999 ? 0 : Number(b.vote_count ?? 0);
            if (va !== vb) return vb - va;
            return Date.parse(a.created_at) - Date.parse(b.created_at);
          });

          const winner = sorted[0];
          const tr = (Array.isArray(winner.tracks) ? winner.tracks[0] : winner.tracks) as Record<
            string,
            unknown
          > | null;

          if (winner && tr) {
            await admin
              .from("queue_items")
              .update({ status: "playing", started_at: new Date().toISOString() })
              .eq("id", winner.id);

            const meta = itemMeta[winner.id] || itemMeta[String(winner.track_id)] || {};
            const cleanVotes =
              Number(winner.vote_count ?? 0) >= 9999 ? 0 : Number(winner.vote_count ?? 0);

            nextTrackPayload = {
              itemId: winner.id,
              trackId: winner.track_id,
              title: String(tr.title || "Canción"),
              artist: String(tr.artist || "Artista"),
              source: String(tr.source || "youtube"),
              durationSeconds: Number(tr.duration_seconds ?? 210),
              youtubeVideoId: tr.youtube_video_id ? String(tr.youtube_video_id) : null,
              thumbnailUrl: tr.thumbnail_url ? String(tr.thumbnail_url) : null,
              voteCount: cleanVotes,
              guestName: meta.guestName ?? null,
              dedication: meta.dedication ?? null,
              isKaraoke: Boolean(meta.isKaraoke),
            };
          }
        }
      }

      const nextSeq = Number(playState?.command_seq ?? 0) + 1;
      if (playState) {
        await admin
          .from("venue_playback_state")
          .update({
            is_paused: false,
            current_track: nextTrackPayload ?? playState.current_track,
            last_command: nextTrackPayload ? "play_now" : "skip",
            command_seq: nextSeq,
            updated_at: new Date().toISOString(),
          })
          .eq("venue_id", venueId);
      }
    }

    // Save updated partyConfig in __party_config__
    const nextConfig = {
      ...partyConfig,
      activeSkipVote: nextSkipState,
    };

    const { data: existingRow } = await admin
      .from("venue_playlists")
      .select("id")
      .eq("venue_id", venueId)
      .eq("name", "__party_config__")
      .maybeSingle();

    if (existingRow?.id) {
      await admin
        .from("venue_playlists")
        .update({ description: JSON.stringify(nextConfig) })
        .eq("id", existingRow.id);
    } else {
      await admin.from("venue_playlists").insert({
        venue_id: venueId,
        name: "__party_config__",
        description: JSON.stringify(nextConfig),
        is_active: false,
      });
    }

    return NextResponse.json({
      ok: true,
      votes: currentVotes,
      threshold,
      skipped: shouldSkip,
      alreadyVoted,
      activeSkipVote: nextSkipState,
      nextTrack: nextTrackPayload,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "server_error" },
      { status: 500 },
    );
  }
}
