import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/api/supabase/admin";
import { resolveEffectiveQueueThreshold } from "@/lib/domain/party";
import { loadVenuePartyConfigFromDb } from "@/lib/api/party-server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const queueItemId = typeof body?.queueItemId === "string" ? body.queueItemId.trim() : "";
    const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
    const isTurbo = Boolean(body?.isTurbo);

    if (!queueItemId) {
      return NextResponse.json({ ok: false, error: "item_not_found" }, { status: 400 });
    }

    const admin = createAdminSupabase();

    // 1. Fetch the queue item
    const { data: item, error: itemErr } = await admin
      .from("queue_items")
      .select("id, venue_id, night_session_id, status, vote_count")
      .eq("id", queueItemId)
      .maybeSingle();

    if (itemErr || !item) {
      return NextResponse.json({ ok: false, error: "item_not_found" }, { status: 404 });
    }

    if (item.status !== "queued" && item.status !== "proposed") {
      return NextResponse.json({ ok: false, error: "item_not_votable" }, { status: 400 });
    }

    // 2. Resolve venue slug & partyConfig threshold
    let targetSlug = slug;
    if (!targetSlug) {
      const { data: v } = await admin
        .from("venues")
        .select("slug")
        .eq("id", item.venue_id)
        .maybeSingle();
      targetSlug = v?.slug || "";
    }

    const { partyConfig } = targetSlug
      ? await loadVenuePartyConfigFromDb(admin, targetSlug)
      : { partyConfig: { venueType: "party" as const, minVotesToQueue: 1 } };

    const threshold = resolveEffectiveQueueThreshold(partyConfig);
    const voteDelta = isTurbo ? 3 : 1;
    const newVoteCount = Number(item.vote_count ?? 0) + voteDelta;
    const newStatus =
      item.status === "proposed" && newVoteCount >= threshold ? "queued" : item.status;

    const { error: updateErr } = await admin
      .from("queue_items")
      .update({
        vote_count: newVoteCount,
        status: newStatus,
      })
      .eq("id", item.id);

    if (updateErr) {
      return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      itemId: item.id,
      voteCount: newVoteCount,
      creditsBalance: 99999,
      status: newStatus,
      promotedToQueue: item.status === "proposed" && newStatus === "queued",
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "server_error" },
      { status: 500 },
    );
  }
}

