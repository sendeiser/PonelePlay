import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      versionCode: 11,
      versionName: "3.2.0",
      apkUrl: "https://poneleplay.netlify.app/tv.apk",
      releaseNotes:
        "Karaoke 0% video potenciado: subtítulos sincronizados de YouTube + LRCLIB + lyrics.ovh y ajuste de sincronización de letras en vivo (±0.5s) desde Cabina.",
      mandatory: false,
      publishedAt: "2026-11-22T21:30:00.000Z",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

