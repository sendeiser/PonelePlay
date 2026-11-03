import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/api/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body?.action; // "veto" | "skip"
    const itemId = body?.itemId?.trim();

    if (!itemId) {
      return NextResponse.json({ ok: false, error: "itemId_required" }, { status: 400 });
    }

    if (action !== "veto" && action !== "skip") {
      return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
    }

    const admin = createAdminSupabase();
    const targetStatus = action === "veto" ? "vetoed" : "skipped";

    // 1. Fetch item to confirm existence
    const { data: item, error: fetchErr } = await admin
      .from("queue_items")
      .select("id, status, venue_id, night_session_id")
      .eq("id", itemId)
      .single();

    if (fetchErr || !item) {
      // If item is already deleted or not found, treat as success or return not found
      return NextResponse.json({ ok: true, alreadyHandled: true });
    }

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

    return NextResponse.json({ ok: true, itemId, status: targetStatus });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "server_error" },
      { status: 500 },
    );
  }
}

