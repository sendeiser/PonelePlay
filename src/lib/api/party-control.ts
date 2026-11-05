import { createBrowserSupabase } from "./supabase/browser";
import {
  DEFAULT_BAR_PARTY_CONFIG,
  DEFAULT_PARTY_CONFIG,
  type PartyConfig,
} from "@/lib/domain/party";
import type { QueueItemView } from "./contracts";

export type PartyRealtimeEventType =
  | "party_config_updated"
  | "party_votes_reloaded"
  | "party_duel_start"
  | "party_duel_vote"
  | "party_duel_end"
  | "party_roulette_spin";

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

  return {
    venueType: venueType === "party" ? "party" : "bar",
    partyMode:
      partyMode === "democratic" || partyMode === "hybrid_turbo" || partyMode === "party_games"
        ? partyMode
        : "hybrid_turbo",
    votesPerGuest: Number.isNaN(rawVotes) ? 0 : Math.max(0, Math.floor(rawVotes)),
    minVotesToQueue: Number.isNaN(rawMinQueue) ? 1 : Math.max(1, Math.floor(rawMinQueue)),
    allowDedications: patch.allowDedications ?? base.allowDedications,
    allowGuestKaraoke: patch.allowGuestKaraoke ?? base.allowGuestKaraoke,
    turboCooldownSeconds: Number.isNaN(rawCooldown) ? 180 : Math.max(30, Math.floor(rawCooldown)),
  };
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
      return normalizePartyConfigPatch({ ...base, ...parsed }, base);
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
    const existing = channels.find(
      (c: { topic?: string }) =>
        c.topic === `playback-control:${slug}` ||
        c.topic === `realtime:playback-control:${slug}`,
    );
    const channel = existing ?? supabase.channel(`playback-control:${slug}`);
    if (channel && typeof channel.send === "function") {
      await channel.send(buildPartyBroadcastPayload(type, data));
    }
  } catch {
    // Non-blocking fallback
  }
}

export async function updatePartyConfig(
  slug: string,
  patch: Partial<PartyConfig>,
): Promise<PartyConfig> {
  const current = getStoredPartyConfig(slug);
  const next = normalizePartyConfigPatch(patch, current);
  saveStoredPartyConfig(slug, next);

  void broadcastPartyEvent(slug, "party_config_updated", {
    partyConfig: next,
  });

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

export async function castPartyTurboVote(
  slug: string,
  queueItemId: string,
): Promise<{ itemId: string; voteCount: number }> {
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
    votesA: 1,
    votesB: 1,
    durationSeconds,
    startedAt: Date.now(),
  };

  await broadcastPartyEvent(slug, "party_duel_start", { duel });
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("poneleplay:party-event", {
        detail: { type: "party_duel_start", duel },
      }),
    );
  }
  return duel;
}

export async function castPartyDuelVote(
  slug: string,
  duelId: string,
  choice: "A" | "B",
  trackId: string,
): Promise<void> {
  await broadcastPartyEvent(slug, "party_duel_vote", {
    duelId,
    choice,
    trackId,
  });
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

  await broadcastPartyEvent(slug, "party_roulette_spin", { roulette });
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("poneleplay:party-event", {
        detail: { type: "party_roulette_spin", roulette },
      }),
    );
  }
  return roulette;
}

