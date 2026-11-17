import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface SongPayload {
  id: string;
  spotifyTrackId: string | null;
  youtubeVideoId: string | null;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  imageUrl: string;
  cached: boolean;
}

function extractYoutubeId(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.replace(/^\//, "").split("/")[0] || null;
    }
    if (u.hostname.includes("youtube.com")) {
      return u.searchParams.get("v");
    }
  } catch {
    // ignore non-url input
  }
  return null;
}

function extractSpotifyTrackId(raw: string): string | null {
  const m = raw.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/i);
  return m ? m[1] : null;
}

async function resolveYoutubeOembed(url: string, videoId: string): Promise<SongPayload> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if (res.ok) {
      const data = await res.json();
      return {
        id: `yt-${videoId}`,
        spotifyTrackId: null,
        youtubeVideoId: videoId,
        title: String(data.title || `Pista YouTube (${videoId})`),
        artist: String(data.author_name || "YouTube Music Audio"),
        album: "YouTube Music",
        durationMs: 198_000,
        imageUrl: String(data.thumbnail_url || "/covers/cover-synthwave.png"),
        cached: true,
      };
    }
  } catch {
    // fallback below
  }
  return {
    id: `yt-${videoId}`,
    spotifyTrackId: null,
    youtubeVideoId: videoId,
    title: `Pista YouTube (${videoId})`,
    artist: "YouTube Music Audio",
    album: "YouTube Music",
    durationMs: 198_000,
    imageUrl: "/covers/cover-synthwave.png",
    cached: false,
  };
}

async function resolveSpotifyOembed(url: string, trackId: string): Promise<SongPayload> {
  try {
    const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
    if (res.ok) {
      const data = await res.json();
      return {
        id: `sp-${trackId}`,
        spotifyTrackId: trackId,
        youtubeVideoId: `yt_${trackId}`,
        title: String(data.title || `Track Spotify (${trackId})`),
        artist: "Spotify Track",
        album: "Spotify",
        durationMs: 205_000,
        imageUrl: String(data.thumbnail_url || "/covers/cover-urban.jpg"),
        cached: true,
      };
    }
  } catch {
    // fallback below
  }
  return {
    id: `sp-${trackId}`,
    spotifyTrackId: trackId,
    youtubeVideoId: `yt_${trackId}`,
    title: `Track Spotify (${trackId})`,
    artist: "Spotify Track",
    album: "Spotify",
    durationMs: 205_000,
    imageUrl: "/covers/cover-urban.jpg",
    cached: false,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let query = "";
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      query = String(body.query || "").trim();
    } else {
      const u = new URL(req.url);
      query = String(u.searchParams.get("q") || "").trim();
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const ytId = extractYoutubeId(query);
    if (ytId) {
      const resolved = await resolveYoutubeOembed(query, ytId);
      return new Response(JSON.stringify({ songs: [resolved] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const spId = extractSpotifyTrackId(query);
    if (spId) {
      const resolved = await resolveSpotifyOembed(query, spId);
      return new Response(JSON.stringify({ songs: [resolved] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (supabaseUrl && supabaseKey) {
      const filter = query
        ? `&or=(title.ilike.*${encodeURIComponent(query)}*,artist.ilike.*${encodeURIComponent(query)}*)`
        : "";
      const restUrl = `${supabaseUrl}/rest/v1/songs?select=id,spotify_track_id,youtube_video_id,title,artist,album,duration_ms,image_url&limit=20${filter}`;
      const res = await fetch(restUrl, {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      });
      if (res.ok) {
        const rows = await res.json();
        const songs: SongPayload[] = rows.map((r: Record<string, unknown>) => ({
          id: String(r.id),
          spotifyTrackId: r.spotify_track_id ? String(r.spotify_track_id) : null,
          youtubeVideoId: r.youtube_video_id ? String(r.youtube_video_id) : null,
          title: String(r.title),
          artist: String(r.artist),
          album: String(r.album || ""),
          durationMs: Number(r.duration_ms || 0),
          imageUrl: String(r.image_url || "/covers/cover-synthwave.png"),
          cached: true,
        }));
        return new Response(JSON.stringify({ songs }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ songs: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err), songs: [] }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
