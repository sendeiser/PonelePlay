interface CacheEntry<T> {
  value: T;
  expiresAtMs: number;
}

const tvFeedCache = new Map<string, CacheEntry<unknown>>();
const partyConfigCache = new Map<string, CacheEntry<unknown>>();

const TV_FEED_TTL_MS = 2500;
const PARTY_CONFIG_TTL_MS = 4000;

export function getCachedTvFeed<T>(slug: string): T | null {
  const entry = tvFeedCache.get(slug);
  if (!entry) return null;
  if (Date.now() > entry.expiresAtMs) {
    tvFeedCache.delete(slug);
    return null;
  }
  return entry.value as T;
}

export function setCachedTvFeed<T>(slug: string, value: T, ttlMs = TV_FEED_TTL_MS): void {
  tvFeedCache.set(slug, { value, expiresAtMs: Date.now() + ttlMs });
}

export function getCachedPartyConfig<T>(slug: string): T | null {
  const entry = partyConfigCache.get(slug);
  if (!entry) return null;
  if (Date.now() > entry.expiresAtMs) {
    partyConfigCache.delete(slug);
    return null;
  }
  return entry.value as T;
}

export function setCachedPartyConfig<T>(
  slug: string,
  value: T,
  ttlMs = PARTY_CONFIG_TTL_MS,
): void {
  partyConfigCache.set(slug, { value, expiresAtMs: Date.now() + ttlMs });
}

export function invalidateVenueSyncCache(slug: string): void {
  if (!slug) return;
  tvFeedCache.delete(slug);
  const prefix = `${slug}:`;
  for (const key of tvFeedCache.keys()) {
    if (key.startsWith(prefix)) {
      tvFeedCache.delete(key);
    }
  }
  partyConfigCache.delete(slug);
}

export interface CloudRoomNotifyOptions {
  tvFeed?: Record<string, unknown> | null;
  partyEvent?: Record<string, unknown> | null;
  refreshFromOrigin?: boolean;
}

/**
 * Invalidates warm API caches for the venue and notifies the Cloudflare Durable Object
 * so all connected TVs, Cabina, LAN Hub, and mobile guests refresh via push without DB polling.
 */
export async function notifySyncRoom(
  slug: string,
  options: CloudRoomNotifyOptions = {},
): Promise<void> {
  if (!slug) return;
  invalidateVenueSyncCache(slug);

  const rawBase =
    process.env.SYNC_HTTP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SYNC_WS_URL?.trim()
      ?.replace(/^wss:/i, "https:")
      .replace(/^ws:/i, "http:") ||
    (process.env.NODE_ENV === "production"
      ? "https://poneleplay-sync.martinsgons709.workers.dev"
      : "");

  if (!rawBase) return;

  const baseUrl = rawBase.replace(/\/+$/, "");
  const secret = process.env.SYNC_SHARED_SECRET?.trim();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (secret) {
    headers.Authorization = `Bearer ${secret}`;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1800);
    await fetch(`${baseUrl}/internal/room/${encodeURIComponent(slug)}/notify`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        tvFeed: options.tvFeed ?? null,
        partyEvent: options.partyEvent ?? null,
        refreshFromOrigin: options.refreshFromOrigin ?? true,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
  } catch {
    // Non-blocking notification
  }
}
