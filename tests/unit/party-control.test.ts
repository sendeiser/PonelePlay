import { describe, expect, it } from "vitest";
import {
  buildPartyBroadcastPayload,
  normalizePartyConfigPatch,
} from "@/lib/api/party-control";

describe("Party Control API & Broadcast Helpers", () => {
  it("normalizes party config patch clamping negative votesPerGuest to 0 and minVotesToQueue to >= 1", () => {
    const patch = normalizePartyConfigPatch({
      venueType: "party",
      partyMode: "democratic",
      votesPerGuest: -3,
      minVotesToQueue: 0,
    });
    expect(patch.votesPerGuest).toBe(0);
    expect(patch.minVotesToQueue).toBe(1);
  });

  it("builds duel and roulette realtime payloads cleanly", () => {
    const duel = buildPartyBroadcastPayload("party_duel_start", {
      duelId: "d-1",
      durationSeconds: 30,
    });
    expect(duel.event).toBe("party_event");
    expect(duel.payload.type).toBe("party_duel_start");
    expect(duel.payload.durationSeconds).toBe(30);
  });
});

