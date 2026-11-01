/**
 * Player device connection status and heartbeat calculations.
 */

export const PLAYER_HEARTBEAT_TOLERANCE_MS = 45_000;

export function isPlayerConnected(
  lastSeenAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!lastSeenAt) return false;
  const last = new Date(lastSeenAt).getTime();
  const current = now.getTime();
  if (Number.isNaN(last)) return false;
  return current - last < PLAYER_HEARTBEAT_TOLERANCE_MS;
}

