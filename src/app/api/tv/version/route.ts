import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      versionCode: 9,
      versionName: "3.0.1",
      apkUrl: "https://poneleplay.netlify.app/tv.apk",
      releaseNotes:
        "Modo Portada con listas de Cola en Vivo y Votación flotantes, cambio instantáneo de modo de pantalla desde Cabina y corrección al saltear canciones para nunca repetir temas ya reproducidos.",
      mandatory: false,
      publishedAt: "2026-11-21T23:55:00.000Z",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

