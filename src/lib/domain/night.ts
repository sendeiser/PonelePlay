import type { NightState } from "@/lib/api/contracts";

export type NightPhase = "closed" | "open" | "closing";

export function nightPhase(state: NightState | null): "open" | "closed" {
  if (!state || !state.night || state.night.status === "closed") {
    return "closed";
  }
  return "open";
}

export function isPlayerOnline(
  lastSeenAt: string | null | undefined,
  currentTimestampMs: number = Date.now(),
): boolean {
  if (!lastSeenAt) return false;
  const lastSeenMs = new Date(lastSeenAt).getTime();
  if (Number.isNaN(lastSeenMs)) return false;
  return currentTimestampMs - lastSeenMs <= 45_000;
}

