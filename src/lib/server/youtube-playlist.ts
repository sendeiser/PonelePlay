import { parseYoutubePlaylistId } from "@/lib/domain/youtube";

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

export interface YouTubePlaylistPayload {
  id: string;
  title: string;
  author: string;
  trackCount: number;
  thumbnailUrl?: string;
  tracks: YouTubeSearchResult[];
}

interface CacheEntry {
  timestamp: number;
  data: YouTubePlaylistPayload;
}

const playlistServerCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache

export function parseDurationString(str?: string): number {
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

function extractTracksFromYtData(data: Record<string, unknown>, authorDefault: string): YouTubeSearchResult[] {
  const tracks: YouTubeSearchResult[] = [];
  const seenIds = new Set<string>();

  function visit(node: unknown) {
    if (!node || typeof node !== "object") return;

    const record = node as Record<string, unknown>;

    // 1. lockupViewModel format (Modern YouTube web layout)
    if (record.lockupViewModel && typeof record.lockupViewModel === "object") {
      const lvm = record.lockupViewModel as Record<string, unknown>;
      const videoId = typeof lvm.contentId === "string" ? lvm.contentId : null;
      if (videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId) && !seenIds.has(videoId)) {
        const metadataWrapper = lvm.metadata as Record<string, unknown> | undefined;
        const lockupMeta = metadataWrapper?.lockupMetadataViewModel as Record<string, unknown> | undefined;
        const titleContent = lockupMeta?.title as Record<string, unknown> | undefined;
        const title = typeof titleContent?.content === "string" ? titleContent.content.trim() : "";

        const contentMetaWrapper = lockupMeta?.metadata as Record<string, unknown> | undefined;
        const contentMetadataViewModel = contentMetaWrapper?.contentMetadataViewModel as Record<string, unknown> | undefined;
        const metaRows = contentMetadataViewModel?.metadataRows as Array<Record<string, unknown>> | undefined;
        const metaParts = metaRows?.[0]?.metadataParts as Array<Record<string, unknown>> | undefined;
        const textWrapper = metaParts?.[0]?.text as Record<string, unknown> | undefined;
        const artist = typeof textWrapper?.content === "string" ? textWrapper.content.trim() : authorDefault;

        const contentImage = lvm.contentImage as Record<string, unknown> | undefined;
        const thumbViewModel = contentImage?.thumbnailViewModel as Record<string, unknown> | undefined;
        const overlays = thumbViewModel?.overlays as Array<Record<string, unknown>> | undefined;
        const bottomOverlay = overlays?.[0]?.thumbnailBottomOverlayViewModel as Record<string, unknown> | undefined;
        const badges = bottomOverlay?.badges as Array<Record<string, unknown>> | undefined;
        const badgeViewModel = badges?.[0]?.thumbnailBadgeViewModel as Record<string, unknown> | undefined;
        const duration = typeof badgeViewModel?.text === "string" ? badgeViewModel.text : "3:30";

        const image = thumbViewModel?.image as Record<string, unknown> | undefined;
        const sources = image?.sources as Array<{ url?: string }> | undefined;
        const thumb = sources?.slice(-1)[0]?.url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

        const lowerTitle = title.toLowerCase();
        if (title && !lowerTitle.includes("[video eliminado]") && !lowerTitle.includes("[deleted video]") && !lowerTitle.includes("[private video]")) {
          seenIds.add(videoId);
          tracks.push({
            videoId,
            title,
            artist: artist || authorDefault,
            duration,
            durationSeconds: parseDurationString(duration),
            thumbnailUrl: thumb,
          });
        }
      }
    }

    // 2. playlistVideoRenderer format (Classic YouTube layout)
    if (record.playlistVideoRenderer && typeof record.playlistVideoRenderer === "object") {
      const pvr = record.playlistVideoRenderer as Record<string, unknown>;
      const videoId = typeof pvr.videoId === "string" ? pvr.videoId : null;
      if (videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId) && !seenIds.has(videoId)) {
        const titleObj = pvr.title as Record<string, unknown> | undefined;
        const runs = titleObj?.runs as Array<{ text?: string }> | undefined;
        const title = (runs?.[0]?.text || (typeof titleObj?.simpleText === "string" ? titleObj.simpleText : "")).trim();

        const byline = pvr.shortBylineText as Record<string, unknown> | undefined;
        const bylineRuns = byline?.runs as Array<{ text?: string }> | undefined;
        const artist = bylineRuns?.[0]?.text || authorDefault;

        const lengthObj = pvr.lengthText as Record<string, unknown> | undefined;
        const duration = typeof lengthObj?.simpleText === "string" ? lengthObj.simpleText : "3:30";

        const thumbObj = pvr.thumbnail as Record<string, unknown> | undefined;
        const thumbs = thumbObj?.thumbnails as Array<{ url?: string }> | undefined;
        const thumb = thumbs?.slice(-1)[0]?.url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

        const lowerTitle = title.toLowerCase();
        if (title && !lowerTitle.includes("[video eliminado]") && !lowerTitle.includes("[deleted video]") && !lowerTitle.includes("[private video]")) {
          seenIds.add(videoId);
          tracks.push({
            videoId,
            title,
            artist: artist || authorDefault,
            duration,
            durationSeconds: parseDurationString(duration),
            thumbnailUrl: thumb,
          });
        }
      }
    }

    // Recurse child nodes
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
    } else {
      for (const key of Object.keys(record)) {
        visit(record[key]);
      }
    }
  }

  visit(data);
  return tracks;
}

export async function fetchYouTubePlaylistServer(playlistIdOrUrl: string): Promise<YouTubePlaylistPayload | null> {
  const playlistId = parseYoutubePlaylistId(playlistIdOrUrl) || playlistIdOrUrl.trim();
  if (!playlistId) return null;

  const cached = playlistServerCache.get(playlistId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  // Optional: Try official YouTube Data API if key present
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (apiKey) {
    try {
      const plMetaUrl = `https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&id=${playlistId}&key=${apiKey}`;
      const plMetaRes = await fetch(plMetaUrl);
      if (plMetaRes.ok) {
        const plMeta = await plMetaRes.json();
        const plItem = plMeta.items?.[0];
        if (plItem) {
          const title = plItem.snippet?.title || "Lista de YouTube";
          const author = plItem.snippet?.channelTitle || "YouTube";
          const totalCount = Number(plItem.contentDetails?.itemCount || 0);
          const thumb = plItem.snippet?.thumbnails?.high?.url || plItem.snippet?.thumbnails?.default?.url;

          // Fetch items up to 50
          const itemsUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${apiKey}`;
          const itemsRes = await fetch(itemsUrl);
          if (itemsRes.ok) {
            const itemsData = await itemsRes.json();
            const tracks: YouTubeSearchResult[] = [];
            for (const it of itemsData.items || []) {
              const vId = it.snippet?.resourceId?.videoId;
              const vTitle = it.snippet?.title;
              if (vId && vTitle && !vTitle.includes("Deleted video") && !vTitle.includes("Private video")) {
                tracks.push({
                  videoId: vId,
                  title: vTitle,
                  artist: it.snippet?.videoOwnerChannelTitle || author,
                  duration: "3:30",
                  durationSeconds: 210,
                  thumbnailUrl: it.snippet?.thumbnails?.high?.url || it.snippet?.thumbnails?.default?.url || `https://img.youtube.com/vi/${vId}/hqdefault.jpg`,
                });
              }
            }
            if (tracks.length > 0) {
              const result: YouTubePlaylistPayload = {
                id: playlistId,
                title,
                author,
                trackCount: totalCount || tracks.length,
                thumbnailUrl: thumb,
                tracks,
              };
              playlistServerCache.set(playlistId, { timestamp: Date.now(), data: result });
              return result;
            }
          }
        }
      }
    } catch {
      // Fallback to scrape below
    }
  }

  // Scrape YouTube playlist page
  try {
    const url = `https://www.youtube.com/playlist?list=${playlistId}&hl=es`;
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
      },
      next: { revalidate: 120 },
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const match =
      html.match(/var ytInitialData = ({[\s\S]*?});<\/script>/) ||
      html.match(/ytInitialData\s*=\s*({[\s\S]+?});/);

    if (!match) return null;

    const data: Record<string, unknown> = JSON.parse(match[1]);

    // Check for error alert (e.g. non-existent or private playlist)
    const alerts = data.alerts as Array<Record<string, unknown>> | undefined;
    if (alerts && alerts.length > 0) {
      const errorAlert = alerts.find(a => (a.alertRenderer as Record<string, unknown>)?.type === "ERROR");
      if (errorAlert) return null;
    }

    // Extract playlist title
    const metaRenderer = (data.metadata as Record<string, unknown> | undefined)?.playlistMetadataRenderer as Record<string, unknown> | undefined;
    const microformat = (data.microformat as Record<string, unknown> | undefined)?.microformatDataRenderer as Record<string, unknown> | undefined;
    const headerTitle = (data.header as Record<string, unknown> | undefined)?.pageHeaderRenderer as Record<string, unknown> | undefined;

    let playlistTitle =
      (typeof metaRenderer?.title === "string" ? metaRenderer.title : "") ||
      (typeof microformat?.title === "string" ? microformat.title : "") ||
      (typeof headerTitle?.pageTitle === "string" ? headerTitle.pageTitle : "");

    if (!playlistTitle) {
      const tagMatch = html.match(/<title>(.*?)<\/title>/);
      if (tagMatch && tagMatch[1]) {
        playlistTitle = tagMatch[1].replace(/ - YouTube$/, "").trim();
      }
    }
    if (!playlistTitle) playlistTitle = "Lista de Reproducción de YouTube";

    // Extract author
    const sidebar = data.sidebar as Record<string, unknown> | undefined;
    const sidebarRenderer = sidebar?.playlistSidebarRenderer as Record<string, unknown> | undefined;
    const sidebarItems = sidebarRenderer?.items as Array<Record<string, unknown>> | undefined;
    const secondaryInfo = sidebarItems?.[1]?.playlistSidebarSecondaryInfoRenderer as Record<string, unknown> | undefined;
    const videoOwner = secondaryInfo?.videoOwner as Record<string, unknown> | undefined;
    const ownerRenderer = videoOwner?.videoOwnerRenderer as Record<string, unknown> | undefined;
    const ownerRuns = (ownerRenderer?.title as Record<string, unknown> | undefined)?.runs as Array<{ text?: string }> | undefined;
    const author = ownerRuns?.[0]?.text?.replace(/^de\s+/i, "") || "YouTube";

    // Extract thumbnail
    const thumbUrl = (microformat?.thumbnail as Record<string, unknown> | undefined)?.thumbnails as Array<{ url?: string }> | undefined;
    const playlistThumb = thumbUrl?.slice(-1)[0]?.url;

    // Extract tracks recursively
    const tracks = extractTracksFromYtData(data, author);

    if (tracks.length === 0) {
      return null;
    }

    const result: YouTubePlaylistPayload = {
      id: playlistId,
      title: playlistTitle,
      author,
      trackCount: tracks.length,
      thumbnailUrl: playlistThumb || tracks[0]?.thumbnailUrl,
      tracks,
    };

    playlistServerCache.set(playlistId, { timestamp: Date.now(), data: result });
    return result;
  } catch {
    return null;
  }
}

