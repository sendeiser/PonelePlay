import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { createAdminSupabase } from "@/lib/api/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body?.action;
    const rawSlug = typeof body?.slug === "string" ? body.slug.trim().toLowerCase() : "";
    const deviceName = typeof body?.deviceName === "string" && body.deviceName.trim()
      ? body.deviceName.trim()
      : "Smart TV Salón";

    const admin = createAdminSupabase();

    if (action === "request") {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const rawToken = randomBytes(32).toString("hex");
      const targetVenueSlug = rawSlug || "__unassigned__";
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      if (rawSlug) {
        await admin
          .from("tv_pairing_codes")
          .delete()
          .eq("venue_slug", rawSlug)
          .eq("paired", false);
      }

      const { error: insertErr } = await admin.from("tv_pairing_codes").insert({
        venue_slug: targetVenueSlug,
        code,
        device_name: deviceName,
        raw_token: rawToken,
        paired: false,
        expires_at: expiresAt,
      });

      if (insertErr) {
        return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 });
      }

      const host = req.headers.get("host") || "poneleplay.netlify.app";
      const proto = req.headers.get("x-forwarded-proto") || "https";
      const pairUrl = rawSlug
        ? `${proto}://${host}/panel/${rawSlug}?pair_code=${code}`
        : `${proto}://${host}/login?pair_code=${code}`;

      return NextResponse.json({
        ok: true,
        code,
        deviceName,
        pairUrl,
        expiresInSeconds: 1800,
      });
    }

    if (action === "confirm") {
      const code = typeof body?.code === "string" ? body.code.trim() : "";
      if (!rawSlug || !code) {
        return NextResponse.json(
          { ok: false, error: "Ingresá el código de 6 dígitos que aparece en la TV." },
          { status: 400 },
        );
      }

      const { data: venue } = await admin
        .from("venues")
        .select("id, name, slug, owner_id")
        .eq("slug", rawSlug)
        .maybeSingle();

      if (!venue?.id) {
        return NextResponse.json(
          { ok: false, error: "No se encontró la cuenta o cabina seleccionada." },
          { status: 404 },
        );
      }

      const nowIso = new Date().toISOString();
      const { data: pairRow } = await admin
        .from("tv_pairing_codes")
        .select("*")
        .eq("code", code)
        .eq("paired", false)
        .gt("expires_at", nowIso)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!pairRow) {
        return NextResponse.json(
          { ok: false, error: "Código inválido o vencido. Generá uno nuevo en la TV." },
          { status: 400 },
        );
      }

      const finalName =
        (typeof body?.deviceName === "string" && body.deviceName.trim()) ||
        pairRow.device_name ||
        "TV Salón Principal";

      const tokenHash = createHash("sha256").update(pairRow.raw_token).digest("hex");

      const { data: deviceRow, error: devErr } = await admin
        .from("player_devices")
        .insert({
          venue_id: venue.id,
          name: finalName,
          token_hash: tokenHash,
          paired_by_owner_id: venue.owner_id,
          last_seen_at: nowIso,
        })
        .select("id")
        .single();

      if (devErr || !deviceRow?.id) {
        return NextResponse.json(
          { ok: false, error: devErr?.message || "No se pudo registrar la pantalla TV." },
          { status: 500 },
        );
      }

      await admin
        .from("tv_pairing_codes")
        .update({
          paired: true,
          venue_slug: venue.slug,
          paired_device_id: deviceRow.id,
          device_name: finalName,
        })
        .eq("id", pairRow.id);

      return NextResponse.json({
        ok: true,
        slug: venue.slug,
        venueName: venue.name,
        deviceId: deviceRow.id,
        name: finalName,
        token: pairRow.raw_token,
      });
    }

    if (action === "check") {
      const code = typeof body?.code === "string" ? body.code.trim() : "";
      if (!code) {
        return NextResponse.json({ ok: false, error: "code_required" }, { status: 400 });
      }

      const { data: pairRow, error: checkErr } = await admin
        .from("tv_pairing_codes")
        .select("*")
        .eq("code", code)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (checkErr) {
        return NextResponse.json({ ok: false, error: checkErr.message }, { status: 500 });
      }

      if (!pairRow) {
        return NextResponse.json({ ok: true, paired: false });
      }

      const resolvedSlug =
        pairRow.venue_slug && pairRow.venue_slug !== "__unassigned__"
          ? pairRow.venue_slug
          : rawSlug || null;

      return NextResponse.json({
        ok: true,
        paired: Boolean(pairRow.paired),
        slug: resolvedSlug,
        token: pairRow.paired ? pairRow.raw_token : null,
        deviceId: pairRow.paired ? pairRow.paired_device_id : null,
        name: pairRow.device_name || null,
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
