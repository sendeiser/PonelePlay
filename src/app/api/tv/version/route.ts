import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      versionCode: 4,
      versionName: "2.8.0",
      apkUrl: "https://poneleplay.netlify.app/tv.apk",
      releaseNotes:
        "Sincronización 100% exacta desde el inicio (0:00) con pre-buffer Cabina/TV, respuesta inmediata al adelantar o atrasar (+10s/-10s/barra/reinicio) y mejoras de estabilidad.",
      mandatory: false,
      publishedAt: "2026-11-06T20:30:00.000Z",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

