import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/api/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const trackId = body?.trackId;

    if (!trackId || typeof trackId !== "string") {
      return NextResponse.json(
        { ok: false, error: "trackId_required" },
        { status: 400 },
      );
    }

    const admin = createAdminSupabase();

    // 1. Fetch track info first to check storage_path
    const { data: track, error: fetchErr } = await admin
      .from("tracks")
      .select("id, storage_path")
      .eq("id", trackId)
      .single();

    if (fetchErr || !track) {
      return NextResponse.json(
        { ok: false, error: "track_not_found" },
        { status: 404 },
      );
    }

    // 2. Cascade delete dependent rows across tables
    await admin.from("queue_items").delete().eq("track_id", trackId);
    await admin.from("fallback_tracks").delete().eq("track_id", trackId);
    await admin.from("playlist_tracks").delete().eq("track_id", trackId);
    await admin.from("votes").delete().eq("track_id", trackId);

    // 3. If track has an uploaded MP3 file, remove it from storage
    if (track.storage_path) {
      try {
        await admin.storage.from("track-audio").remove([track.storage_path]);
      } catch (storageErr) {
        console.warn("Could not delete track storage file:", storageErr);
      }
    }

    // 4. Finally delete the track from tracks table
    const { error: delErr } = await admin
      .from("tracks")
      .delete()
      .eq("id", trackId);

    if (delErr) {
      return NextResponse.json(
        { ok: false, error: delErr.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "internal_error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

