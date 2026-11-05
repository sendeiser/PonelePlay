import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/api/supabase/admin";
import {
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
    const { partyConfig, itemMeta } = await loadVenuePartyConfigFromDb(admin, slug);

    return NextResponse.json({
      ok: true,
      partyConfig,
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

    if (!slug) {
      return NextResponse.json({ ok: false, error: "slug_required" }, { status: 400 });
    }

    const admin = createAdminSupabase();
    const { venueId, partyConfig: current } = await loadVenuePartyConfigFromDb(admin, slug);

    if (!venueId) {
      return NextResponse.json({ ok: false, error: "venue_not_found" }, { status: 404 });
    }

    // Lock Party Mode: if venue is already in Party Mode, do not allow switching to Bar Mode
    const safePatch: Partial<PartyConfig> = {
      ...patch,
      venueType: current.venueType === "party" ? "party" : (patch.venueType ?? current.venueType),
    };

    const nextConfig = normalizePartyConfigPatch(safePatch, current);

    // 1. Persist in venue_playlists (__party_config__) so it always works regardless of schema columns
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

    // 3. If in Party Mode, promote any proposed items that now meet minVotesToQueue
    if (nextConfig.venueType === "party") {
      const threshold = resolveEffectiveQueueThreshold(nextConfig);
      await admin
        .from("queue_items")
        .update({ status: "queued" })
        .eq("venue_id", venueId)
        .eq("status", "proposed")
        .gte("vote_count", threshold);
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
