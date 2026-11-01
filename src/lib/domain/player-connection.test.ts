import { describe, expect, it } from "vitest";
import { isPlayerConnected } from "./player-connection";

describe("isPlayerConnected", () => {
  it("uses a 45 second heartbeat tolerance", () => {
    const now = new Date("2026-10-31T23:00:45Z");
    expect(isPlayerConnected("2026-10-31T23:00:01Z", now)).toBe(true);
    expect(isPlayerConnected("2026-10-31T23:00:00Z", now)).toBe(false);
    expect(isPlayerConnected(null, now)).toBe(false);
    expect(isPlayerConnected(undefined, now)).toBe(false);
  });
});

