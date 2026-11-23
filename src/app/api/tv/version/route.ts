import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      versionCode: 13,
      versionName: "3.3.1",
      apkUrl: "https://poneleplay.netlify.app/tv.apk",
      releaseNotes:
        "Corrección crítica de sincronización: evita que las canciones pasen solas en bucle al ingresar celulares al módulo de votación o cambiar de pista en TV y Cabina.",
      mandatory: false,
      publishedAt: "2026-11-23T01:30:00.000Z",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

