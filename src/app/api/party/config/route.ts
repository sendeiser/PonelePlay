import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/api/supabase/admin";
import {
  resolveActiveSkipVoteForTrack,
  resolveEffectiveQueueThreshold,
  type PartyConfig,
} from "@/lib/domain/party";
import { normalizePartyConfigPatch } from "@/lib/api/party-control";
import { loadVenuePartyConfigFromDb } from "@/lib/api/party-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug")?.trim() || "";
    if (!slug) {
      return NextResponse.json({ ok: false, error: "slug_required" }, { status: 400 });
    }

    const admin = createAdminSupabase();
    const { venueId, partyConfig, itemMeta } = await loadVenuePartyConfigFromDb(admin, slug);

    // Self-heal any guest proposals inserted by legacy RPC with vote_count = 0 so they start at 1 vote in pre-queue
    if (venueId) {
      await admin
        .from("queue_items")
        .update({ vote_count: 1 })
        .eq("venue_id", venueId)
        .eq("status", "queued")
        .eq("vote_count", 0)
        .not("proposed_by_participant_id", "is", null);
    }

    const now = Date.now();
    const cleanedConfig = { ...partyConfig };

    // Vote-to-skip only stays alive while the voted song is still playing
    if (cleanedConfig.activeSkipVote) {
      let currentTrack: Record<string, unknown> | null = null;
      if (venueId) {
        const { data: playState } = await admin
          .from("venue_playback_state")
          .select("current_track")
          .eq("venue_id", venueId)
          .maybeSingle();
        currentTrack = (playState?.current_track as Record<string, unknown> | null) ?? null;
      }
      cleanedConfig.activeSkipVote = resolveActiveSkipVoteForTrack(
        cleanedConfig.activeSkipVote,
        currentTrack,
        now,
      );
    }
    if (
      cleanedConfig.activeDuel &&
      typeof cleanedConfig.activeDuel === "object" &&
      typeof (cleanedConfig.activeDuel as { startedAt?: number }).startedAt === "number"
    ) {
      const duel = cleanedConfig.activeDuel as { startedAt: number; durationSeconds?: number };
      const maxAge = ((duel.durationSeconds || 30) + 6) * 1000;
      if (now - duel.startedAt > maxAge) {
        cleanedConfig.activeDuel = null;
      }
    }
    if (
      cleanedConfig.activeRoulette &&
      typeof cleanedConfig.activeRoulette === "object" &&
      typeof (cleanedConfig.activeRoulette as { startedAt?: number }).startedAt === "number"
    ) {
      const roul = cleanedConfig.activeRoulette as { startedAt: number };
      if (now - roul.startedAt > 16000) {
        cleanedConfig.activeRoulette = null;
      }
    }

    return NextResponse.json({
      ok: true,
      partyConfig: cleanedConfig,
      itemMeta,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "server_error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
    const patch = (body?.patch || body?.partyConfig || {}) as Partial<PartyConfig>;
    const duelVote = body?.duelVote as
      | { duelId?: string; choice?: "A" | "B"; trackId?: string }
      | undefined;
    const rouletteWinnerItemId =
      typeof body?.rouletteWinnerItemId === "string" ? body.rouletteWinnerItemId.trim() : "";

    if (!slug) {
      return NextResponse.json({ ok: false, error: "slug_required" }, { status: 400 });
    }

    const admin = createAdminSupabase();
    const { venueId, partyConfig: current } = await loadVenuePartyConfigFromDb(admin, slug);

    if (!venueId) {
      return NextResponse.json({ ok: false, error: "venue_not_found" }, { status: 404 });
    }

    // Handle live 1v1 Duel Vote if provided
    let updatedDuel = patch.activeDuel !== undefined ? patch.activeDuel : current.activeDuel;
    if (duelVote && updatedDuel && typeof updatedDuel === "object") {
      const d = { ...(updatedDuel as Record<string, unknown>) };
      if (!duelVote.duelId || d.duelId === duelVote.duelId) {
        if (duelVote.choice === "A") {
          d.votesA = Number(d.votesA ?? 1) + 1;
        } else if (duelVote.choice === "B") {
          d.votesB = Number(d.votesB ?? 1) + 1;
        }
        updatedDuel = d;
      }
    }

    // If rouletteWinnerItemId is provided, promote winner to top of active queue
    if (rouletteWinnerItemId) {
      const { data: winItem } = await admin
        .from("queue_items")
        .select("id, vote_count, night_session_id")
        .eq("id", rouletteWinnerItemId)
        .maybeSingle();
      if (winItem?.id) {
        const curVotes = Number(winItem.vote_count ?? 0);
        const base = curVotes >= 9999 ? 0 : curVotes;
        await admin
          .from("queue_items")
          .update({
            status: "queued",
            vote_count: base + 10,
          })
          .eq("id", winItem.id);
      }
    }

    // Lock Party Mode: if venue is already in Party Mode, do not allow switching to Bar Mode
    const safePatch: Partial<PartyConfig> = {
      ...patch,
      activeDuel: updatedDuel,
      // Vote-to-skip state is owned exclusively by /api/party/vote-skip.
      // Never let a stale client copy (localStorage) resurrect a finished poll.
      activeSkipVote: current.activeSkipVote ?? null,
      venueType: current.venueType === "party" ? "party" : (patch.venueType ?? current.venueType),
    };

    const nextConfig = normalizePartyConfigPatch(safePatch, current);

    // 1. Persist in venue_playlists (__party_config__) so it always works regardless of schema columns
    const { data: existingRows } = await admin
      .from("venue_playlists")
      .select("id")
      .eq("venue_id", venueId)
      .eq("name", "__party_config__");

    if (Array.isArray(existingRows) && existingRows.length > 0) {
      await admin
        .from("venue_playlists")
        .update({ description: JSON.stringify(nextConfig) })
        .eq("id", existingRows[0].id);
      if (existingRows.length > 1) {
        const extraIds = existingRows.slice(1).map((r) => r.id);
        await admin.from("venue_playlists").delete().in("id", extraIds);
      }
    } else {
      await admin.from("venue_playlists").insert({
        venue_id: venueId,
        name: "__party_config__",
        description: JSON.stringify(nextConfig),
        is_active: false,
      });
    }

    // 2. Also update venue_settings if the Party Mode columns exist
    try {
      await admin
        .from("venue_settings")
        .update({
          venue_type: nextConfig.venueType,
          party_mode: nextConfig.partyMode,
          party_votes_per_guest: nextConfig.votesPerGuest,
          party_min_votes_to_queue: nextConfig.minVotesToQueue,
          allow_dedications: nextConfig.allowDedications,
          allow_guest_karaoke: nextConfig.allowGuestKaraoke,
          turbo_cooldown_seconds: nextConfig.turboCooldownSeconds,
        } as never)
        .eq("venue_id", venueId);
    } catch {
      // Ignore if columns not yet migrated
    }

    return NextResponse.json({
      ok: true,
      partyConfig: nextConfig,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "server_error" },
      { status: 500 },
    );
  }
}
