import { describe, expect, it } from "vitest";
import { nightPhase, isPlayerOnline } from "./night";
import type { NightState } from "@/lib/api/contracts";

describe("night domain logic", () => {
  it("maps missing, open, and closed nights", () => {
    expect(nightPhase(null)).toBe("closed");
    expect(
      nightPhase({
        night: { id: "n", status: "open", openedAt: "" },
      } as unknown as NightState),
    ).toBe("open");
    expect(
      nightPhase({
        night: { id: "n", status: "closed", openedAt: "" },
      } as unknown as NightState),
    ).toBe("closed");
  });

  it("determines player online status based on 45s heartbeat window", () => {
    const now = new Date("2026-10-31T20:30:00Z").getTime();
    const recent = new Date("2026-10-31T20:29:30Z").toISOString(); // 30s ago
    const stale = new Date("2026-10-31T20:28:00Z").toISOString(); // 120s ago

    expect(isPlayerOnline(recent, now)).toBe(true);
    expect(isPlayerOnline(stale, now)).toBe(false);
    expect(isPlayerOnline(null, now)).toBe(false);
    expect(isPlayerOnline(undefined, now)).toBe(false);
  });
});
