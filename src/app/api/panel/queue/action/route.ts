import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/api/supabase/admin";
import { loadVenuePartyConfigFromDb } from "@/lib/api/party-server";
import { resolveEffectiveQueueThreshold } from "@/lib/domain/party";
import { notifySyncRoom } from "@/lib/sync/server-notify";

export const dynamic = "force-dynamic";

async function resolveVenueSlug(
  admin: ReturnType<typeof createAdminSupabase>,
  slug: string,
  venueId: string | null | undefined,
): Promise<string> {
  if (slug) return slug;
  if (!venueId) return "";
  const { data } = await admin
    .from("venues")
    .select("slug")
    .eq("id", venueId)
    .maybeSingle();
  return data?.slug || "";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body?.action as string | undefined; // "veto" | "skip" | "boost" | "promote"
    const itemId = body?.itemId?.trim();
    const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
    const mode = body?.mode === "candidate" ? "candidate" : "queue";

    if (!itemId) {
      return NextResponse.json({ ok: false, error: "itemId_required" }, { status: 400 });
    }

    if (
      action !== "veto" &&
      action !== "skip" &&
      action !== "boost" &&
      action !== "promote"
    ) {
      return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
    }

    const admin = createAdminSupabase();

    // 1. Fetch item to confirm existence
    const { data: item, error: fetchErr } = await admin
      .from("queue_items")
      .select("id, status, venue_id, night_session_id, vote_count")
      .eq("id", itemId)
      .single();

    if (fetchErr || !item) {
      return NextResponse.json({ ok: true, alreadyHandled: true });
    }

    const targetSlug = await resolveVenueSlug(admin, slug, item.venue_id);

    if (action === "boost" || action === "promote") {
      const { partyConfig } = targetSlug
        ? await loadVenuePartyConfigFromDb(admin, targetSlug)
        : { partyConfig: { venueType: "party" as const, minVotesToQueue: 1 } };

      const threshold = resolveEffectiveQueueThreshold(partyConfig);
      const rawVotes = Number(item.vote_count ?? 0);
      const baseVotes = rawVotes >= 9999 || rawVotes < 0 ? 0 : rawVotes;

      let newVoteCount = baseVotes + 1;

      if (action === "promote") {
        // Promote candidate proposal directly into Cola Activa
        newVoteCount = Math.max(threshold, baseVotes);
      } else if (mode === "queue") {
        // Boosting an item already in Cola Activa moves it to the top of the active queue
        let maxQueuedVotes = baseVotes;
        if (item.night_session_id) {
          const { data: siblings } = await admin
            .from("queue_items")
            .select("id, vote_count")
            .eq("night_session_id", item.night_session_id)
            .eq("status", "queued")
            .lt("vote_count", 9999);
          for (const sib of siblings || []) {
            if (sib.id !== item.id) {
              maxQueuedVotes = Math.max(maxQueuedVotes, Number(sib.vote_count ?? 0));
            }
          }
        }
        newVoteCount = Math.max(threshold, maxQueuedVotes + 1, baseVotes + 1);
      }

      const newStatus =
        action === "promote" || mode === "queue" || newVoteCount >= threshold
          ? "queued"
          : item.status;

      const { error: boostErr } = await admin
        .from("queue_items")
        .update({
          vote_count: newVoteCount,
          status: newStatus,
        })
        .eq("id", itemId);

      if (boostErr) {
        return NextResponse.json({ ok: false, error: boostErr.message }, { status: 500 });
      }

      if (targetSlug) {
        void notifySyncRoom(targetSlug, { refreshFromOrigin: true });
      }

      return NextResponse.json({
        ok: true,
        itemId,
        voteCount: newVoteCount,
        status: newStatus,
        promotedToQueue: newVoteCount >= threshold,
      });
    }

    const targetStatus = action === "veto" ? "vetoed" : "skipped";

    // 2. Update status directly with service role
    const { error: updateErr } = await admin
      .from("queue_items")
      .update({
        status: targetStatus,
        ended_at: new Date().toISOString(),
      })
      .eq("id", itemId);

    if (updateErr) {
      return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
    }

    if (targetSlug) {
      void notifySyncRoom(targetSlug, { refreshFromOrigin: true });
    }

    return NextResponse.json({ ok: true, itemId, status: targetStatus });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "server_error" },
      { status: 500 },
    );
  }
}

