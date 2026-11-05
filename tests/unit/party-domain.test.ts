import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARTY_CONFIG,
  resolveEffectiveQueueThreshold,
  canGuestCastVote,
  sanitizeDedication,
} from "@/lib/domain/party";
import { partitionQueueAndProposals } from "@/lib/domain/queue";
import { nightStateSchema } from "@/lib/api/contracts";

describe("Party Mode domain & queue rules", () => {
  it("uses threshold 1 by default in party mode and custom minVotesToQueue in democratic mode", () => {
    expect(resolveEffectiveQueueThreshold({ venueType: "bar" })).toBe(5);
    expect(
      resolveEffectiveQueueThreshold({
        venueType: "party",
        partyMode: "hybrid_turbo",
        minVotesToQueue: 1,
      }),
    ).toBe(1);
    expect(
      resolveEffectiveQueueThreshold({
        venueType: "party",
        partyMode: "democratic",
        minVotesToQueue: 4,
      }),
    ).toBe(4);
  });

  it("partitions items directly into activeQueue when party threshold is 1", () => {
    const items = [
      { id: "1", voteCount: 1, createdAt: "2026-11-04T20:00:00Z", status: "proposed" },
    ];
    const { activeQueue, candidateProposals } = partitionQueueAndProposals(items, [], 1);
    expect(activeQueue).toHaveLength(1);
    expect(candidateProposals).toHaveLength(0);
  });

  it("respects custom minVotesToQueue > 1 in democratic party mode", () => {
    const items = [
      { id: "1", voteCount: 2, createdAt: "2026-11-04T20:00:00Z", status: "proposed" },
      { id: "2", voteCount: 3, createdAt: "2026-11-04T20:01:00Z", status: "proposed" },
    ];
    const { activeQueue, candidateProposals } = partitionQueueAndProposals(items, [], 3);
    expect(activeQueue.map((i) => i.id)).toEqual(["2"]);
    expect(candidateProposals.map((i) => i.id)).toEqual(["1"]);
  });

  it("enforces optional votesPerGuest limit in democratic mode and unlimited when 0", () => {
    expect(
      canGuestCastVote({ ...DEFAULT_PARTY_CONFIG, partyMode: "democratic", votesPerGuest: 0 }, 0),
    ).toEqual({ allowed: true });
    expect(
      canGuestCastVote({ ...DEFAULT_PARTY_CONFIG, partyMode: "democratic", votesPerGuest: 5 }, 2),
    ).toEqual({ allowed: true });
    expect(
      canGuestCastVote({ ...DEFAULT_PARTY_CONFIG, partyMode: "democratic", votesPerGuest: 5 }, 0),
    ).toEqual({
      allowed: false,
      reason: "Usaste todos tus votos disponibles. Pedile al anfitrión que recargue los votos.",
    });
  });

  it("sanitizes empty or whitespace-only dedications to null and trims valid ones to 90 chars", () => {
    expect(sanitizeDedication("   ")).toBeNull();
    expect(sanitizeDedication(null)).toBeNull();
    expect(sanitizeDedication("  ¡Feliz cumple Tincho! 🍻  ")).toBe("¡Feliz cumple Tincho! 🍻");
    expect(sanitizeDedication("a".repeat(120))?.length).toBe(90);
  });

  it("parses legacy bar nightState without partyConfig and party nightState with dedication/karaoke", () => {
    const parsed = nightStateSchema.parse({
      venue: {
        id: "v1",
        slug: "cumple-tincho",
        name: "Cumple Tincho",
        accentColor: "#ec4899",
        logoUrl: null,
        joinMessage: null,
      },
      night: { id: "n1", status: "open", openedAt: "2026-11-04T20:00:00Z" },
      nowPlaying: {
        id: "q1",
        trackId: "t1",
        title: "La Morocha",
        artist: "Luck Ra",
        source: "youtube",
        durationSeconds: 180,
        thumbnailUrl: null,
        voteCount: 4,
        createdAt: "2026-11-04T20:00:00Z",
        status: "playing",
        myVote: false,
        guestName: "Franco",
        dedication: "¡Feliz cumple amigo!",
        isKaraoke: true,
      },
      queue: [],
      me: { participantId: "p1", credits: 99999, proposalsUsed: 0 },
      settings: {
        proposalsEnabled: true,
        explicitFilterEnabled: false,
        maxQueueSize: 100,
        maxProposalsPerParticipant: 999,
        maxSongDurationSeconds: 900,
        defaultCreditsPerCode: 999,
        maxCreditsPerCode: 999,
      },
      partyConfig: {
        venueType: "party",
        partyMode: "democratic",
        votesPerGuest: 5,
        minVotesToQueue: 2,
        allowDedications: true,
        allowGuestKaraoke: true,
        turboCooldownSeconds: 180,
      },
      serverTime: "2026-11-04T20:05:00Z",
    });
    expect(parsed.partyConfig?.venueType).toBe("party");
    expect(parsed.nowPlaying?.guestName).toBe("Franco");
    expect(parsed.nowPlaying?.dedication).toBe("¡Feliz cumple amigo!");
    expect(parsed.nowPlaying?.isKaraoke).toBe(true);
  });
});

