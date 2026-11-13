import {
  computeTargetPositionSec,
  createDefaultAnchor,
  sanitizeSyncTrack,
  type PlaybackAnchor,
  type ReadyBarrierState,
  type RoomPresenceSummary,
  type SyncOutboundMessage,
  type SyncPeerInfo,
  type SyncRole,
  type SyncRoomSnapshot,
  type SyncTrack,
} from "./protocol";

export interface ConnectedRoomClient {
  clientId: string;
  role: SyncRole;
  deviceId?: string;
  joinedAtMs: number;
  lanEndpoints?: string[];
  directEnabled?: boolean;
}

export interface RoomEngineConfig {
  barrierTimeoutMs?: number;
  barrierStartLeadMs?: number;
}

export interface SerializedRoomEngineState {
  slug: string;
  revision: number;
  anchor: PlaybackAnchor;
  tvFeed: Record<string, unknown> | null;
  updatedAtServerMs: number;
  activeBarrier: ReadyBarrierState | null;
}

const DEFAULT_BARRIER_TIMEOUT_MS = 2200;
const DEFAULT_START_LEAD_MS = 180;

function normalizeLanEndpoints(endpoints?: string[]): string[] | undefined {
  if (!Array.isArray(endpoints)) return undefined;
  const clean = Array.from(
    new Set(
      endpoints
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry.length > 0 && entry.length <= 120),
    ),
  ).slice(0, 12);
  return clean;
}

/**
 * Pure, runtime-agnostic room coordinator shared between Cloudflare Durable Objects
 * and the local Node.js LAN Hub.
 */
export class SyncRoomEngine {
  private slug: string;
  private revision = 0;
  private anchor: PlaybackAnchor;
  private tvFeed: Record<string, unknown> | null = null;
  private updatedAtServerMs: number;
  private activeBarrier: ReadyBarrierState | null = null;
  private clients = new Map<string, ConnectedRoomClient>();
  private readonly barrierTimeoutMs: number;
  private readonly barrierStartLeadMs: number;

  constructor(slug: string, config?: RoomEngineConfig, nowMs = Date.now()) {
    this.slug = slug;
    this.anchor = createDefaultAnchor(nowMs);
    this.updatedAtServerMs = nowMs;
    this.barrierTimeoutMs = config?.barrierTimeoutMs ?? DEFAULT_BARRIER_TIMEOUT_MS;
    this.barrierStartLeadMs = config?.barrierStartLeadMs ?? DEFAULT_START_LEAD_MS;
  }

  static restore(
    raw: SerializedRoomEngineState,
    config?: RoomEngineConfig,
  ): SyncRoomEngine {
    const engine = new SyncRoomEngine(raw.slug, config, raw.updatedAtServerMs);
    engine.revision = raw.revision ?? 0;
    engine.anchor = raw.anchor ? { ...createDefaultAnchor(raw.updatedAtServerMs), ...raw.anchor } : createDefaultAnchor(raw.updatedAtServerMs);
    engine.tvFeed = raw.tvFeed ?? null;
    engine.updatedAtServerMs = raw.updatedAtServerMs ?? Date.now();
    engine.activeBarrier = raw.activeBarrier ?? null;
    return engine;
  }

  serialize(): SerializedRoomEngineState {
    return {
      slug: this.slug,
      revision: this.revision,
      anchor: this.anchor,
      tvFeed: this.tvFeed,
      updatedAtServerMs: this.updatedAtServerMs,
      activeBarrier: this.activeBarrier,
    };
  }

  upsertClient(client: ConnectedRoomClient): SyncOutboundMessage {
    const normalizedEndpoints = normalizeLanEndpoints(client.lanEndpoints);
    const existing = this.clients.get(client.clientId);
    this.clients.set(client.clientId, {
      ...client,
      lanEndpoints: normalizedEndpoints ?? existing?.lanEndpoints,
      directEnabled:
        typeof client.directEnabled === "boolean"
          ? client.directEnabled
          : existing?.directEnabled,
    });
    return {
      type: "room:presence",
      connectedClients: this.getPresenceSummary(),
      lanEndpoints: this.getLanEndpoints(),
      peers: this.getPeers(),
      serverNowMs: Date.now(),
    };
  }

  setClientDirectEnabled(
    clientId: string,
    directEnabled: boolean,
    nowMs = Date.now(),
  ): SyncOutboundMessage | null {
    const existing = this.clients.get(clientId);
    if (!existing) return null;
    this.clients.set(clientId, {
      ...existing,
      directEnabled,
    });
    return {
      type: "room:presence",
      connectedClients: this.getPresenceSummary(),
      lanEndpoints: this.getLanEndpoints(),
      peers: this.getPeers(),
      serverNowMs: nowMs,
    };
  }

  setClientLanEndpoints(
    clientId: string,
    lanEndpoints: string[],
    nowMs = Date.now(),
  ): SyncOutboundMessage | null {
    const existing = this.clients.get(clientId);
    if (!existing) return null;
    this.clients.set(clientId, {
      ...existing,
      lanEndpoints: normalizeLanEndpoints(lanEndpoints) ?? [],
    });
    return {
      type: "room:presence",
      connectedClients: this.getPresenceSummary(),
      lanEndpoints: this.getLanEndpoints(),
      peers: this.getPeers(),
      serverNowMs: nowMs,
    };
  }

  getPeers(): SyncPeerInfo[] {
    return Array.from(this.clients.values()).map((c) => ({
      clientId: c.clientId,
      role: c.role,
      ...(c.deviceId ? { deviceId: c.deviceId } : {}),
      ...(c.directEnabled ? { directEnabled: true } : {}),
    }));
  }

  getLanEndpoints(): string[] {
    const unique = new Set<string>();
    for (const c of this.clients.values()) {
      if (!Array.isArray(c.lanEndpoints)) continue;
      for (const endpoint of c.lanEndpoints) {
        if (endpoint) unique.add(endpoint);
      }
    }
    return Array.from(unique);
  }

  removeClient(clientId: string, nowMs = Date.now()): SyncOutboundMessage[] {
    if (!this.clients.delete(clientId)) return [];

    const outbound: SyncOutboundMessage[] = [
      {
        type: "room:presence",
        connectedClients: this.getPresenceSummary(),
        lanEndpoints: this.getLanEndpoints(),
        peers: this.getPeers(),
        serverNowMs: nowMs,
      },
    ];

    // If a departing client was blocking an active barrier, re-evaluate immediately
    if (this.activeBarrier && !this.activeBarrier.released) {
      this.activeBarrier.expectedClientIds = this.activeBarrier.expectedClientIds.filter(
        (id) => id !== clientId,
      );
      if (this.areExpectedParticipantsReady(this.activeBarrier)) {
        outbound.push(...this.releaseBarrier(nowMs));
      }
    }

    return outbound;
  }

  getPresenceSummary(): RoomPresenceSummary {
    let masterCount = 0;
    let tvCount = 0;
    let clientCount = 0;
    let bridgeCount = 0;

    for (const c of this.clients.values()) {
      if (c.role === "master") masterCount++;
      else if (c.role === "tv") tvCount++;
      else if (c.role === "lan-bridge") bridgeCount++;
      else clientCount++;
    }

    return { masterCount, tvCount, clientCount, bridgeCount };
  }

  getSnapshot(nowMs = Date.now()): SyncRoomSnapshot {
    this.syncAnchorIntoTvFeed(nowMs);
    return {
      slug: this.slug,
      revision: this.revision,
      anchor: { ...this.anchor },
      tvFeed: this.tvFeed,
      updatedAtServerMs: this.updatedAtServerMs,
      activeBarrier: this.activeBarrier ? { ...this.activeBarrier } : null,
      connectedClients: this.getPresenceSummary(),
      lanEndpoints: this.getLanEndpoints(),
      peers: this.getPeers(),
    };
  }

  /**
   * Computes live anchor state and applies a command atomically.
   */
  applyPlaybackCommand(
    command: string,
    payload: Record<string, unknown> = {},
    nowMs = Date.now(),
    options?: { useBarrier?: boolean },
  ): { outbound: SyncOutboundMessage[]; nextAlarmMs: number | null } {
    if (
      command === "skip" &&
      typeof payload.expectedVideoId === "string" &&
      payload.expectedVideoId.trim().length > 0
    ) {
      const currentVideoId = this.anchor.track?.youtubeVideoId;
      if (currentVideoId && currentVideoId !== payload.expectedVideoId.trim()) {
        this.syncAnchorIntoTvFeed(nowMs);
        return { outbound: [], nextAlarmMs: null };
      }
    }

    const livePos = computeTargetPositionSec(this.anchor, nowMs);
    const outbound: SyncOutboundMessage[] = [];
    let nextAlarmMs: number | null = null;

    if (command === "pause") {
      this.activeBarrier = null;
      this.anchor = {
        ...this.anchor,
        seq: this.anchor.seq + 1,
        isPaused: true,
        anchorPositionSec: Math.round(livePos * 100) / 100,
        anchorServerMs: nowMs,
        lastCommand: command,
      };
      this.bumpRevision(nowMs);
      outbound.push({ type: "sync:anchor", anchor: { ...this.anchor }, serverNowMs: nowMs });
    } else if (command === "resume") {
      this.activeBarrier = null;
      this.anchor = {
        ...this.anchor,
        seq: this.anchor.seq + 1,
        seekSeq: this.anchor.seekSeq + 1,
        isPaused: false,
        anchorServerMs: nowMs,
        lastCommand: command,
      };
      this.bumpRevision(nowMs);
      outbound.push({ type: "sync:anchor", anchor: { ...this.anchor }, serverNowMs: nowMs });
    } else if (command === "toggle_pause") {
      const nextPaused = !this.anchor.isPaused;
      this.activeBarrier = null;
      this.anchor = {
        ...this.anchor,
        seq: this.anchor.seq + 1,
        seekSeq: nextPaused ? this.anchor.seekSeq : this.anchor.seekSeq + 1,
        isPaused: nextPaused,
        anchorPositionSec: nextPaused
          ? Math.round(livePos * 100) / 100
          : this.anchor.anchorPositionSec,
        anchorServerMs: nowMs,
        lastCommand: command,
      };
      this.bumpRevision(nowMs);
      outbound.push({ type: "sync:anchor", anchor: { ...this.anchor }, serverNowMs: nowMs });
    } else if (command === "seek") {
      const rawSec = Number(payload.seconds ?? 0);
      const maxDur = this.anchor.track?.durationSeconds;
      const clamped = Math.max(
        0,
        typeof maxDur === "number" && maxDur > 0 ? Math.min(maxDur, rawSec) : rawSec,
      );
      this.activeBarrier = null;
      this.anchor = {
        ...this.anchor,
        seq: this.anchor.seq + 1,
        seekSeq: typeof payload.seekSeq === "number" ? payload.seekSeq : this.anchor.seekSeq + 1,
        anchorPositionSec: Math.round(clamped * 100) / 100,
        anchorServerMs: nowMs,
        lastCommand: command,
      };
      this.bumpRevision(nowMs);
      outbound.push({
        type: "sync:anchor",
        anchor: { ...this.anchor },
        forceSeek: true,
        serverNowMs: nowMs,
      });
    } else if (command === "set_volume") {
      const volume = Math.max(0, Math.min(100, Number(payload.volume ?? this.anchor.volume)));
      this.anchor = {
        ...this.anchor,
        seq: this.anchor.seq + 1,
        volume,
        lastCommand: command,
      };
      this.bumpRevision(nowMs);
      outbound.push({ type: "sync:anchor", anchor: { ...this.anchor }, serverNowMs: nowMs });
    } else if (command === "mute" || command === "unmute" || command === "toggle_mute") {
      const cabinaMuted =
        command === "mute" ? true : command === "unmute" ? false : !this.anchor.cabinaMuted;
      this.anchor = {
        ...this.anchor,
        seq: this.anchor.seq + 1,
        cabinaMuted,
        lastCommand: command,
      };
      this.bumpRevision(nowMs);
      outbound.push({ type: "sync:anchor", anchor: { ...this.anchor }, serverNowMs: nowMs });
    } else if (command === "set_tv_mute") {
      const tvMuted = Boolean(payload.tvMuted ?? payload.muted);
      const cabinaMuted =
        typeof payload.cabinaMuted === "boolean" ? payload.cabinaMuted : this.anchor.cabinaMuted;
      this.anchor = {
        ...this.anchor,
        seq: this.anchor.seq + 1,
        tvMuted,
        cabinaMuted,
        lastCommand: command,
      };
      this.bumpRevision(nowMs);
      outbound.push({ type: "sync:anchor", anchor: { ...this.anchor }, serverNowMs: nowMs });
    } else if (command === "set_karaoke_mode") {
      this.anchor = {
        ...this.anchor,
        seq: this.anchor.seq + 1,
        karaokeMode: Boolean(payload.enabled),
        lastCommand: command,
      };
      this.bumpRevision(nowMs);
      outbound.push({ type: "sync:anchor", anchor: { ...this.anchor }, serverNowMs: nowMs });
    } else if (command === "set_tv_display") {
      const cfg = (payload.config || payload.displayConfig || {}) as Record<string, unknown>;
      const tvMuted = typeof cfg.tvMuted === "boolean" ? cfg.tvMuted : this.anchor.tvMuted;
      this.anchor = {
        ...this.anchor,
        seq: this.anchor.seq + 1,
        tvMuted,
        displayConfig: { ...(this.anchor.displayConfig || {}), ...cfg },
        lastCommand: command,
      };
      this.bumpRevision(nowMs);
      outbound.push({ type: "sync:anchor", anchor: { ...this.anchor }, serverNowMs: nowMs });
    } else if (
      (command === "play_now" || command === "skip" || command === "play_playlist") &&
      payload.track
    ) {
      const track = sanitizeSyncTrack(payload.track);
      if (track) {
        const startPositionSec = Math.max(0, Number(payload.startPositionSec ?? 0));
        const shouldUseBarrier = options?.useBarrier !== false && this.shouldCoordinateBarrier();

        if (shouldUseBarrier) {
          const barrierId = `${nowMs}-${this.anchor.seq + 1}`;
          const deadlineServerMs = nowMs + this.barrierTimeoutMs;
          const expectedClientIds = this.getBarrierParticipantIds();

          this.anchor = {
            ...this.anchor,
            seq: this.anchor.seq + 1,
            seekSeq: this.anchor.seekSeq + 1,
            track,
            isPaused: true,
            anchorPositionSec: startPositionSec,
            anchorServerMs: nowMs,
            lastCommand: command,
          };
          this.activeBarrier = {
            barrierId,
            track,
            startPositionSec,
            createdAtServerMs: nowMs,
            deadlineServerMs,
            readyClientIds: [],
            expectedClientIds,
            released: false,
            startAtServerMs: null,
          };
          this.bumpRevision(nowMs);
          nextAlarmMs = deadlineServerMs;

          outbound.push({
            type: "sync:preload",
            barrierId,
            track,
            startPositionSec,
            deadlineServerMs,
            serverNowMs: nowMs,
          });
          outbound.push({ type: "sync:anchor", anchor: { ...this.anchor }, serverNowMs: nowMs });
        } else {
          const barrierId = `${nowMs}-${this.anchor.seq + 1}`;
          const startAtServerMs = nowMs + 80;
          this.activeBarrier = null;
          this.anchor = {
            ...this.anchor,
            seq: this.anchor.seq + 1,
            seekSeq: this.anchor.seekSeq + 1,
            track,
            isPaused: false,
            anchorPositionSec: startPositionSec,
            anchorServerMs: startAtServerMs,
            lastCommand: command,
          };
          this.bumpRevision(nowMs);
          outbound.push({
            type: "sync:go",
            barrierId,
            track,
            startPositionSec,
            startAtServerMs,
            anchor: { ...this.anchor },
            serverNowMs: nowMs,
          });
          outbound.push({ type: "sync:anchor", anchor: { ...this.anchor }, serverNowMs: nowMs });
        }
      }
    } else {
      this.anchor = {
        ...this.anchor,
        seq: this.anchor.seq + 1,
        lastCommand: command,
      };
      this.bumpRevision(nowMs);
      outbound.push({ type: "sync:anchor", anchor: { ...this.anchor }, serverNowMs: nowMs });
    }

    this.syncAnchorIntoTvFeed(nowMs);
    return { outbound, nextAlarmMs };
  }

  /**
   * Marks a client ready for an active Ready-Barrier; releases `sync:go` once all participants confirm.
   */
  markReady(barrierId: string, clientId: string, nowMs = Date.now()): SyncOutboundMessage[] {
    if (!this.activeBarrier || this.activeBarrier.released) return [];
    if (this.activeBarrier.barrierId !== barrierId) return [];

    if (!this.activeBarrier.readyClientIds.includes(clientId)) {
      this.activeBarrier.readyClientIds.push(clientId);
    }

    if (this.areExpectedParticipantsReady(this.activeBarrier)) {
      return this.releaseBarrier(nowMs);
    }

    return [];
  }

  /**
   * Releases an active Ready-Barrier if its timeout deadline has elapsed.
   */
  checkBarrierDeadline(nowMs = Date.now()): SyncOutboundMessage[] {
    if (!this.activeBarrier || this.activeBarrier.released) return [];
    if (nowMs < this.activeBarrier.deadlineServerMs) return [];
    return this.releaseBarrier(nowMs);
  }

  /**
   * Updates live snapshot pushed by Next.js API or peer bridge without clobbering fresher timing.
   */
  mergeExternalTvFeed(
    incomingFeed: Record<string, unknown>,
    nowMs = Date.now(),
  ): SyncOutboundMessage {
    const extPlayback = (incomingFeed.playback || {}) as Record<string, unknown>;
    const extNowPlaying = sanitizeSyncTrack(incomingFeed.nowPlaying);
    const extAnchorMs = Number(extPlayback.anchorTimestampMs ?? 0);
    const extSeq = Number(extPlayback.commandSeq ?? 0);
    const extSeekSeq = Number(extPlayback.seekSeq ?? 0);
    const extAnchorPos = Number(extPlayback.anchorPositionSeconds ?? extPlayback.positionSeconds ?? 0);
    const extPaused = Boolean(extPlayback.isPaused);

    const sameTrack =
      Boolean(this.anchor.track && extNowPlaying) &&
      ((this.anchor.track?.youtubeVideoId &&
        this.anchor.track.youtubeVideoId === extNowPlaying?.youtubeVideoId) ||
        this.anchor.track?.itemId === extNowPlaying?.itemId);

    const localTimingIsNewer =
      (sameTrack &&
        this.anchor.anchorServerMs > 0 &&
        (extAnchorMs <= 0 || this.anchor.anchorServerMs > extAnchorMs + 150)) ||
      (!sameTrack &&
        this.anchor.seq > 0 &&
        Boolean(this.anchor.track) &&
        ((extAnchorMs > 0 && this.anchor.anchorServerMs > extAnchorMs + 250 && extSeq <= this.anchor.seq) ||
          (!extNowPlaying && extSeq <= this.anchor.seq)));

    if (!localTimingIsNewer) {
      this.anchor = {
        ...this.anchor,
        seq: Math.max(this.anchor.seq + 1, extSeq),
        seekSeq: Math.max(this.anchor.seekSeq, extSeekSeq),
        track: extNowPlaying ?? this.anchor.track,
        isPaused: typeof extPlayback.isPaused === "boolean" ? extPaused : this.anchor.isPaused,
        anchorPositionSec: Number.isFinite(extAnchorPos) ? extAnchorPos : this.anchor.anchorPositionSec,
        anchorServerMs: extAnchorMs > 0 ? extAnchorMs : nowMs,
        volume: typeof extPlayback.volume === "number" ? extPlayback.volume : this.anchor.volume,
        cabinaMuted:
          typeof extPlayback.cabinaMuted === "boolean"
            ? extPlayback.cabinaMuted
            : this.anchor.cabinaMuted,
        tvMuted:
          typeof extPlayback.tvMuted === "boolean" ? extPlayback.tvMuted : this.anchor.tvMuted,
        karaokeMode:
          typeof extPlayback.karaokeMode === "boolean"
            ? extPlayback.karaokeMode
            : this.anchor.karaokeMode,
        displayConfig:
          extPlayback.displayConfig && typeof extPlayback.displayConfig === "object"
            ? (extPlayback.displayConfig as Record<string, unknown>)
            : this.anchor.displayConfig,
        lastCommand:
          typeof extPlayback.lastCommand === "string"
            ? extPlayback.lastCommand
            : this.anchor.lastCommand,
      };
    } else {
      // Keep fresher live playback timing, only refresh display/settings metadata
      if (typeof extPlayback.tvMuted === "boolean") {
        this.anchor.tvMuted = extPlayback.tvMuted;
      }
      if (typeof extPlayback.volume === "number") {
        this.anchor.volume = extPlayback.volume;
      }
      if (typeof extPlayback.karaokeMode === "boolean") {
        this.anchor.karaokeMode = extPlayback.karaokeMode;
      }
      if (extPlayback.displayConfig && typeof extPlayback.displayConfig === "object") {
        this.anchor.displayConfig = extPlayback.displayConfig as Record<string, unknown>;
      }
    }

    this.tvFeed = incomingFeed;
    this.bumpRevision(nowMs);
    this.syncAnchorIntoTvFeed(nowMs);

    return {
      type: "room:snapshot",
      snapshot: this.getSnapshot(nowMs),
      serverNowMs: nowMs,
    };
  }

  /**
   * Reconciles master progress broadcast into the anchor cleanly.
   */
  applyProgressReport(
    report: {
      currentTime: number;
      reportedAtServerMs?: number;
      duration?: number;
      isPaused?: boolean;
      seekSeq?: number;
      forceSeek?: boolean;
      tvMuted?: boolean;
      volume?: number;
      track?: SyncTrack | null;
    },
    nowMs = Date.now(),
  ): SyncOutboundMessage {
    const reportedTrack = report.track ? sanitizeSyncTrack(report.track) : null;
    const isTrackDifferent =
      reportedTrack &&
      (!this.anchor.track ||
        (reportedTrack.youtubeVideoId &&
          reportedTrack.youtubeVideoId !== this.anchor.track.youtubeVideoId));

    const transitSec =
      !report.isPaused &&
      typeof report.reportedAtServerMs === "number" &&
      Number.isFinite(report.reportedAtServerMs)
        ? Math.max(0, Math.min(800, nowMs - report.reportedAtServerMs)) / 1000
        : 0;
    const effectiveCurrentTime = Math.max(0, report.currentTime + transitSec);

    const prevComputed = computeTargetPositionSec(this.anchor, nowMs);
    const timeDiff = Math.abs(prevComputed - effectiveCurrentTime);
    const driftThresholdSec = effectiveCurrentTime < 8 ? 0.06 : 0.1;
    const shouldReanchor =
      Boolean(report.forceSeek) ||
      Boolean(isTrackDifferent) ||
      (typeof report.isPaused === "boolean" && report.isPaused !== this.anchor.isPaused) ||
      timeDiff >= driftThresholdSec;

    if (shouldReanchor) {
      this.anchor = {
        ...this.anchor,
        seq: this.anchor.seq + 1,
        seekSeq:
          typeof report.seekSeq === "number"
            ? Math.max(this.anchor.seekSeq, report.seekSeq)
            : this.anchor.seekSeq + (report.forceSeek ? 1 : 0),
        track: reportedTrack ?? this.anchor.track,
        isPaused:
          typeof report.isPaused === "boolean" ? report.isPaused : this.anchor.isPaused,
        anchorPositionSec: Math.max(0, Math.round(effectiveCurrentTime * 1000) / 1000),
        anchorServerMs: nowMs,
        tvMuted: typeof report.tvMuted === "boolean" ? report.tvMuted : this.anchor.tvMuted,
        volume: typeof report.volume === "number" ? report.volume : this.anchor.volume,
      };
      this.bumpRevision(nowMs);
      this.syncAnchorIntoTvFeed(nowMs);
    }

    return {
      type: "sync:anchor",
      anchor: { ...this.anchor },
      forceSeek: Boolean(report.forceSeek),
      serverNowMs: nowMs,
    };
  }

  private shouldCoordinateBarrier(): boolean {
    let hasMaster = false;
    let hasTv = false;
    for (const c of this.clients.values()) {
      if (c.role === "master") hasMaster = true;
      if (c.role === "tv" || c.role === "lan-bridge") hasTv = true;
    }
    return hasTv && hasMaster;
  }

  private getBarrierParticipantIds(): string[] {
    const ids: string[] = [];
    for (const c of this.clients.values()) {
      if (c.role === "master" || c.role === "tv") {
        ids.push(c.clientId);
      }
    }
    return ids;
  }

  private areExpectedParticipantsReady(barrier: ReadyBarrierState): boolean {
    if (barrier.expectedClientIds.length === 0) return true;
    return barrier.expectedClientIds.every((id) => barrier.readyClientIds.includes(id));
  }

  private releaseBarrier(nowMs: number): SyncOutboundMessage[] {
    if (!this.activeBarrier || this.activeBarrier.released) return [];

    const startAtServerMs = nowMs + this.barrierStartLeadMs;
    this.activeBarrier = {
      ...this.activeBarrier,
      released: true,
      startAtServerMs,
    };

    this.anchor = {
      ...this.anchor,
      seq: this.anchor.seq + 1,
      seekSeq: this.anchor.seekSeq + 1,
      isPaused: false,
      anchorPositionSec: this.activeBarrier.startPositionSec,
      anchorServerMs: startAtServerMs,
    };
    this.bumpRevision(nowMs);
    this.syncAnchorIntoTvFeed(nowMs);

    return [
      {
        type: "sync:go",
        barrierId: this.activeBarrier.barrierId,
        track: this.activeBarrier.track,
        startPositionSec: this.activeBarrier.startPositionSec,
        startAtServerMs,
        anchor: { ...this.anchor },
        serverNowMs: nowMs,
      },
      {
        type: "sync:anchor",
        anchor: { ...this.anchor },
        serverNowMs: nowMs,
      },
    ];
  }

  private bumpRevision(nowMs: number): void {
    this.revision += 1;
    this.updatedAtServerMs = nowMs;
  }

  private syncAnchorIntoTvFeed(nowMs: number): void {
    if (!this.tvFeed) return;
    const prevPlayback = ((this.tvFeed.playback as Record<string, unknown>) || {});
    const livePos = computeTargetPositionSec(this.anchor, nowMs);

    this.tvFeed = {
      ...this.tvFeed,
      nowPlaying: this.anchor.track
        ? {
            ...(this.tvFeed.nowPlaying && typeof this.tvFeed.nowPlaying === "object"
              ? (this.tvFeed.nowPlaying as Record<string, unknown>)
              : {}),
            id: this.anchor.track.itemId,
            trackId: this.anchor.track.trackId,
            title: this.anchor.track.title,
            artist: this.anchor.track.artist,
            youtubeVideoId: this.anchor.track.youtubeVideoId ?? null,
            thumbnailUrl: this.anchor.track.thumbnailUrl ?? null,
            durationSeconds: this.anchor.track.durationSeconds ?? 210,
            voteCount: this.anchor.track.voteCount ?? 0,
            guestName: this.anchor.track.guestName ?? null,
            dedication: this.anchor.track.dedication ?? null,
            isKaraoke: Boolean(this.anchor.track.isKaraoke),
          }
        : this.tvFeed.nowPlaying,
      playback: {
        ...prevPlayback,
        isPaused: this.anchor.isPaused,
        volume: this.anchor.volume,
        isMuted: this.anchor.tvMuted,
        tvMuted: this.anchor.tvMuted,
        cabinaMuted: this.anchor.cabinaMuted,
        karaokeMode: this.anchor.karaokeMode,
        lastCommand: this.anchor.lastCommand,
        commandSeq: this.anchor.seq,
        seekSeq: this.anchor.seekSeq,
        positionSeconds: Math.round(livePos * 100) / 100,
        anchorPositionSeconds: this.anchor.anchorPositionSec,
        anchorTimestampMs: this.anchor.anchorServerMs,
        serverTimeMs: nowMs,
        displayConfig: this.anchor.displayConfig ?? prevPlayback.displayConfig ?? null,
      },
      serverTime: new Date(nowMs).toISOString(),
    };
  }

  /**
   * Merges peer-relayed snapshot/anchor updates (from LAN Hub or Direct P2P master)
   * without clobbering newer room state or dropping anchor updates when tvFeed is absent.
   */
  mergeExternalSnapshotSync(
    payload: {
      tvFeed?: Record<string, unknown> | null;
      anchor?: Partial<PlaybackAnchor>;
      forceSeek?: boolean;
      source?: "cloud" | "lan" | "api" | "direct";
    },
    nowMs = Date.now(),
  ): SyncOutboundMessage[] {
    const outbound: SyncOutboundMessage[] = [];
    const incAnchor = payload.anchor;

    // Never let an empty/stale Cloud bootstrap overwrite an active LAN/Direct room
    const isEmptyBootstrap =
      (!incAnchor || (Number(incAnchor.seq ?? 0) <= 0 && !incAnchor.track)) &&
      (!payload.tvFeed || !sanitizeSyncTrack(payload.tvFeed.nowPlaying));

    if (isEmptyBootstrap && (this.anchor.seq > 0 || Boolean(this.anchor.track))) {
      return [];
    }

    if (payload.tvFeed && typeof payload.tvFeed === "object") {
      if (payload.source === "cloud" && this.anchor.seq > 0) {
        // When local LAN already holds active commands, only refresh queue/feed metadata
        const cloudSeq = Number(
          incAnchor?.seq ??
            ((payload.tvFeed.playback as Record<string, unknown> | undefined)?.commandSeq ?? 0),
        );
        if (cloudSeq > this.anchor.seq) {
          outbound.push(this.mergeExternalTvFeed(payload.tvFeed, nowMs));
        } else {
          this.tvFeed = payload.tvFeed;
          this.syncAnchorIntoTvFeed(nowMs);
        }
      } else {
        outbound.push(this.mergeExternalTvFeed(payload.tvFeed, nowMs));
      }
    }

    if (incAnchor && typeof incAnchor === "object") {
      const incSeq = typeof incAnchor.seq === "number" ? incAnchor.seq : 0;
      const incSeekSeq = typeof incAnchor.seekSeq === "number" ? incAnchor.seekSeq : this.anchor.seekSeq;
      const incTrack =
        incAnchor.track !== undefined
          ? incAnchor.track
            ? sanitizeSyncTrack(incAnchor.track)
            : null
          : this.anchor.track;

      const isFromAuthoritativePeer = payload.source === "lan" || payload.source === "direct";
      const shouldApplyAnchor =
        isFromAuthoritativePeer ||
        this.anchor.seq === 0 ||
        incSeq > this.anchor.seq ||
        (incSeq === this.anchor.seq && incSeekSeq > this.anchor.seekSeq);

      if (shouldApplyAnchor) {
        const incPos =
          typeof incAnchor.anchorPositionSec === "number" && Number.isFinite(incAnchor.anchorPositionSec)
            ? Math.max(0, incAnchor.anchorPositionSec)
            : this.anchor.anchorPositionSec;
        const incPaused =
          typeof incAnchor.isPaused === "boolean" ? incAnchor.isPaused : this.anchor.isPaused;

        this.anchor = {
          ...this.anchor,
          seq: isFromAuthoritativePeer
            ? Math.max(this.anchor.seq + (incSeq > this.anchor.seq || payload.forceSeek ? 1 : 0), incSeq)
            : Math.max(this.anchor.seq, incSeq),
          seekSeq: Math.max(this.anchor.seekSeq, incSeekSeq) + (payload.forceSeek ? 1 : 0),
          track: incAnchor.track !== undefined ? incTrack : this.anchor.track,
          isPaused: incPaused,
          anchorPositionSec: Math.round(incPos * 1000) / 1000,
          anchorServerMs: nowMs,
          volume: typeof incAnchor.volume === "number" ? incAnchor.volume : this.anchor.volume,
          cabinaMuted:
            typeof incAnchor.cabinaMuted === "boolean"
              ? incAnchor.cabinaMuted
              : this.anchor.cabinaMuted,
          tvMuted: typeof incAnchor.tvMuted === "boolean" ? incAnchor.tvMuted : this.anchor.tvMuted,
          karaokeMode:
            typeof incAnchor.karaokeMode === "boolean"
              ? incAnchor.karaokeMode
              : this.anchor.karaokeMode,
          lastCommand:
            typeof incAnchor.lastCommand === "string" || incAnchor.lastCommand === null
              ? incAnchor.lastCommand
              : this.anchor.lastCommand,
          displayConfig:
            incAnchor.displayConfig !== undefined
              ? incAnchor.displayConfig
              : this.anchor.displayConfig,
        };

        this.bumpRevision(nowMs);
        this.syncAnchorIntoTvFeed(nowMs);
        outbound.push({
          type: "sync:anchor",
          anchor: { ...this.anchor },
          forceSeek: Boolean(payload.forceSeek),
          serverNowMs: nowMs,
        });
      }
    }

    return outbound;
  }
}

