import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/api/supabase/admin";

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

    const { data: settings } = await supabase
      .from("venue_settings")
      .select("*")
      .eq("venue_id", v.id)
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      venue: v,
      settings: settings || null,
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

    return NextResponse.json({
      ok: true,
      maxProposals,
      maxQueue,
      maxDuration,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error saving settings" },
      { status: 500 },
    );
  }
}
