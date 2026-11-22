import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      versionCode: 10,
      versionName: "3.1.0",
      apkUrl: "https://poneleplay.netlify.app/tv.apk",
      releaseNotes:
        "Corrección de sonido en TV (WebView 200x112dp + desbloqueo automático de mute remoto), estabilidad total de modos de pantalla sin cambios espontáneos y letras sincronizadas en vivo para Modo Karaoke.",
      mandatory: false,
      publishedAt: "2026-11-22T20:30:00.000Z",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

