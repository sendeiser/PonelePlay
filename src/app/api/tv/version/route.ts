import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      versionCode: 12,
      versionName: "3.3.0",
      apkUrl: "https://poneleplay.netlify.app/tv.apk",
      releaseNotes:
        "Karaoke Híbrido Inteligente: video YouTube fullscreen automático (con QR discreto y cero doble audio) para pistas karaoke + letras sincronizadas arregladas para canciones normales (0% video) y control en vivo desde Cabina.",
      mandatory: false,
      publishedAt: "2026-11-22T22:15:00.000Z",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

