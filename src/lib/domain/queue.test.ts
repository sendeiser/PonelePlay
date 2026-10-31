import { describe, expect, it } from "vitest";
import { compareQueue, sortQueue } from "./queue";

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
});
