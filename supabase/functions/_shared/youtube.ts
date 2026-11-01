export interface YoutubeSearchItem {
  videoId: string;
  title: string;
  channelTitle: string;
  durationSeconds: number;
  thumbnailUrl: string;
  embeddable: boolean;
  isLive: boolean;
}

export function buildYoutubeCacheKey(
  query: string,
  region: string,
  maxResults: number,
): string {
  const normalizedQuery = query.trim().toLowerCase().replace(/\s+/g, " ");
  const normalizedRegion = region.trim().toLowerCase();
  return `${normalizedQuery}|${normalizedRegion}|${maxResults}`;
}

export function filterYoutubeResults(
  items: YoutubeSearchItem[],
  maxDurationSeconds: number,
): YoutubeSearchItem[] {
  return items.filter(
    (item) =>
      !item.isLive &&
      item.embeddable &&
      item.durationSeconds <= maxDurationSeconds,
  );
}

