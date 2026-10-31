import { describe, expect, it } from "vitest";
import {
  nightStateSchema,
  queueItemViewSchema,
  joinNightResponseSchema,
  deriveNightPhase,
  type NightState,
} from "./contracts";

describe("night contracts and schemas", () => {
  const validQueueItem = {
    id: "item-1",
    trackId: "track-1",
    title: "De Música Ligera",
    artist: "Soda Stereo",
    source: "youtube" as const,
    durationSeconds: 212,
    thumbnailUrl: "https://example.com/thumb.jpg",
    voteCount: 5,
    createdAt: "2026-10-31T20:00:00.000Z",
    status: "queued" as const,
    myVote: true,
  };

  const validState: NightState = {
    venue: {
      id: "venue-1",
      slug: "billar-aurora",
      name: "Billar Aurora",
      accentColor: "#FFB703",
      logoUrl: null,
      joinMessage: "Bienvenidos a la noche",
    },
    night: {
      id: "night-1",
      status: "open",
      openedAt: "2026-10-31T19:00:00.000Z",
    },
    nowPlaying: null,
    queue: [validQueueItem],
    me: {
      participantId: "part-1",
      credits: 3,
      proposalsUsed: 1,
    },
    settings: {
      proposalsEnabled: true,
      explicitFilterEnabled: true,
      maxQueueSize: 30,
      maxProposalsPerParticipant: 3,
      maxSongDurationSeconds: 480,
      defaultCreditsPerCode: 5,
      maxCreditsPerCode: 50,
    },
    serverTime: "2026-10-31T20:10:00.000Z",
  };

  it("parses a valid queue item", () => {
    const result = queueItemViewSchema.safeParse(validQueueItem);
    expect(result.success).toBe(true);
  });

  it("parses a complete night state", () => {
    const result = nightStateSchema.safeParse(validState);
    expect(result.success).toBe(true);
  });

  it("rejects state missing required settings", () => {
    const invalid = { ...validState, settings: undefined };
    const result = nightStateSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("parses join night response", () => {
    const joinRes = {
      participantId: "part-123",
      credits: 0,
      proposalsUsed: 0,
    };
    expect(joinNightResponseSchema.safeParse(joinRes).success).toBe(true);
  });

  it("derives night phase correctly", () => {
    expect(deriveNightPhase({ ...validState, night: null })).toBe("closed");
    expect(
      deriveNightPhase({
        ...validState,
        night: { id: "n", status: "closed", openedAt: "" },
      }),
    ).toBe("closed");
    expect(
      deriveNightPhase({
        ...validState,
        nowPlaying: null,
        queue: [],
      }),
    ).toBe("empty");
    expect(
      deriveNightPhase({
        ...validState,
        nowPlaying: null,
        queue: [validQueueItem],
      }),
    ).toBe("active");
  });
});
