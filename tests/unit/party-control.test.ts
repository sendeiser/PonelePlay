import { describe, expect, it, vi } from "vitest";
import {
  buildPartyBroadcastPayload,
  castPartyVote,
  getStoredPartyConfig,
  normalizePartyConfigPatch,
  saveStoredPartyConfig,
  updatePartyConfig,
} from "@/lib/api/party-control";
import { DEFAULT_PARTY_CONFIG, DEDICATION_STYLES, type DedicationStyle } from "@/lib/domain/party";

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

  it("normalizes dedicationRepeats and dedicationStyle with valid fallbacks", () => {
    const patch = normalizePartyConfigPatch({
      dedicationRepeats: 3,
      dedicationStyle: "gold",
    });
    expect(patch.dedicationRepeats).toBe(3);
    expect(patch.dedicationStyle).toBe("gold");

    const fallback = normalizePartyConfigPatch({
      dedicationRepeats: -5,
      dedicationStyle: "invalid_theme" as DedicationStyle,
    });
    expect(fallback.dedicationRepeats).toBe(0);
    expect(fallback.dedicationStyle).toBe("neon");
  });

  it("exposes all 5 curated dedication styles with icons and badge styling", () => {
    expect(DEDICATION_STYLES.map((s) => s.id)).toEqual([
      "neon",
      "gold",
      "cyber",
      "minimal",
      "love",
    ]);
  });

  it("locks venueType as party once in party mode and prevents switching to bar", async () => {
    saveStoredPartyConfig("cumple-tincho", DEFAULT_PARTY_CONFIG);
    const updated = await updatePartyConfig("cumple-tincho", {
      venueType: "bar",
      votesPerGuest: 0,
    });
    expect(updated.venueType).toBe("party");
  });

  it("casts party vote via /api/party/vote without requiring bar credits", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, itemId: "qi-1", voteCount: 4, creditsBalance: 99999 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const res = await castPartyVote("cumple-tincho", "qi-1");
    expect(res.ok).toBe(true);
    expect(res.voteCount).toBe(4);
    fetchSpy.mockRestore();
  });

  it("prioritizes serverConfig.minVotesToQueue over stale localStorage when reloading settings", () => {
    saveStoredPartyConfig("juntada", {
      ...DEFAULT_PARTY_CONFIG,
      minVotesToQueue: 1,
    });
    const resolved = getStoredPartyConfig("juntada", {
      venueType: "party",
      partyMode: "democratic",
      minVotesToQueue: 3,
    });
    expect(resolved.minVotesToQueue).toBe(3);
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

