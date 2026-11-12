import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      versionCode: 5,
      versionName: "2.9.0",
      apkUrl: "https://poneleplay.netlify.app/tv.apk",
      releaseNotes:
        "Modo LAN ultra rápido (<2ms) con auto-descubrimiento en red local + failover automático en la nube, sincronización de reloj y reproducción exacta en 0:00 con Cabina.",
      mandatory: false,
      publishedAt: "2026-11-12T22:30:00.000Z",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

