import { NextResponse } from "next/server";
import { parseYoutubeVideoId } from "@/lib/domain/youtube";
import { demoSearchCatalog } from "@/lib/demo-data";

export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  artist: string;
  duration: string;
  durationSeconds: number;
  thumbnailUrl: string;
  isKaraoke?: boolean;
  views?: string;
  viewsCount?: number;
}

function parseDurationString(str?: string): number {
  if (!str) return 210;
  const parts = str.split(":").map(Number);
  if (parts.length === 2) {
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  }
  if (parts.length === 3) {
    return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  }
  return 210;
}

function parseViewsString(str?: string): number {
  if (!str) return 0;
  const s = str.toLowerCase().replace(/ visualizaciones| views/g, "").trim();
  if (s.includes("m")) {
    const val = parseFloat(s.replace(/m.*/, "").replace(",", ".").trim());
    return isNaN(val) ? 0 : val * 1000000;
  }
  if (s.includes("k")) {
    const val = parseFloat(s.replace(/k.*/, "").replace(",", ".").trim());
    return isNaN(val) ? 0 : val * 1000;
  }
  const num = parseInt(s.replace(/\D/g, ""), 10);
  return isNaN(num) ? 0 : num;
}

function isKaraokeVideo(title: string, channel: string): boolean {
  const t = `${title} ${channel}`.toLowerCase();
  return (
    t.includes("karaoke") ||
    t.includes("instrumental") ||
    t.includes("canta") ||
    t.includes("con letra") ||
    t.includes("letra") ||
    t.includes("backing track") ||
    t.includes("sing along") ||
    t.includes("sing-along") ||
    t.includes("cantaokey") ||
    t.includes("sing king") ||
    t.includes("karaofun")
  );
}

interface YouTubeInitialData {
  contents?: {
    twoColumnSearchResultsRenderer?: {
      primaryContents?: {
        sectionListRenderer?: {
          contents?: Array<{
            itemSectionRenderer?: {
              contents?: Array<{
                videoRenderer?: {
                  videoId?: string;
                  title?: { runs?: Array<{ text?: string }> };
                  ownerText?: { runs?: Array<{ text?: string }> };
                  shortBylineText?: { runs?: Array<{ text?: string }> };
                  lengthText?: { simpleText?: string };
                  viewCountText?: { simpleText?: string };
                  thumbnail?: { thumbnails?: Array<{ url?: string }> };
                };
              }>;
            };
          }>;
        };
      };
    };
  };
}

async function searchViaScrape(query: string, isKaraoke: boolean): Promise<YouTubeSearchResult[]> {
  const effectiveQuery = isKaraoke && !query.toLowerCase().includes("karaoke")
    ? `${query} karaoke`
    : query;

  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(effectiveQuery)}&hl=es`;
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
    },
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    throw new Error(`YouTube scrape failed: ${response.status}`);
  }

  const html = await response.text();
  const match =
    html.match(/var ytInitialData = ({[\s\S]*?});<\/script>/) ||
    html.match(/ytInitialData\s*=\s*({[\s\S]+?});/);

  if (!match) return [];

  const data: YouTubeInitialData = JSON.parse(match[1]);
  const sectionContents =
    data.contents?.twoColumnSearchResultsRenderer?.primaryContents
      ?.sectionListRenderer?.contents || [];

  const results: YouTubeSearchResult[] = [];

  for (const section of sectionContents) {
    const items = section.itemSectionRenderer?.contents || [];
    for (const item of items) {
      const v = item.videoRenderer;
      if (!v || !v.videoId) continue;

      const title = v.title?.runs?.[0]?.text?.trim() || "";
      const channel =
        v.ownerText?.runs?.[0]?.text?.trim() ||
        v.shortBylineText?.runs?.[0]?.text?.trim() ||
        "YouTube";
      const durationStr = v.lengthText?.simpleText || "3:30";
      const durationSecs = parseDurationString(durationStr);
      const viewsStr = v.viewCountText?.simpleText || "";
      const viewsCount = parseViewsString(viewsStr);
      const thumbnail =
        v.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
        `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`;

      if (title) {
        // In Karaoke mode, only accept authentic karaoke versions
        if (isKaraoke && !isKaraokeVideo(title, channel)) {
          continue;
        }

        results.push({
          videoId: v.videoId,
          title,
          artist: channel,
          duration: durationStr,
          durationSeconds: durationSecs,
          thumbnailUrl: thumbnail,
          isKaraoke: isKaraoke || isKaraokeVideo(title, channel),
          views: viewsStr,
          viewsCount,
        });
      }
      if (results.length >= (isKaraoke ? 15 : 8)) break;
    }
    if (results.length >= (isKaraoke ? 15 : 8)) break;
  }

  // Sort karaoke results strictly by most viewed descending
  if (isKaraoke) {
    results.sort((a, b) => (b.viewsCount || 0) - (a.viewsCount || 0));
  }

  return results.slice(0, 8);
}

async function searchViaApi(
  query: string,
  apiKey: string,
  isKaraoke: boolean,
): Promise<YouTubeSearchResult[]> {
  const effectiveQuery = isKaraoke && !query.toLowerCase().includes("karaoke")
    ? `${query} karaoke`
    : query;

  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=${
    isKaraoke ? "viewCount" : "relevance"
  }&maxResults=15&q=${encodeURIComponent(effectiveQuery)}&key=${apiKey}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`YouTube API failed: ${response.status}`);
  }
  const data = await response.json();
  const rawItems = (data.items || []) as Array<{
    id: { videoId: string };
    snippet: {
      title: string;
      channelTitle: string;
      thumbnails?: { high?: { url?: string }; default?: { url?: string } };
    };
  }>;

  const mapped: YouTubeSearchResult[] = [];

  for (const item of rawItems) {
    const title = item.snippet.title;
    const channel = item.snippet.channelTitle;

    if (isKaraoke && !isKaraokeVideo(title, channel)) {
      continue;
    }

    mapped.push({
      videoId: item.id.videoId,
      title,
      artist: channel,
      duration: "3:30",
      durationSeconds: 210,
      thumbnailUrl:
        item.snippet.thumbnails?.high?.url ||
        item.snippet.thumbnails?.default?.url ||
        `https://img.youtube.com/vi/${item.id.videoId}/hqdefault.jpg`,
      isKaraoke: isKaraoke || isKaraokeVideo(title, channel),
    });

    if (mapped.length >= 8) break;
  }

  return mapped;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() || "";
  const isKaraoke =
    searchParams.get("karaoke") === "true" ||
    searchParams.get("karaoke") === "1" ||
    searchParams.get("mode") === "karaoke";

  if (!q) {
    return NextResponse.json({ results: [] });
  }

  // 1. Direct YouTube link or 11-char ID
  const directId = parseYoutubeVideoId(q);
  if (directId) {
    try {
      const oembedRes = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${directId}&format=json`,
      );
      if (oembedRes.ok) {
        const oembed = await oembedRes.json();
        const title = oembed.title || `Video de YouTube (${directId})`;
        return NextResponse.json({
          results: [
            {
              videoId: directId,
              title,
              artist: oembed.author_name || "YouTube",
              duration: "3:45",
              durationSeconds: 225,
              thumbnailUrl:
                oembed.thumbnail_url ||
                `https://img.youtube.com/vi/${directId}/hqdefault.jpg`,
              isKaraoke: isKaraoke || isKaraokeVideo(title, oembed.author_name || ""),
            },
          ],
        });
      }
    } catch {
      // Fallback below
    }

    return NextResponse.json({
      results: [
        {
          videoId: directId,
          title: `Video de YouTube (${directId})`,
          artist: "Link directo",
          duration: "3:45",
          durationSeconds: 225,
          thumbnailUrl: `https://img.youtube.com/vi/${directId}/hqdefault.jpg`,
          isKaraoke,
        },
      ],
    });
  }

  // 2. Search query via API or Scrape
  try {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (apiKey) {
      try {
        const apiResults = await searchViaApi(q, apiKey, isKaraoke);
        if (apiResults.length > 0) {
          return NextResponse.json({ results: apiResults });
        }
      } catch {
        // Fall back to scrape
      }
    }

    const scrapeResults = await searchViaScrape(q, isKaraoke);
    if (scrapeResults.length > 0) {
      return NextResponse.json({ results: scrapeResults });
    }
  } catch {
    // Fallback to local catalog
  }

  // 3. Fallback matching against demo catalog
  const term = q.toLowerCase();
  const matched = demoSearchCatalog.filter((item) =>
    `${item.title} ${item.artist}`.toLowerCase().includes(term),
  );

  return NextResponse.json({
    results: matched.map((item) => ({
      videoId: `demo-${item.id}`,
      title: isKaraoke ? `${item.title} (Karaoke Letra)` : item.title,
      artist: isKaraoke ? `${item.artist} · Karaoke Oficial` : item.artist,
      duration: item.duration,
      durationSeconds: 210,
      thumbnailUrl: "",
      isKaraoke,
      views: isKaraoke ? "2.4 M visualizaciones" : undefined,
      viewsCount: isKaraoke ? 2400000 : undefined,
    })),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const q = typeof body.query === "string" ? body.query : "";
    const isKaraoke = Boolean(body.karaoke || body.mode === "karaoke");
    const url = new URL(request.url);
    url.searchParams.set("q", q);
    if (isKaraoke) url.searchParams.set("karaoke", "true");
    return GET(new Request(url.toString(), { headers: request.headers }));
  } catch {
    return NextResponse.json({ results: [] });
  }
}
