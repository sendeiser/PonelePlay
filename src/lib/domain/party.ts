import { MIN_VOTES_FOR_QUEUE } from "./queue";

export type VenueType = "bar" | "party";

export type PartyMode = "democratic" | "hybrid_turbo" | "party_games";

export type PartySkipVoteState = {
  trackId: string;
  itemId?: string;
  videoId?: string;
  title: string;
  artist?: string;
  voterIds?: string[];
  voters?: string[];
  votes: number;
  votesCount?: number;
  threshold: number;
  startedAt: number | string;
};

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
  /** Allow guests to start a vote to skip the currently playing song */
  skipVoteEnabled?: boolean;
  /** Votes required to automatically skip the currently playing song (default 3) */
  skipVotesThreshold?: number;
  activeSkipVote?: PartySkipVoteState | null;
  activeDuel?: Record<string, unknown> | null;
  activeRoulette?: Record<string, unknown> | null;
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
  allowDedications: true,
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

/** Max lifetime of a vote-to-skip poll before it is considered stale. */
export const SKIP_VOTE_MAX_AGE_MS = 15 * 60 * 1000;

/**
 * Returns the normalized vote-to-skip state ONLY if it still belongs to the
 * track that is currently playing (and is not stale). Once the song changes
 * (skipped by votes, by the DJ or because it ended) this returns null so the
 * badge disappears from every screen.
 */
export function resolveActiveSkipVoteForTrack(
  vote: PartySkipVoteState | null | undefined,
  currentTrack: Record<string, unknown> | null | undefined,
  now: number = Date.now(),
): PartySkipVoteState | null {
  if (!vote || typeof vote !== "object") return null;
  if (!currentTrack) return null;

  const startedMs =
    typeof vote.startedAt === "number"
      ? vote.startedAt
      : Date.parse(String(vote.startedAt ?? "")) || 0;
  if (!startedMs || now - startedMs > SKIP_VOTE_MAX_AGE_MS) return null;

  const trackKeys = [
    currentTrack.trackId,
    currentTrack.itemId,
    currentTrack.id,
    currentTrack.youtubeVideoId,
  ]
    .filter((v) => v !== undefined && v !== null && String(v).length > 0)
    .map((v) => String(v));

  const voteKeys = [vote.trackId, vote.itemId, vote.videoId]
    .filter((v) => v !== undefined && v !== null && String(v).length > 0)
    .map((v) => String(v));

  const matches = voteKeys.some((k) => trackKeys.includes(k));
  if (!matches) return null;

  const voters = vote.voterIds ?? vote.voters ?? [];
  const votes = Math.max(Number(vote.votes ?? 0), Number(vote.votesCount ?? 0), voters.length);
  if (votes <= 0) return null;

  return { ...vote, votes, votesCount: votes };
}

