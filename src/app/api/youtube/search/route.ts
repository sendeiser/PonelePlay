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

async function searchViaScrape(query: string): Promise<YouTubeSearchResult[]> {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=es`;
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

      const title = v.title?.runs?.[0]?.text?.trim();
      const channel =
        v.ownerText?.runs?.[0]?.text?.trim() ||
        v.shortBylineText?.runs?.[0]?.text?.trim() ||
        "YouTube";
      const durationStr = v.lengthText?.simpleText || "3:30";
      const durationSecs = parseDurationString(durationStr);
      const thumbnail =
        v.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
        `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`;

      if (title) {
        results.push({
          videoId: v.videoId,
          title,
          artist: channel,
          duration: durationStr,
          durationSeconds: durationSecs,
          thumbnailUrl: thumbnail,
        });
      }
      if (results.length >= 8) break;
    }
    if (results.length >= 8) break;
  }

  return results;
}

async function searchViaApi(query: string, apiKey: string): Promise<YouTubeSearchResult[]> {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=8&q=${encodeURIComponent(query)}&key=${apiKey}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`YouTube API failed: ${response.status}`);
  }
  const data = await response.json();
  return (data.items || []).map((item: {
    id: { videoId: string };
    snippet: {
      title: string;
      channelTitle: string;
      thumbnails?: { high?: { url?: string }; default?: { url?: string } };
    };
  }) => ({
    videoId: item.id.videoId,
    title: item.snippet.title,
    artist: item.snippet.channelTitle,
    duration: "3:30",
    durationSeconds: 210,
    thumbnailUrl:
      item.snippet.thumbnails?.high?.url ||
      item.snippet.thumbnails?.default?.url ||
      `https://img.youtube.com/vi/${item.id.videoId}/hqdefault.jpg`,
  }));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() || "";

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
        return NextResponse.json({
          results: [
            {
              videoId: directId,
              title: oembed.title || `Video de YouTube (${directId})`,
              artist: oembed.author_name || "YouTube",
              duration: "3:45",
              durationSeconds: 225,
              thumbnailUrl:
                oembed.thumbnail_url ||
                `https://img.youtube.com/vi/${directId}/hqdefault.jpg`,
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
        },
      ],
    });
  }

  // 2. Search query via API or Scrape
  try {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (apiKey) {
      try {
        const apiResults = await searchViaApi(q, apiKey);
        if (apiResults.length > 0) {
          return NextResponse.json({ results: apiResults });
        }
      } catch {
        // Fall back to scrape
      }
    }

    const scrapeResults = await searchViaScrape(q);
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
      title: item.title,
      artist: item.artist,
      duration: item.duration,
      durationSeconds: 210,
      thumbnailUrl: "",
    })),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const q = typeof body.query === "string" ? body.query : "";
    const url = new URL(request.url);
    url.searchParams.set("q", q);
    return GET(new Request(url.toString(), { headers: request.headers }));
  } catch {
    return NextResponse.json({ results: [] });
  }
}
