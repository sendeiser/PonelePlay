export type SyncRole = "master" | "tv" | "client" | "lan-bridge";

export type SyncTransportMode = "lan" | "cloud" | "fallback";

export interface SyncTrack {
  itemId: string;
  trackId: string;
  title: string;
  artist: string;
  source?: "youtube" | "upload" | "spotify";
  durationSeconds?: number | null;
  youtubeVideoId?: string | null;
  thumbnailUrl?: string | null;
  voteCount?: number;
  guestName?: string | null;
  dedication?: string | null;
  isKaraoke?: boolean;
}

export interface PlaybackAnchor {
  seq: number;
  seekSeq: number;
  track: SyncTrack | null;
  isPaused: boolean;
  anchorPositionSec: number;
  anchorServerMs: number;
  volume: number;
  cabinaMuted: boolean;
  tvMuted: boolean;
  karaokeMode: boolean;
  lastCommand: string | null;
  displayConfig: Record<string, unknown> | null;
}

export interface ReadyBarrierState {
  barrierId: string;
  track: SyncTrack;
  startPositionSec: number;
  createdAtServerMs: number;
  deadlineServerMs: number;
  readyClientIds: string[];
  expectedClientIds: string[];
  released: boolean;
  startAtServerMs: number | null;
}

export interface RoomPresenceSummary {
  masterCount: number;
  tvCount: number;
  clientCount: number;
  bridgeCount: number;
}

export interface SyncRoomSnapshot {
  slug: string;
  revision: number;
  anchor: PlaybackAnchor;
  tvFeed: Record<string, unknown> | null;
  updatedAtServerMs: number;
  activeBarrier: ReadyBarrierState | null;
  connectedClients: RoomPresenceSummary;
}

export type SyncInboundMessage =
  | { type: "clock:ping"; clientSentMs: number }
  | { type: "room:join"; slug: string; role: SyncRole; clientId: string; deviceId?: string }
  | {
      type: "playback:command";
      command: string;
      payload?: Record<string, unknown>;
      clientSeq?: number;
      useBarrier?: boolean;
    }
  | { type: "sync:ready"; barrierId: string; clientId: string; role?: SyncRole }
  | {
      type: "sync:progress";
      currentTime: number;
      duration?: number;
      isPaused?: boolean;
      isFromAdminAudio?: boolean;
      seekSeq?: number;
      forceSeek?: boolean;
      tvMuted?: boolean;
      volume?: number;
      track?: SyncTrack | null;
    }
  | { type: "party:event"; payload: Record<string, unknown> }
  | { type: "state:refresh_request" }
  | {
      type: "room:snapshot_sync";
      tvFeed?: Record<string, unknown> | null;
      anchor?: Partial<PlaybackAnchor>;
      source?: "cloud" | "lan" | "api";
    };

export type SyncOutboundMessage =
  | { type: "clock:pong"; clientSentMs: number; serverNowMs: number }
  | { type: "room:snapshot"; snapshot: SyncRoomSnapshot; serverNowMs: number }
  | { type: "sync:anchor"; anchor: PlaybackAnchor; forceSeek?: boolean; serverNowMs: number }
  | {
      type: "sync:preload";
      barrierId: string;
      track: SyncTrack;
      startPositionSec: number;
      deadlineServerMs: number;
      serverNowMs: number;
    }
  | {
      type: "sync:go";
      barrierId: string;
      track: SyncTrack;
      startPositionSec: number;
      startAtServerMs: number;
      anchor: PlaybackAnchor;
      serverNowMs: number;
    }
  | { type: "party:event"; payload: Record<string, unknown>; serverNowMs: number }
  | { type: "room:presence"; connectedClients: RoomPresenceSummary; serverNowMs: number }
  | { type: "sync:error"; code: string; message: string };

export interface ClockSyncEstimate {
  offsetMs: number;
  bestRttMs: number;
  sampleCount: number;
}

/**
 * Computes single-sample clock offset relative to authoritative server time.
 * Estimated server time at any moment is: Date.now() + offsetMs.
 */
export function computeClockOffsetSample(
  clientSentMs: number,
  serverNowMs: number,
  clientReceivedMs: number,
): { rttMs: number; offsetMs: number } {
  const rttMs = Math.max(0, clientReceivedMs - clientSentMs);
  const midpointMs = clientSentMs + rttMs / 2;
  const offsetMs = Math.round(serverNowMs - midpointMs);
  return { rttMs, offsetMs };
}

/**
 * Merges a new clock sample favoring lowest-RTT observations to avoid network jitter skew.
 */
export function mergeClockOffset(
  prev: ClockSyncEstimate | null,
  sample: { rttMs: number; offsetMs: number },
): ClockSyncEstimate {
  if (!prev) {
    return {
      offsetMs: sample.offsetMs,
      bestRttMs: sample.rttMs,
      sampleCount: 1,
    };
  }

  // Always prefer lower-RTT samples immediately; blend normal low-jitter samples smoothly
  if (sample.rttMs <= prev.bestRttMs + 8) {
    const nextBest = Math.min(prev.bestRttMs, sample.rttMs);
    const weight = sample.rttMs <= prev.bestRttMs ? 0.65 : 0.35;
    return {
      offsetMs: Math.round(prev.offsetMs * (1 - weight) + sample.offsetMs * weight),
      bestRttMs: nextBest,
      sampleCount: prev.sampleCount + 1,
    };
  }

  // Slowly decay bestRttMs upward over many samples in case network baseline permanently shifted
  const decayedBest = Math.round(prev.bestRttMs * 1.08);
  return {
    offsetMs: sample.rttMs <= decayedBest
      ? Math.round(prev.offsetMs * 0.85 + sample.offsetMs * 0.15)
      : prev.offsetMs,
    bestRttMs: decayedBest,
    sampleCount: prev.sampleCount + 1,
  };
}

/**
 * Computes the exact live playback position in seconds from a mathematical PlaybackAnchor.
 */
export function computeTargetPositionSec(
  anchor: Pick<PlaybackAnchor, "isPaused" | "anchorPositionSec" | "anchorServerMs" | "track">,
  estimatedServerMs: number,
): number {
  const base = Math.max(0, Number.isFinite(anchor.anchorPositionSec) ? anchor.anchorPositionSec : 0);
  if (anchor.isPaused || anchor.anchorServerMs <= 0) {
    return base;
  }

  const elapsedSec = (estimatedServerMs - anchor.anchorServerMs) / 1000;
  // Before a future scheduled startAtServerMs arrives, hold cleanly at base position
  if (elapsedSec < 0) {
    return base;
  }

  const raw = base + elapsedSec;
  const maxDur = anchor.track?.durationSeconds;
  if (typeof maxDur === "number" && maxDur > 0) {
    return Math.min(maxDur, Math.max(0, raw));
  }
  return Math.max(0, raw);
}

/**
 * Normalizes track objects arriving from YouTube, /api/tv, or playback state JSON.
 */
export function sanitizeSyncTrack(raw: unknown): SyncTrack | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  const youtubeVideoId =
    typeof obj.youtubeVideoId === "string" && obj.youtubeVideoId.trim()
      ? obj.youtubeVideoId.trim()
      : null;

  if (!title && !youtubeVideoId) return null;

  const itemId = String(obj.itemId || obj.id || youtubeVideoId || "track");
  const trackId = String(obj.trackId || itemId);

  return {
    itemId,
    trackId,
    title: title || "Sin título",
    artist: typeof obj.artist === "string" && obj.artist.trim() ? obj.artist.trim() : "PonelePlay",
    source: obj.source === "upload" || obj.source === "spotify" ? obj.source : "youtube",
    durationSeconds:
      typeof obj.durationSeconds === "number" && Number.isFinite(obj.durationSeconds)
        ? obj.durationSeconds
        : null,
    youtubeVideoId,
    thumbnailUrl: typeof obj.thumbnailUrl === "string" ? obj.thumbnailUrl : null,
    voteCount: typeof obj.voteCount === "number" && Number.isFinite(obj.voteCount) ? obj.voteCount : 0,
    guestName: typeof obj.guestName === "string" ? obj.guestName : null,
    dedication: typeof obj.dedication === "string" ? obj.dedication : null,
    isKaraoke: Boolean(obj.isKaraoke),
  };
}

export function createDefaultAnchor(nowMs = Date.now()): PlaybackAnchor {
  return {
    seq: 0,
    seekSeq: 0,
    track: null,
    isPaused: true,
    anchorPositionSec: 0,
    anchorServerMs: nowMs,
    volume: 85,
    cabinaMuted: false,
    tvMuted: false,
    karaokeMode: false,
    lastCommand: null,
    displayConfig: null,
  };
}

