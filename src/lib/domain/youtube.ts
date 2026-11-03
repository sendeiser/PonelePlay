export const ALLOWED_HOSTS = [
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
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

export function parseYoutubePlaylistId(input: string): string | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();

  // 1. Direct ID format (e.g. PL..., OLAK5uy_..., RD..., UU..., FL...)
  if (/^(PL|OLAK5uy_|UU|FL|RD|TL|LL)[A-Za-z0-9_-]{8,}$/.test(trimmed)) {
    return trimmed;
  }

  // 2. Standard URL parsing
  try {
    const rawUrl = trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, "");
    if (host === "youtube.com" || host === "youtu.be") {
      const list = url.searchParams.get("list");
      if (list && /^[A-Za-z0-9_-]{8,}$/.test(list)) {
        return list;
      }
    }
  } catch {
    // Ignore URL parse error and fallback to regex below
  }

  // 3. Fallback regex search for 'list=' in query string or fragment
  const match = trimmed.match(/[?&]list=([A-Za-z0-9_-]{8,})/);
  if (match && match[1]) {
    return match[1];
  }

  return null;
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
