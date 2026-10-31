export const ALLOWED_HOSTS = [
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
] as const;

export type YoutubeMeta = {
  videoId: string;
  title: string;
  channelTitle: string;
  durationSeconds: number;
  thumbnailUrl: string;
  embeddable: boolean;
  isLive: boolean;
};

export function parseYoutubeVideoId(input: string): string | null {
  try {
    const url = new URL(input);
    const host = url.hostname;
    if ((url.protocol !== "https:" && url.protocol !== "http:") || !ALLOWED_HOSTS.includes(host as typeof ALLOWED_HOSTS[number])) {
      return null;
    }
    if (host === "youtu.be") {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length !== 1) return null;
      const id = parts[0];
      if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return id;
      return null;
    }
    if (url.pathname.startsWith("/shorts/")) {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length !== 2 || parts[0] !== "shorts") return null;
      const id = parts[1];
      if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return id;
      return null;
    }
    if (url.pathname === "/watch") {
      const v = url.searchParams.get("v");
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

export function youtubeDedupeKey(videoId: string): string {
  return `yt:${videoId}`;
}

export function validateYoutubeMeta(
  meta: YoutubeMeta,
  maxDurationSeconds: number,
): "live" | "not_embeddable" | "too_long" | null {
  if (meta.isLive) return "live";
  if (!meta.embeddable) return "not_embeddable";
  if (meta.durationSeconds > maxDurationSeconds) return "too_long";
  return null;
}
