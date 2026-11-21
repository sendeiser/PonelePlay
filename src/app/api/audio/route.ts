import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/api/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const rawPath = req.nextUrl.searchParams.get("path")?.trim() || "";
    if (!rawPath || rawPath.length > 300 || rawPath.includes("..") || rawPath.startsWith("/")) {
      return NextResponse.json({ ok: false, error: "invalid_path" }, { status: 400 });
    }

    const admin = createAdminSupabase();

    // Verify path belongs to a registered track before signing private bucket access
    const { data: trackRow, error: lookupError } = await admin
      .from("tracks")
      .select("id")
      .eq("storage_path", rawPath)
      .limit(1)
      .maybeSingle();

    if (lookupError || !trackRow) {
      return NextResponse.json({ ok: false, error: "track_not_found" }, { status: 404 });
    }

    const { data: signed, error: signError } = await admin.storage
      .from("track-audio")
      .createSignedUrl(rawPath, 3600);

    if (signError || !signed?.signedUrl) {
      return NextResponse.json({ ok: false, error: "sign_failed" }, { status: 500 });
    }

    return NextResponse.redirect(signed.signedUrl, {
      status: 302,
      headers: {
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "audio_proxy_error" }, { status: 500 });
  }
}
