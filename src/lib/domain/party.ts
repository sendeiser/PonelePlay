import { MIN_VOTES_FOR_QUEUE } from "./queue";

export type VenueType = "bar" | "party";

export type PartyMode = "democratic" | "hybrid_turbo" | "party_games";

export type PartyConfig = {
  venueType: VenueType;
  partyMode: PartyMode;
  /** 0 = unlimited votes per guest; > 0 = max votes per guest in democratic mode */
  votesPerGuest: number;
  /** Minimum votes required for a song to enter the active queue (default 1 = direct to queue) */
  minVotesToQueue: number;
  allowDedications: boolean;
  allowGuestKaraoke: boolean;
  turboCooldownSeconds: number;
};

export const DEFAULT_PARTY_CONFIG: PartyConfig = {
  venueType: "party",
  partyMode: "hybrid_turbo",
  votesPerGuest: 0,
  minVotesToQueue: 1,
  allowDedications: true,
  allowGuestKaraoke: true,
  turboCooldownSeconds: 180,
};

export const DEFAULT_BAR_PARTY_CONFIG: PartyConfig = {
  venueType: "bar",
  partyMode: "democratic",
  votesPerGuest: 0,
  minVotesToQueue: MIN_VOTES_FOR_QUEUE,
  allowDedications: false,
  allowGuestKaraoke: false,
  turboCooldownSeconds: 180,
};

/**
 * Resolves the effective vote threshold needed for a song to enter the active queue.
 * - Bar mode: always MIN_VOTES_FOR_QUEUE (5)
 * - Party mode: defaults to 1 (direct to queue), or custom minVotesToQueue configured by admin
 */
export function resolveEffectiveQueueThreshold(
  config?: Partial<PartyConfig> | null,
): number {
  if (!config || config.venueType !== "party") {
    return MIN_VOTES_FOR_QUEUE;
  }
  const custom = Number(config.minVotesToQueue ?? 1);
  if (Number.isNaN(custom) || custom < 1) {
    return 1;
  }
  return Math.floor(custom);
}

/**
 * Checks whether a guest can cast a regular vote in Party Mode.
 * In Democratic mode, if votesPerGuest > 0, enforces the guest's remaining vote quota.
 */
export function canGuestCastVote(
  config: Partial<PartyConfig> | null | undefined,
  guestVotesRemaining: number,
): { allowed: boolean; reason?: string } {
  if (!config || config.venueType !== "party") {
    return { allowed: true };
  }
  const limit = Number(config.votesPerGuest ?? 0);
  if (config.partyMode === "democratic" && limit > 0 && guestVotesRemaining <= 0) {
    return {
      allowed: false,
      reason: "Usaste todos tus votos disponibles. Pedile al anfitrión que recargue los votos.",
    };
  }
  return { allowed: true };
}

/**
 * Trims and normalizes a guest dedication string (max 90 chars).
 * Returns null if empty or whitespace-only.
 */
export function sanitizeDedication(text?: string | null): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 90);
}
