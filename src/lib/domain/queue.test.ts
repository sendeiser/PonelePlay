import { describe, expect, it } from "vitest";
import {
  compareQueue,
  sortQueue,
  partitionQueueAndProposals,
  selectRoundWinner,
  MIN_VOTES_FOR_QUEUE,
  PROPOSAL_COOLDOWN_SECONDS,
} from "./queue";

describe("queue ordering", () => {
  it("orders by votes desc, then oldest proposal first", () => {
    const items = [
      { id: "newer", voteCount: 4, createdAt: "2026-10-31T21:10:00Z" },
      { id: "older", voteCount: 4, createdAt: "2026-10-31T21:05:00Z" },
      { id: "leader", voteCount: 7, createdAt: "2026-10-31T21:20:00Z" },
    ];

    expect(sortQueue(items).map((item) => item.id)).toEqual(["leader", "older", "newer"]);
  });

  it("returns a new array without mutating the input", () => {
    const items = [
      { id: "second", voteCount: 2, createdAt: "2026-10-31T21:10:00Z" },
      { id: "first", voteCount: 5, createdAt: "2026-10-31T21:05:00Z" },
    ];
    const original = items.map((item) => ({ ...item }));

    const sorted = sortQueue(items);

    expect(sorted).not.toBe(items);
    expect(items).toEqual(original);
    expect(sorted.map((item) => item.id)).toEqual(["first", "second"]);
  });

  it("compares ISO timestamps by parsed time instead of string collation", () => {
    const laterWithOffset = {
      id: "later",
      voteCount: 3,
      createdAt: "2026-10-31T23:00:00-04:00",
    };
    const earlierUtc = {
      id: "earlier",
      voteCount: 3,
      createdAt: "2026-11-01T01:00:00Z",
    };

    expect(compareQueue(laterWithOffset, earlierUtc)).toBeGreaterThan(0);
    expect(compareQueue(earlierUtc, laterWithOffset)).toBeLessThan(0);
  });

  it("keeps a stable order when both votes and timestamps tie", () => {
    const items = [
      { id: "a", voteCount: 1, createdAt: "2026-10-31T21:00:00Z" },
      { id: "b", voteCount: 1, createdAt: "2026-10-31T21:00:00Z" },
    ];

    expect(sortQueue(items).map((item) => item.id)).toEqual(["a", "b"]);
  });

  describe("partitionQueueAndProposals", () => {
    it("partitions items below 5 votes into candidate proposals and 5+ votes into active queue", () => {
      const items = [
        { id: "song-1", voteCount: 5, createdAt: "2026-10-31T21:00:00Z", status: "queued" },
        { id: "song-2", voteCount: 2, createdAt: "2026-10-31T21:05:00Z", status: "proposed" },
        { id: "song-3", voteCount: 8, createdAt: "2026-10-31T21:02:00Z", status: "queued" },
        { id: "song-4", voteCount: 4, createdAt: "2026-10-31T21:10:00Z", status: "queued" },
      ];

      const { activeQueue, candidateProposals } = partitionQueueAndProposals(items);

      expect(activeQueue.map((s) => s.id)).toEqual(["song-3", "song-1"]);
      expect(candidateProposals.map((s) => s.id)).toEqual(["song-4", "song-2"]);
      expect(MIN_VOTES_FOR_QUEUE).toBe(5);
      expect(PROPOSAL_COOLDOWN_SECONDS).toBe(120);
    });

    it("graduates a song to activeQueue once it reaches 5 votes", () => {
      const items = [
        { id: "candidate", voteCount: 4, createdAt: "2026-10-31T21:00:00Z" },
      ];

      const before = partitionQueueAndProposals(items);
      expect(before.activeQueue).toHaveLength(0);
      expect(before.candidateProposals).toHaveLength(1);

      // Cast 5th vote
      const after = partitionQueueAndProposals([
        { id: "candidate", voteCount: 5, createdAt: "2026-10-31T21:00:00Z" },
      ]);
      expect(after.activeQueue).toHaveLength(1);
      expect(after.candidateProposals).toHaveLength(0);
    });

    it("keeps guest proposals in pre-queue (candidateProposals) until reaching 3 votes in Democratic mode even when status is queued and candidateItems is []", () => {
      const items = [
        { id: "house-1", voteCount: 0, createdAt: "2026-11-06T20:00:00Z", status: "queued" },
        { id: "guest-1vote", voteCount: 1, createdAt: "2026-11-06T20:05:00Z", status: "queued" },
        { id: "guest-2votes", voteCount: 2, createdAt: "2026-11-06T20:06:00Z", status: "queued" },
      ];

      // Threshold = 3 (Democratic mode with 3 votes required)
      const step1 = partitionQueueAndProposals(items, [], 3);
      expect(step1.activeQueue.map((i) => i.id)).toEqual(["house-1"]);
      expect(step1.candidateProposals.map((i) => i.id)).toEqual(["guest-2votes", "guest-1vote"]);

      // Once guest-2votes receives its 3rd vote, it promotes to the top of activeQueue
      const itemsAfter3rdVote = [
        { id: "house-1", voteCount: 0, createdAt: "2026-11-06T20:00:00Z", status: "queued" },
        { id: "guest-1vote", voteCount: 1, createdAt: "2026-11-06T20:05:00Z", status: "queued" },
        { id: "guest-2votes", voteCount: 3, createdAt: "2026-11-06T20:06:00Z", status: "queued" },
      ];
      const step2 = partitionQueueAndProposals(itemsAfter3rdVote, [], 3);
      expect(step2.activeQueue.map((i) => i.id)).toEqual(["guest-2votes", "house-1"]);
      expect(step2.candidateProposals.map((i) => i.id)).toEqual(["guest-1vote"]);
    });
  });

  describe("selectRoundWinner (Rondas de Votación)", () => {
    it("returns null when there are no candidate proposals", () => {
      expect(selectRoundWinner([])).toBeNull();
    });

    it("selects the most voted candidate", () => {
      const candidates = [
        { id: "cand-1", voteCount: 2, createdAt: "2026-11-02T15:00:00Z" },
        { id: "cand-2", voteCount: 4, createdAt: "2026-11-02T15:05:00Z" },
        { id: "cand-3", voteCount: 1, createdAt: "2026-11-02T15:02:00Z" },
      ];

      const winner = selectRoundWinner(candidates);
      expect(winner?.id).toBe("cand-2");
      expect(winner?.voteCount).toBe(4);
    });

    it("breaks ties by earliest proposal time (order of arrival)", () => {
      const candidates = [
        { id: "second-proposed", voteCount: 3, createdAt: "2026-11-02T15:05:00Z" },
        { id: "first-proposed", voteCount: 3, createdAt: "2026-11-02T15:01:00Z" },
        { id: "third-proposed", voteCount: 3, createdAt: "2026-11-02T15:08:00Z" },
      ];

      const winner = selectRoundWinner(candidates);
      expect(winner?.id).toBe("first-proposed");
    });
  });
});
