import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      versionCode: 8,
      versionName: "3.0.0",
      apkUrl: "https://poneleplay.netlify.app/tv.apk",
      releaseNotes:
        "Nuevo modo 100% Música sin video: vistas Salón y Portada con progreso sincronizado por reloj, ruteo 3 vías (Solo Cabina por defecto, Solo TV, Cabina + TV) y reproducción nativa de MP3 subidos con ajuste elástico continuo.",
      mandatory: false,
      publishedAt: "2026-11-21T23:30:00.000Z",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

