import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      versionCode: 6,
      versionName: "2.9.1",
      apkUrl: "https://poneleplay.netlify.app/tv.apk",
      releaseNotes:
        "Sincronización ultra rápida en la nube y LAN (<200ms) con pre-buffer real de primer cuadro, corrección continua de desfase y auto-descubrimiento Wi-Fi de Cabina con 1 clic.",
      mandatory: false,
      publishedAt: "2026-11-12T23:45:00.000Z",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

