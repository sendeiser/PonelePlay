import { NextRequest, NextResponse } from "next/server";
import { notifySyncRoom } from "@/lib/sync/server-notify";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      slug?: string;
      partyEvent?: Record<string, unknown> | null;
    };
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    if (!slug) {
      return NextResponse.json({ ok: false, error: "slug_required" }, { status: 400 });
    }

    await notifySyncRoom(slug, {
      partyEvent: body.partyEvent ?? null,
      refreshFromOrigin: true,
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "server_error" },
      { status: 500 },
    );
  }
}

