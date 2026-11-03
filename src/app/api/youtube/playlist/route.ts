import { NextResponse } from "next/server";
import { parseYoutubePlaylistId } from "@/lib/domain/youtube";
import { fetchYouTubePlaylistServer } from "@/lib/server/youtube-playlist";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw =
    searchParams.get("id") ||
    searchParams.get("url") ||
    searchParams.get("list") ||
    searchParams.get("q") ||
    "";

  if (!raw.trim()) {
    return NextResponse.json({ error: "Missing playlist identifier or URL" }, { status: 400 });
  }

  const playlistId = parseYoutubePlaylistId(raw) || raw.trim();
  if (!playlistId) {
    return NextResponse.json({ error: "Invalid YouTube playlist URL or ID" }, { status: 400 });
  }

  const playlist = await fetchYouTubePlaylistServer(playlistId);
  if (!playlist) {
    return NextResponse.json(
      { error: "No se pudo cargar la lista de reproducción. Verificá que sea pública o no esté vacía." },
      { status: 404 },
    );
  }

  return NextResponse.json({ playlist });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const raw = typeof body.id === "string" ? body.id : typeof body.url === "string" ? body.url : "";
    const playlistId = parseYoutubePlaylistId(raw) || raw.trim();

    if (!playlistId) {
      return NextResponse.json({ error: "Invalid YouTube playlist URL or ID" }, { status: 400 });
    }

    const playlist = await fetchYouTubePlaylistServer(playlistId);
    if (!playlist) {
      return NextResponse.json(
        { error: "No se pudo cargar la lista de reproducción. Verificá que sea pública o no esté vacía." },
        { status: 404 },
      );
    }

    return NextResponse.json({ playlist });
  } catch {
    return NextResponse.json({ error: "Bad Request" }, { status: 400 });
  }
}
