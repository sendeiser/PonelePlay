import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      versionCode: 3,
      versionName: "2.7.0",
      apkUrl: "https://poneleplay.netlify.app/tv.apk",
      releaseNotes:
        "Sincronización 100% Cabina + TV, dedicatorias personalizables sin cartel fijo y enrutamiento de audio independiente.",
      mandatory: false,
      publishedAt: "2026-11-06T19:45:00.000Z",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

