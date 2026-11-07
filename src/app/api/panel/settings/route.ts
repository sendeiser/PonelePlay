import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/api/supabase/admin";
import { loadVenuePartyConfigFromDb } from "@/lib/api/party-server";
import { normalizePartyConfigPatch } from "@/lib/api/party-control";
import type { PartyConfig } from "@/lib/domain/party";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  try {
    const supabase = createAdminSupabase();
    const { data: venue, error: venueErr } = await supabase
      .from("venues")
      .select("id, name, slug, accent_color, join_message")
      .eq("slug", slug)
      .maybeSingle();

    if (venueErr || !venue) {
      return NextResponse.json({ error: "Venue not found" }, { status: 404 });
    }

    const v = venue as {
      id: string;
      name: string;
      slug: string;
      accent_color: string | null;
      join_message: string | null;
    };

    const [{ data: settings }, { partyConfig }] = await Promise.all([
      supabase.from("venue_settings").select("*").eq("venue_id", v.id).maybeSingle(),
      loadVenuePartyConfigFromDb(supabase, slug),
    ]);

    return NextResponse.json({
      ok: true,
      venue: v,
      settings: settings || null,
      partyConfig,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error loading settings" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      slug?: string;
      venueName?: string;
      accentColor?: string;
      joinMessage?: string | null;
      explicitFilter?: boolean;
      keywords?: string[];
      maxDuration?: number;
      maxProposals?: number;
      maxQueue?: number;
      votingRoundsEnabled?: boolean;
      votingRoundSeconds?: number;
      partyConfig?: Partial<PartyConfig>;
    };

    if (!body.slug) {
      return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    }

    const supabase = createAdminSupabase();
    const { data: venue, error: venueErr } = await supabase
      .from("venues")
      .select("id")
      .eq("slug", body.slug)
      .maybeSingle();

    if (venueErr || !venue) {
      return NextResponse.json({ error: "Venue not found" }, { status: 404 });
    }

    const venueId = (venue as { id: string }).id;

    // 1. Update venue info
    const venueUpdate: Record<string, unknown> = {};
    if (typeof body.venueName === "string" && body.venueName.trim()) {
      venueUpdate.name = body.venueName.trim();
    }
    if (typeof body.accentColor === "string") {
      venueUpdate.accent_color = body.accentColor;
    }
    if (body.joinMessage !== undefined) {
      venueUpdate.join_message = body.joinMessage || null;
    }

    if (Object.keys(venueUpdate).length > 0) {
      await supabase.from("venues").update(venueUpdate as never).eq("id", venueId);
    }

    // 2. Upsert venue_settings (handles missing row or RLS restrictions cleanly)
    const maxProposals = Math.max(1, Math.min(200, Number(body.maxProposals) || 3));
    const maxQueue = Math.max(1, Math.min(500, Number(body.maxQueue) || 30));
    const maxDuration = Math.max(60, Math.min(3600, Number(body.maxDuration) || 480));
    const votingRoundSeconds = Math.max(30, Math.min(3600, Number(body.votingRoundSeconds) || 180));

    const settingsPayload: Record<string, unknown> = {
      venue_id: venueId,
      explicit_filter_enabled: body.explicitFilter ?? true,
      explicit_keywords: Array.isArray(body.keywords) ? body.keywords : [],
      max_song_duration_seconds: maxDuration,
      max_proposals_per_participant: maxProposals,
      max_queue_size: maxQueue,
      voting_rounds_enabled: body.votingRoundsEnabled ?? true,
      voting_round_seconds: votingRoundSeconds,
      updated_at: new Date().toISOString(),
    };

    const { data: existingSettings } = await supabase
      .from("venue_settings")
      .select("venue_id")
      .eq("venue_id", venueId)
      .maybeSingle();

    if (existingSettings) {
      const { error: updErr } = await supabase
        .from("venue_settings")
        .update(settingsPayload as never)
        .eq("venue_id", venueId);

      if (updErr) {
        // Fallback if optional columns (voting_rounds_enabled) are not in older schema
        await supabase
          .from("venue_settings")
          .update({
            explicit_filter_enabled: body.explicitFilter ?? true,
            explicit_keywords: Array.isArray(body.keywords) ? body.keywords : [],
            max_song_duration_seconds: maxDuration,
            max_proposals_per_participant: maxProposals,
            max_queue_size: maxQueue,
            updated_at: new Date().toISOString(),
          } as never)
          .eq("venue_id", venueId);
      }
    } else {
      const { error: insErr } = await supabase
        .from("venue_settings")
        .insert(settingsPayload as never);

      if (insErr) {
        await supabase.from("venue_settings").insert({
          venue_id: venueId,
          explicit_filter_enabled: body.explicitFilter ?? true,
          explicit_keywords: Array.isArray(body.keywords) ? body.keywords : [],
          max_song_duration_seconds: maxDuration,
          max_proposals_per_participant: maxProposals,
          max_queue_size: maxQueue,
        } as never);
      }
    }

    // 3. Persist partyConfig in venue_playlists (__party_config__) if provided
    let savedPartyConfig: PartyConfig | undefined;
    if (body.partyConfig && typeof body.partyConfig === "object") {
      const { partyConfig: currentParty } = await loadVenuePartyConfigFromDb(supabase, body.slug);
      savedPartyConfig = normalizePartyConfigPatch(
        {
          ...body.partyConfig,
          activeSkipVote: currentParty.activeSkipVote ?? null,
          venueType:
            currentParty.venueType === "party"
              ? "party"
              : (body.partyConfig.venueType ?? currentParty.venueType),
        },
        currentParty,
      );

      const { data: existingRows } = await supabase
        .from("venue_playlists")
        .select("id")
        .eq("venue_id", venueId)
        .eq("name", "__party_config__");

      if (Array.isArray(existingRows) && existingRows.length > 0) {
        await supabase
          .from("venue_playlists")
          .update({ description: JSON.stringify(savedPartyConfig) })
          .eq("id", existingRows[0].id);
        if (existingRows.length > 1) {
          const extraIds = existingRows.slice(1).map((r) => r.id);
          await supabase.from("venue_playlists").delete().in("id", extraIds);
        }
      } else {
        await supabase.from("venue_playlists").insert({
          venue_id: venueId,
          name: "__party_config__",
          description: JSON.stringify(savedPartyConfig),
          is_active: false,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      maxProposals,
      maxQueue,
      maxDuration,
      partyConfig: savedPartyConfig,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error saving settings" },
      { status: 500 },
    );
  }
}
