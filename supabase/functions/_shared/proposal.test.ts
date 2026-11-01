import { describe, expect, it } from "vitest";
import { evaluateProposal } from "./proposal";

describe("proposal evaluation", () => {
  const base = {
    title: "De Música Ligera",
    artist: "Soda Stereo",
    explicitKeywords: ["puta"],
    filterEnabled: true,
    existingActive: false,
    queueSize: 4,
    maxQueueSize: 30,
    proposalsUsed: 1,
    maxProposals: 3,
  };

  it("blocks explicit, duplicate, full, and over-limit proposals", () => {
    expect(evaluateProposal({ ...base, title: "La Puta Madre" })).toBe(
      "explicit",
    );
    expect(evaluateProposal({ ...base, existingActive: true })).toBe(
      "duplicate_active",
    );
    expect(evaluateProposal({ ...base, queueSize: 30 })).toBe("queue_full");
    expect(evaluateProposal({ ...base, proposalsUsed: 3 })).toBe(
      "proposal_limit",
    );
    expect(evaluateProposal(base)).toBeNull();
  });
});

