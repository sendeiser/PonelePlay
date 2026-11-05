import { createBrowserSupabase } from "./supabase/browser";
import { nightStateSchema, type NightState } from "./contracts";
import type { NightStateSource } from "@/hooks/use-night-state";

export async function fetchNightState(slug: string): Promise<NightState> {
  const supabase = createBrowserSupabase();

  const { data, error } = await supabase.rpc("get_night_state" as never, {
    p_venue_slug: slug,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  const parsed = nightStateSchema.parse(data);

  // Enrich with server PartyConfig & guest metadata if available
  try {
    if (typeof fetch === "function") {
      const res = await fetch(`/api/party/config?slug=${encodeURIComponent(slug)}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const partyRes = await res.json();
        if (partyRes?.ok && partyRes?.partyConfig) {
          const partyConfig = partyRes.partyConfig;
          const itemMeta = (partyRes.itemMeta || {}) as Record<
            string,
            { guestName?: string | null; dedication?: string | null; isKaraoke?: boolean }
          >;

          const enrichItem = <
            T extends {
              id: string;
              trackId?: string;
              title?: string;
              youtubeVideoId?: string | null;
              guestName?: string | null;
              dedication?: string | null;
              isKaraoke?: boolean;
            },
          >(
            item: T,
          ): T => {
            const meta =
              itemMeta[item.id] ||
              (item.trackId ? itemMeta[item.trackId] : undefined) ||
              (item.youtubeVideoId ? itemMeta[`yt:${item.youtubeVideoId}`] : undefined) ||
              (item.title ? itemMeta[`title:${item.title.toLowerCase()}`] : undefined);
            if (!meta) return item;
            return {
              ...item,
              guestName: item.guestName ?? meta.guestName ?? null,
              dedication: item.dedication ?? meta.dedication ?? null,
              isKaraoke: item.isKaraoke ?? meta.isKaraoke ?? false,
            };
          };

          return {
            ...parsed,
            partyConfig,
            settings: {
              ...parsed.settings,
              partyConfig,
            },
            nowPlaying: parsed.nowPlaying ? enrichItem(parsed.nowPlaying) : null,
            queue: parsed.queue.map(enrichItem),
            candidates: (parsed.candidates ?? []).map(enrichItem),
          };
        }
      }
    }
  } catch {
    // Non-blocking fallback if /api/party/config is unavailable
  }

  return parsed;
}

export function createNightStateSource(slug: string): NightStateSource {
  return {
    fetch: () => fetchNightState(slug),
    subscribe: (onChange: () => void) => {
      const supabase = createBrowserSupabase();
      const instanceId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2, 9);

      const channel = supabase
        .channel(`night-state:${slug}:${instanceId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "queue_items" },
          () => onChange(),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "night_sessions" },
          () => onChange(),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "votes" },
          () => onChange(),
        )
        .subscribe();

      return () => {
        void supabase.removeChannel(channel);
      };
    },
  };
}
