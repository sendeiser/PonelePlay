import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      versionCode: 7,
      versionName: "2.9.2",
      apkUrl: "https://poneleplay.netlify.app/tv.apk",
      releaseNotes:
        "Afinado máximo de sincronización (<50-100ms): timestamps de alta precisión en Cabina, interpolación monotónica continua, compensación de latencia de tránsito y calibración adaptativa automática de seek por televisor.",
      mandatory: false,
      publishedAt: "2026-11-13T01:30:00.000Z",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

