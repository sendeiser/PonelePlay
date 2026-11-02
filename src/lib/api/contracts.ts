import { z } from "zod";

export const queueItemViewSchema = z.object({
  id: z.string().uuid().or(z.string()),
  trackId: z.string().uuid().or(z.string()),
  title: z.string(),
  artist: z.string(),
  source: z.enum(["youtube", "upload", "spotify"]),
  durationSeconds: z.number().nullable(),
  thumbnailUrl: z.string().nullable(),
  youtubeVideoId: z.string().nullable().optional(),
  voteCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  status: z.enum(["proposed", "queued", "playing"]),
  myVote: z.boolean(),
});

export type QueueItemView = z.infer<typeof queueItemViewSchema>;

export const nightVenueSchema = z.object({
  id: z.string().uuid().or(z.string()),
  slug: z.string(),
  name: z.string(),
  accentColor: z.string(),
  logoUrl: z.string().nullable(),
  joinMessage: z.string().nullable(),
});

export const nightSessionSchema = z
  .object({
    id: z.string().uuid().or(z.string()),
    status: z.enum(["open", "closed"]),
    openedAt: z.string(),
  })
  .nullable();

export const nightMeSchema = z
  .object({
    participantId: z.string().uuid().or(z.string()),
    credits: z.number().int().nonnegative(),
    proposalsUsed: z.number().int().nonnegative(),
    lastProposedAt: z.string().nullable().optional(),
  })
  .nullable();

export const nightSettingsSchema = z.object({
  proposalsEnabled: z.boolean(),
  explicitFilterEnabled: z.boolean(),
  maxQueueSize: z.number().int().positive(),
  maxProposalsPerParticipant: z.number().int().nonnegative(),
  maxSongDurationSeconds: z.number().int().positive(),
  defaultCreditsPerCode: z.number().int().positive(),
  maxCreditsPerCode: z.number().int().positive(),
});

export const nightPlayerSchema = z
  .object({
    lastSeenAt: z.string().nullable().optional(),
  })
  .nullable()
  .optional();

export const votingRoundSchema = z
  .object({
    enabled: z.boolean(),
    durationSeconds: z.number().int().positive(),
    roundNumber: z.number().int().positive(),
    startedAt: z.string(),
    remainingSeconds: z.number().int().nonnegative(),
    topCandidateId: z.string().nullable().optional(),
    totalCandidates: z.number().int().nonnegative().optional(),
  })
  .nullable()
  .optional();

export type VotingRound = z.infer<typeof votingRoundSchema>;

export const nightStateSchema = z.object({
  venue: nightVenueSchema,
  night: nightSessionSchema,
  nowPlaying: queueItemViewSchema.nullable(),
  queue: z.array(queueItemViewSchema),
  candidates: z.array(queueItemViewSchema).optional().default([]),
  votingRound: votingRoundSchema,
  me: nightMeSchema,
  settings: nightSettingsSchema,
  player: nightPlayerSchema,
  serverTime: z.string(),
});

export type NightState = z.infer<typeof nightStateSchema>;

export const joinNightResponseSchema = z.object({
  participantId: z.string(),
  credits: z.number().int().nonnegative(),
  proposalsUsed: z.number().int().nonnegative(),
});

export type JoinNightResponse = z.infer<typeof joinNightResponseSchema>;

export const nightActionResponseSchema = z.object({
  nightId: z.string(),
  status: z.enum(["open", "closed"]),
});

export type NightActionResponse = z.infer<typeof nightActionResponseSchema>;

export type NightPhase = "closed" | "empty" | "active";

export const codeRowSchema = z.object({
  id: z.string(),
  code: z.string(),
  credits: z.number().int().positive(),
  status: z.enum(["active", "redeemed", "expired"]),
  createdAt: z.string(),
  printedCount: z.number().int().nonnegative(),
  createdByKind: z.enum(["owner", "staff", "system"]),
  createdByName: z.string(),
});

export type CodeRow = z.infer<typeof codeRowSchema>;

export function deriveNightPhase(state: NightState): NightPhase {
  if (!state.night || state.night.status === "closed") {
    return "closed";
  }
  if (!state.nowPlaying && state.queue.length === 0) {
    return "empty";
  }
  return "active";
}
