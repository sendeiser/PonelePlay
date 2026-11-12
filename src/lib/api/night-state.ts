import { createBrowserSupabase } from "./supabase/browser";
import { nightStateSchema, type NightState } from "./contracts";
import type { NightStateSource } from "@/hooks/use-night-state";
import { partitionQueueAndProposals } from "@/lib/domain/queue";
import { resolveEffectiveQueueThreshold } from "@/lib/domain/party";
import type { SyncRole } from "@/lib/sync/protocol";
import { acquireSyncClient, releaseSyncClient } from "@/lib/sync/client";

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
            {
              guestName?: string | null;
              dedication?: string | null;
              isKaraoke?: boolean;
              isGuestProposal?: boolean;
            }
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
              isGuestProposal?: boolean;
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
              isGuestProposal: item.isGuestProposal ?? meta.isGuestProposal ?? false,
            };
          };

          const enrichedQueue = parsed.queue.map(enrichItem);
          const enrichedCandidates = (parsed.candidates ?? []).map(enrichItem);
          const effectiveThreshold = resolveEffectiveQueueThreshold(partyConfig);
          const { activeQueue, candidateProposals } = partitionQueueAndProposals(
            enrichedQueue,
            enrichedCandidates,
            effectiveThreshold,
          );

          return {
            ...parsed,
            partyConfig,
            settings: {
              ...parsed.settings,
              partyConfig,
            },
            nowPlaying: parsed.nowPlaying ? enrichItem(parsed.nowPlaying) : null,
            queue: activeQueue,
            candidates: candidateProposals,
          };
        }
      }
    }
  } catch {
    // Non-blocking fallback if /api/party/config is unavailable
  }

  return parsed;
}

export function createNightStateSource(
  slug: string,
  role: SyncRole = "client",
): NightStateSource {
  let activeClient: ReturnType<typeof acquireSyncClient> | null = null;
  let lastNotifiedRevision: number | null = null;

  return {
    fetch: () => fetchNightState(slug),
    isPushConnected: () => Boolean(activeClient?.isConnected()),
    onTransportChange: (cb: (connected: boolean) => void) => {
      const probe = acquireSyncClient({ slug, role });
      if (!probe.hasTargetsConfigured()) {
        releaseSyncClient(probe);
        cb(false);
        return () => {};
      }
      const unsub = probe.onStatus((status) => cb(status.connected));
      return () => {
        unsub();
        releaseSyncClient(probe);
      };
    },
    subscribe: (onChange: () => void) => {
      const syncClient = acquireSyncClient({ slug, role });
      activeClient = syncClient;

      if (syncClient.hasTargetsConfigured()) {
        const unsubSnapshot = syncClient.on("room:snapshot", ({ snapshot }) => {
          if (lastNotifiedRevision === null) {
            lastNotifiedRevision = snapshot.revision;
            if (snapshot.revision > 0) {
              onChange();
            }
            return;
          }
          if (snapshot.revision !== lastNotifiedRevision) {
            lastNotifiedRevision = snapshot.revision;
            onChange();
          }
        });

        const unsubParty = syncClient.on("party:event", ({ payload }) => {
          const type = typeof payload?.type === "string" ? payload.type : "";
          if (
            type === "party_config_updated" ||
            type === "party_skip_vote_updated" ||
            type === "party_skip_vote_passed" ||
            type === "party_roulette_spin" ||
            type === "party_duel_start" ||
            type === "live_dedication"
          ) {
            onChange();
          }
        });

        return () => {
          unsubSnapshot();
          unsubParty();
          releaseSyncClient(syncClient);
          if (activeClient === syncClient) {
            activeClient = null;
          }
        };
      }

      releaseSyncClient(syncClient);
      activeClient = null;

      // Offline/legacy fallback: subscribe to Supabase Postgres changes only when no WS sync engine is configured
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
