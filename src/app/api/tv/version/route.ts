import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      versionCode: 2,
      versionName: "2.6.0",
      apkUrl: "https://poneleplay.netlify.app/tv.apk",
      releaseNotes:
        "Actualizador automático integrado, solución en votación para cambiar canción y mejoras en reproducción continua.",
      mandatory: false,
      publishedAt: "2026-11-05T21:30:00.000Z",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

