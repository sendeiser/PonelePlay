import { MIN_VOTES_FOR_QUEUE } from "./queue";

export type VenueType = "bar" | "party";

export type PartyMode = "democratic" | "hybrid_turbo" | "party_games";

export type DedicationStyle = "neon" | "gold" | "cyber" | "minimal" | "love";

export interface DedicationStyleDefinition {
  id: DedicationStyle;
  label: string;
  icon: string;
  leadEmoji: string;
  tailEmoji: string;
  containerClass: string;
  badgeClass: string;
  messageClass: string;
}

export const DEDICATION_STYLES: DedicationStyleDefinition[] = [
  {
    id: "neon",
    label: "Neón Fiesta",
    icon: "🔮",
    leadEmoji: "💌",
    tailEmoji: "🎉",
    containerClass:
      "bg-gradient-to-r from-fuchsia-600/95 via-purple-700/95 to-indigo-600/95 border-2 border-pink-300/70 shadow-[0_0_40px_rgba(217,70,239,0.65)]",
    badgeClass: "text-amber-200 bg-black/35 border border-amber-300/30",
    messageClass: "text-white",
  },
  {
    id: "gold",
    label: "Dorado VIP",
    icon: "👑",
    leadEmoji: "👑",
    tailEmoji: "✨",
    containerClass:
      "bg-gradient-to-r from-amber-600/95 via-yellow-600/95 to-amber-700/95 border-2 border-yellow-300/80 shadow-[0_0_40px_rgba(245,158,11,0.65)]",
    badgeClass: "text-amber-100 bg-black/45 border border-yellow-300/40",
    messageClass: "text-white",
  },
  {
    id: "cyber",
    label: "Cyan Cyber",
    icon: "⚡",
    leadEmoji: "⚡",
    tailEmoji: "🛸",
    containerClass:
      "bg-gradient-to-r from-cyan-600/95 via-blue-600/95 to-indigo-700/95 border-2 border-cyan-300/80 shadow-[0_0_40px_rgba(6,182,212,0.7)]",
    badgeClass: "text-cyan-200 bg-black/45 border border-cyan-300/40",
    messageClass: "text-white",
  },
  {
    id: "minimal",
    label: "Glass Dark",
    icon: "💎",
    leadEmoji: "💬",
    tailEmoji: "🤍",
    containerClass:
      "bg-[#0a0d16]/90 border-2 border-slate-600/70 shadow-[0_8px_32px_rgba(0,0,0,0.85)]",
    badgeClass: "text-slate-200 bg-white/10 border border-white/20",
    messageClass: "text-slate-100",
  },
  {
    id: "love",
    label: "Romance",
    icon: "💖",
    leadEmoji: "💌",
    tailEmoji: "💖",
    containerClass:
      "bg-gradient-to-r from-rose-600/95 via-red-600/95 to-pink-600/95 border-2 border-rose-300/80 shadow-[0_0_40px_rgba(244,63,94,0.7)]",
    badgeClass: "text-rose-100 bg-black/40 border border-rose-300/40",
    messageClass: "text-white",
  },
];

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
  /** Number of times the dedication banner loops across screen (0 = continuous throughout track, default: 2) */
  dedicationRepeats?: number;
  /** Visual style theme for the dedication marquee on screen (default: "neon") */
  dedicationStyle?: DedicationStyle;
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
  dedicationRepeats: 2,
  dedicationStyle: "neon",
  allowGuestKaraoke: true,
  turboCooldownSeconds: 180,
};

export const DEFAULT_BAR_PARTY_CONFIG: PartyConfig = {
  venueType: "bar",
  partyMode: "democratic",
  votesPerGuest: 0,
  minVotesToQueue: MIN_VOTES_FOR_QUEUE,
  allowDedications: true,
  dedicationRepeats: 2,
  dedicationStyle: "neon",
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

