import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/api/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body?.action;
    const slug = body?.slug?.trim() || "billar-aurora";
    const deviceName = body?.deviceName?.trim() || "Android TV";

    const admin = createAdminSupabase();

    if (action === "request") {
      const { data, error } = await admin.rpc("request_tv_pairing_code" as never, {
        p_venue_slug: slug,
        p_device_name: deviceName,
      } as never);

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }

      const res = data as { ok?: boolean; code?: string; expiresInSeconds?: number; error?: string };
      if (!res.ok || !res.code) {
        return NextResponse.json(
          { ok: false, error: res.error || "Error al generar código" },
          { status: 400 },
        );
      }

      const host = req.headers.get("host") || "poneleplay.netlify.app";
      const proto = req.headers.get("x-forwarded-proto") || "https";
      const pairUrl = `${proto}://${host}/panel/${slug}?pair_code=${res.code}`;

      return NextResponse.json({
        ok: true,
        code: res.code,
        pairUrl,
        expiresInSeconds: res.expiresInSeconds || 1800,
      });
    }

    if (action === "check") {
      const code = body?.code?.trim();
      if (!code) {
        return NextResponse.json({ ok: false, error: "code_required" }, { status: 400 });
      }

      const { data, error } = await admin.rpc("check_tv_pairing_status" as never, {
        p_venue_slug: slug,
        p_code: code,
      } as never);

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }

      const res = data as { ok?: boolean; paired?: boolean; token?: string; deviceId?: string; error?: string };
      return NextResponse.json({
        ok: true,
        paired: Boolean(res.paired),
        token: res.token || null,
        deviceId: res.deviceId || null,
      });
    }

    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "server_error" },
      { status: 500 },
    );
  }
}
