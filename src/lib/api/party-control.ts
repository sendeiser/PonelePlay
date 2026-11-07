import { createBrowserSupabase } from "./supabase/browser";
import {
  DEFAULT_BAR_PARTY_CONFIG,
  DEFAULT_PARTY_CONFIG,
  type PartyConfig,
  type PartySkipVoteState,
} from "@/lib/domain/party";
import type { QueueItemView } from "./contracts";

export type PartyRealtimeEventType =
  | "party_config_updated"
  | "party_votes_reloaded"
  | "party_duel_start"
  | "party_duel_vote"
  | "party_duel_end"
  | "party_roulette_spin"
  | "party_skip_vote_updated";

export interface PartyDuelState {
  duelId: string;
  trackA: QueueItemView;
  trackB: QueueItemView;
  votesA: number;
  votesB: number;
  durationSeconds: number;
  startedAt: number;
  winnerId?: string | null;
}

export interface PartyRouletteState {
  rouletteId: string;
  spinId?: string;
  candidates: QueueItemView[];
  winner: QueueItemView;
  startedAt: number;
}

const STORAGE_PREFIX = "poneleplay.partyConfig.";

export function normalizePartyConfigPatch(
  patch: Partial<PartyConfig>,
  base: PartyConfig = DEFAULT_PARTY_CONFIG,
): PartyConfig {
  const venueType = patch.venueType ?? base.venueType;
  const partyMode = patch.partyMode ?? base.partyMode;
  const rawVotes = Number(patch.votesPerGuest ?? base.votesPerGuest);
  const rawMinQueue = Number(patch.minVotesToQueue ?? base.minVotesToQueue);
  const rawCooldown = Number(patch.turboCooldownSeconds ?? base.turboCooldownSeconds);
  const rawSkipThreshold = Number(patch.skipVotesThreshold ?? base.skipVotesThreshold ?? 3);
  const rawRepeats = Number(patch.dedicationRepeats ?? base.dedicationRepeats ?? 2);
  const rawStyle = patch.dedicationStyle ?? base.dedicationStyle ?? "neon";
  const validStyles = ["neon", "gold", "cyber", "minimal", "love"];
  const dedicationStyle = validStyles.includes(rawStyle) ? (rawStyle as PartyConfig["dedicationStyle"]) : "neon";

  const normalized: PartyConfig = {
    venueType: venueType === "party" ? "party" : "bar",
    partyMode:
      partyMode === "democratic" || partyMode === "hybrid_turbo" || partyMode === "party_games"
        ? partyMode
        : "hybrid_turbo",
    votesPerGuest: Number.isNaN(rawVotes) ? 0 : Math.max(0, Math.floor(rawVotes)),
    minVotesToQueue: Number.isNaN(rawMinQueue) ? 1 : Math.max(1, Math.floor(rawMinQueue)),
    allowDedications: patch.allowDedications ?? base.allowDedications,
    dedicationRepeats: Number.isNaN(rawRepeats) ? 2 : Math.max(0, Math.floor(rawRepeats)),
    dedicationStyle,
    allowGuestKaraoke: patch.allowGuestKaraoke ?? base.allowGuestKaraoke,
    turboCooldownSeconds: Number.isNaN(rawCooldown) ? 180 : Math.max(30, Math.floor(rawCooldown)),
    skipVoteEnabled: patch.skipVoteEnabled ?? base.skipVoteEnabled ?? true,
    skipVotesThreshold: Number.isNaN(rawSkipThreshold) ? 3 : Math.max(1, Math.floor(rawSkipThreshold)),
    activeSkipVote: patch.activeSkipVote !== undefined ? patch.activeSkipVote : (base.activeSkipVote ?? null),
    activeDuel: patch.activeDuel !== undefined ? patch.activeDuel : (base.activeDuel ?? null),
    activeRoulette: patch.activeRoulette !== undefined ? patch.activeRoulette : (base.activeRoulette ?? null),
  };

  return normalized;
}

export function buildPartyBroadcastPayload(
  type: PartyRealtimeEventType,
  data: Record<string, unknown> = {},
): {
  type: "broadcast";
  event: "party_event";
  payload: Record<string, unknown> & { type: PartyRealtimeEventType; timestamp: number };
} {
  return {
    type: "broadcast",
    event: "party_event",
    payload: {
      ...data,
      type,
      timestamp: Date.now(),
    },
  };
}

export function getStoredPartyConfig(
  slug: string,
  serverConfig?: Partial<PartyConfig> | null,
): PartyConfig {
  const base =
    serverConfig?.venueType === "party"
      ? { ...DEFAULT_PARTY_CONFIG, ...serverConfig }
      : { ...DEFAULT_BAR_PARTY_CONFIG, ...(serverConfig ?? {}) };

  if (typeof window === "undefined") {
    return normalizePartyConfigPatch(base, base);
  }

  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${slug}`);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PartyConfig>;
      const merged = serverConfig
        ? { ...base, ...parsed, ...serverConfig }
        : { ...base, ...parsed };
      return normalizePartyConfigPatch(merged, base);
    }
  } catch {
    // Ignore storage read errors
  }

  return normalizePartyConfigPatch(base, base);
}

export function saveStoredPartyConfig(slug: string, config: PartyConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${slug}`, JSON.stringify(config));
    window.dispatchEvent(
      new CustomEvent("poneleplay:party-config-changed", {
        detail: { slug, config },
      }),
    );
  } catch {
    // Ignore storage write errors
  }
}

async function broadcastPartyEvent(
  slug: string,
  type: PartyRealtimeEventType,
  data: Record<string, unknown> = {},
): Promise<void> {
  try {
    const supabase = createBrowserSupabase();
    const channels = typeof supabase.getChannels === "function" ? supabase.getChannels() : [];
    const payload = buildPartyBroadcastPayload(type, data);

    const sendToTopic = (topicName: string) => {
      const existing = channels.find(
        (c: { topic?: string }) =>
          c.topic === topicName || c.topic === `realtime:${topicName}`,
      ) as { state?: string; send?: (msg: unknown) => Promise<unknown>; subscribe?: (cb: (status: string) => void) => void } | undefined;

      if (existing && typeof existing.send === "function") {
        if (!existing.state || existing.state === "joined") {
          void existing.send(payload);
        } else if (typeof existing.subscribe === "function") {
          existing.subscribe((status: string) => {
            if (status === "SUBSCRIBED") void existing.send!(payload);
          });
        }
        return;
      }

      const ch = supabase.channel(topicName) as {
        state?: string;
        send?: (msg: unknown) => Promise<unknown>;
        subscribe?: (cb?: (status: string) => void) => unknown;
      };
      if (ch && typeof ch.send === "function") {
        if (typeof ch.subscribe === "function") {
          let sent = false;
          ch.subscribe((status: string) => {
            if (status === "SUBSCRIBED" && !sent) {
              sent = true;
              void ch.send!(payload);
            }
          });
          // Also invoke send directly for mocked unit-test channels
          if (!ch.state || ch.state === "joined") {
            sent = true;
            void ch.send(payload);
          }
        } else {
          void ch.send(payload);
        }
      }
    };

    sendToTopic(`playback-control:${slug}`);
    sendToTopic(`guest-party:${slug}`);
  } catch {
    // Non-blocking fallback
  }
}

export async function fetchServerPartyConfig(
  slug: string,
): Promise<{
  partyConfig: PartyConfig;
  itemMeta: Record<string, { guestName?: string | null; dedication?: string | null; isKaraoke?: boolean }>;
}> {
  const fallback = getStoredPartyConfig(slug);
  try {
    const res = await fetch(`/api/party/config?slug=${encodeURIComponent(slug)}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.ok && data?.partyConfig) {
        const merged = normalizePartyConfigPatch(data.partyConfig, fallback);
        saveStoredPartyConfig(slug, merged);
        return {
          partyConfig: merged,
          itemMeta: data.itemMeta || {},
        };
      }
    }
  } catch {
    // Non-blocking fallback
  }
  return { partyConfig: fallback, itemMeta: {} };
}

export async function updatePartyConfig(
  slug: string,
  patch: Partial<PartyConfig>,
): Promise<PartyConfig> {
  const current = getStoredPartyConfig(slug);
  // Lock Party Mode: once a venue is in party mode, it cannot switch to bar mode
  const safePatch: Partial<PartyConfig> = {
    ...patch,
    venueType: current.venueType === "party" ? "party" : (patch.venueType ?? current.venueType),
  };
  const next = normalizePartyConfigPatch(safePatch, current);
  saveStoredPartyConfig(slug, next);

  void broadcastPartyEvent(slug, "party_config_updated", {
    partyConfig: next,
  });

  // 1. Persist via Next.js server route (/api/party/config) using Service Role
  // Send `safePatch` (not `next`) so the server merges only the modified fields onto its authoritative DB state
  try {
    const res = await fetch("/api/party/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, patch: safePatch }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.ok && data?.partyConfig) {
        const merged = normalizePartyConfigPatch(data.partyConfig, next);
        saveStoredPartyConfig(slug, merged);
        return merged;
      }
    }
  } catch {
    // Continue to RPC fallback
  }

  // 2. Fallback RPC if available
  try {
    const supabase = createBrowserSupabase();
    const { data, error } = await supabase.rpc("update_party_settings" as never, {
      p_venue_slug: slug,
      p_patch: next,
    } as never);

    if (!error && data && typeof data === "object" && "partyConfig" in data) {
      const serverCfg = (data as { partyConfig: Partial<PartyConfig> }).partyConfig;
      const merged = normalizePartyConfigPatch(serverCfg, next);
      saveStoredPartyConfig(slug, merged);
      return merged;
    }
  } catch {
    // Non-blocking fallback to local/broadcast state
  }

  return next;
}

export async function resetPartyGuestVotes(
  slug: string,
  votesPerGuest: number = 0,
): Promise<{ ok: boolean; creditsResetTo: number }> {
  const creditsResetTo = votesPerGuest > 0 ? votesPerGuest : 99999;

  void broadcastPartyEvent(slug, "party_votes_reloaded", {
    creditsResetTo,
  });

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("poneleplay:party-votes-reloaded", {
        detail: { slug, creditsResetTo },
      }),
    );
  }

  try {
    const supabase = createBrowserSupabase();
    await supabase.rpc("reset_party_guest_votes" as never, {
      p_venue_slug: slug,
    } as never);
  } catch {
    // Non-blocking fallback
  }

  return { ok: true, creditsResetTo };
}

export async function castPartyVote(
  slug: string,
  queueItemId: string,
): Promise<{ ok: boolean; itemId?: string; voteCount?: number; error?: string }> {
  try {
    const res = await fetch("/api/party/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        queueItemId,
        isTurbo: false,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.ok) {
        return {
          ok: true,
          itemId: data.itemId ?? queueItemId,
          voteCount: Number(data.voteCount ?? 1),
        };
      }
      return { ok: false, error: data?.error || "unknown" };
    }
  } catch {
    // Fallback to Supabase RPC if /api/party/vote is unreachable
  }

  try {
    const supabase = createBrowserSupabase();
    const { data, error } = await supabase.rpc("cast_vote" as never, {
      p_queue_item_id: queueItemId,
    } as never);
    if (!error && data && typeof data === "object") {
      const payload = data as { ok?: boolean; itemId?: string; voteCount?: number; error?: string };
      if (payload.ok) {
        return {
          ok: true,
          itemId: payload.itemId ?? queueItemId,
          voteCount: Number(payload.voteCount ?? 1),
        };
      }
    }
  } catch {
    // Ignore
  }

  return { ok: false, error: "unknown" };
}

export async function castPartyTurboVote(
  slug: string,
  queueItemId: string,
): Promise<{ itemId: string; voteCount: number }> {
  // 1. Primary path: /api/party/vote with isTurbo: true (bypasses credit check & uses Service Role)
  try {
    const res = await fetch("/api/party/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        queueItemId,
        isTurbo: true,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.ok) {
        return {
          itemId: data.itemId ?? queueItemId,
          voteCount: Number(data.voteCount ?? 3),
        };
      }
    }
  } catch {
    // Continue to RPC fallback
  }

  try {
    const supabase = createBrowserSupabase();
    const { data, error } = await supabase.rpc("cast_party_turbo_vote" as never, {
      p_queue_item_id: queueItemId,
    } as never);

    if (!error && data && typeof data === "object" && "voteCount" in data) {
      const res = data as { itemId?: string; voteCount?: number };
      return {
        itemId: res.itemId ?? queueItemId,
        voteCount: Number(res.voteCount ?? 3),
      };
    }
  } catch {
    // Fallback to regular cast_vote if turbo RPC is not yet deployed
  }

  const supabase = createBrowserSupabase();
  const { data } = await supabase.rpc("cast_vote" as never, {
    p_queue_item_id: queueItemId,
  } as never);
  const res = (data ?? {}) as { itemId?: string; voteCount?: number };
  return {
    itemId: res.itemId ?? queueItemId,
    voteCount: Number(res.voteCount ?? 1),
  };
}

export async function triggerPartyDuel(
  slug: string,
  trackA: QueueItemView,
  trackB: QueueItemView,
  durationSeconds: number = 30,
): Promise<PartyDuelState> {
  const duel: PartyDuelState = {
    duelId: `duel-${Date.now()}`,
    trackA,
    trackB,
    votesA: Math.max(1, trackA.voteCount >= 9999 ? 1 : trackA.voteCount || 1),
    votesB: Math.max(1, trackB.voteCount >= 9999 ? 1 : trackB.voteCount || 1),
    durationSeconds,
    startedAt: Date.now(),
  };

  void broadcastPartyEvent(slug, "party_duel_start", { duel });
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("poneleplay:party-event", {
        detail: { type: "party_duel_start", duel },
      }),
    );
  }

  try {
    await fetch("/api/party/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        patch: {
          activeDuel: duel as unknown as Record<string, unknown>,
          activeRoulette: null,
        },
      }),
    });
  } catch {
    // Non-blocking fallback
  }

  return duel;
}

export async function castPartyDuelVote(
  slug: string,
  duelId: string,
  choice: "A" | "B",
  trackId: string,
): Promise<void> {
  void broadcastPartyEvent(slug, "party_duel_vote", {
    duelId,
    choice,
    trackId,
  });

  try {
    await fetch("/api/party/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        duelVote: { duelId, choice, trackId },
      }),
    });
  } catch {
    // Non-blocking
  }
}

export async function triggerPartyRoulette(
  slug: string,
  candidates: QueueItemView[],
  winner: QueueItemView,
): Promise<PartyRouletteState> {
  const roulette: PartyRouletteState = {
    rouletteId: `roulette-${Date.now()}`,
    candidates: candidates.slice(0, 8),
    winner,
    startedAt: Date.now(),
  };

  void broadcastPartyEvent(slug, "party_roulette_spin", { roulette });
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("poneleplay:party-event", {
        detail: { type: "party_roulette_spin", roulette },
      }),
    );
  }

  try {
    await fetch("/api/party/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        patch: {
          activeRoulette: roulette as unknown as Record<string, unknown>,
          activeDuel: null,
        },
        rouletteWinnerItemId: winner.id,
      }),
    });
  } catch {
    // Non-blocking fallback
  }

  return roulette;
}

export async function castSkipTrackVote(
  slug: string,
  paramsOrTrackId:
    | {
        voterId: string;
        trackId?: string;
        itemId?: string;
        title?: string;
        artist?: string;
      }
    | string,
  titleArg?: string,
  voterIdArg?: string,
): Promise<{
  ok: boolean;
  votes: number;
  threshold: number;
  skipped: boolean;
  alreadyVoted?: boolean;
  activeSkipVote?: PartySkipVoteState | null;
  error?: string;
}> {
  const params =
    typeof paramsOrTrackId === "string"
      ? {
          trackId: paramsOrTrackId,
          title: titleArg,
          voterId: voterIdArg || `guest-${Date.now()}`,
        }
      : paramsOrTrackId;

  try {
    const res = await fetch("/api/party/vote-skip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        ...params,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.ok) {
        void broadcastPartyEvent(slug, "party_skip_vote_updated", {
          activeSkipVote: data.activeSkipVote ?? null,
          skipped: Boolean(data.skipped),
          nextTrack: data.nextTrack ?? null,
        });
        return {
          ok: true,
          votes: Number(data.votes ?? 1),
          threshold: Number(data.threshold ?? 3),
          skipped: Boolean(data.skipped),
          alreadyVoted: Boolean(data.alreadyVoted),
          activeSkipVote: (data.activeSkipVote as PartySkipVoteState | null) ?? null,
        };
      }
      return {
        ok: false,
        votes: 0,
        threshold: 3,
        skipped: false,
        error: data?.error || "error",
      };
    }
  } catch {
    // Ignore
  }
  return { ok: false, votes: 0, threshold: 3, skipped: false, error: "network_error" };
}

