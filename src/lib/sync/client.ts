"use client";

import {
  computeClockOffsetSample,
  mergeClockOffset,
  type ClockSyncEstimate,
  type PlaybackAnchor,
  type RoomPresenceSummary,
  type SyncInboundMessage,
  type SyncOutboundMessage,
  type SyncPeerInfo,
  type SyncPreferenceMode,
  type SyncRole,
  type SyncRoomSnapshot,
  type SyncTrack,
} from "./protocol";
import { SyncRoomEngine } from "./room-engine";
import { DirectP2PManager, type DirectP2PStats } from "./webrtc-direct";

export type SyncClientTransport = "lan" | "direct" | "cloud" | "connecting" | "offline";

export const SYNC_PREFERENCE_STORAGE_KEY = "poneleplay_sync_mode";

export function getSavedSyncPreferenceMode(): SyncPreferenceMode {
  if (typeof window === "undefined") return "cloud";
  try {
    const raw = window.localStorage?.getItem(SYNC_PREFERENCE_STORAGE_KEY);
    if (raw === "direct" || raw === "lan" || raw === "cloud") {
      return raw;
    }
  } catch {
    // Ignore storage access restrictions
  }
  return "cloud";
}

export function setSavedSyncPreferenceMode(mode: SyncPreferenceMode): void {
  if (typeof window === "undefined") return;
  try {
    const normalized = mode === "direct" || mode === "lan" ? mode : "cloud";
    window.localStorage?.setItem(SYNC_PREFERENCE_STORAGE_KEY, normalized);
  } catch {
    // Ignore storage access restrictions
  }
}

export interface SyncStatusState {
  transport: SyncClientTransport;
  preferenceMode: SyncPreferenceMode;
  connected: boolean;
  rttMs: number | null;
  offsetMs: number;
  presence: RoomPresenceSummary | null;
  lanEndpoints: string[];
  peers: SyncPeerInfo[];
  directStats: DirectP2PStats | null;
}

type OutboundListener<T extends SyncOutboundMessage["type"]> = (
  msg: Extract<SyncOutboundMessage, { type: T }>,
) => void;

export interface PoneleSyncClientOptions {
  slug: string;
  role: SyncRole;
  deviceId?: string;
  mode?: SyncPreferenceMode;
}

export function normalizeSyncWsUrl(raw?: string | null): string {
  if (!raw || typeof raw !== "string") return "";
  let cleaned = raw.trim().replace(/\/+$/, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("https://")) {
    cleaned = `wss://${cleaned.slice("https://".length)}`;
  } else if (cleaned.startsWith("http://")) {
    cleaned = `ws://${cleaned.slice("http://".length)}`;
  } else if (!cleaned.startsWith("wss://") && !cleaned.startsWith("ws://")) {
    cleaned = `wss://${cleaned}`;
  }
  return cleaned;
}

function getConfiguredCloudWsUrl(runtimeOverride?: string): string {
  if (runtimeOverride) {
    return normalizeSyncWsUrl(runtimeOverride);
  }
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_SYNC_WS_URL) {
    return normalizeSyncWsUrl(process.env.NEXT_PUBLIC_SYNC_WS_URL);
  }
  return "";
}

function getConfiguredLanPort(): number {
  const raw =
    typeof process !== "undefined" ? process.env?.NEXT_PUBLIC_LAN_HUB_PORT : undefined;
  const parsed = Number(raw || 4321);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 4321;
}

function isLocalHttpContext(): boolean {
  if (typeof window === "undefined") return false;
  const proto = window.location.protocol;
  const host = window.location.hostname;
  return (
    proto === "http:" &&
    (host === "localhost" ||
      host === "127.0.0.1" ||
      host.startsWith("192.168.") ||
      host.startsWith("10.") ||
      host.startsWith("172."))
  );
}

/**
 * Dual-path WebSocket sync client prioritizing local LAN Hub (< 2ms) on Cabina
 * and Cloudflare Workers Durable Objects in the cloud, with NTP-lite clock sync.
 */
export class PoneleSyncClient {
  readonly slug: string;
  readonly role: SyncRole;
  readonly clientId: string;
  readonly deviceId?: string;

  private ws: WebSocket | null = null;
  private activeTransport: SyncClientTransport = "offline";
  private preferenceMode: SyncPreferenceMode;
  private clockEstimate: ClockSyncEstimate | null = null;
  private presence: RoomPresenceSummary | null = null;
  private lanEndpoints: string[] = [];
  private peers: SyncPeerInfo[] = [];
  private runtimeCloudWsUrl = "";
  private latestSnapshot: SyncRoomSnapshot | null = null;
  private refCount = 0;
  private disposed = false;

  private directP2P: DirectP2PManager | null = null;
  private directEngine: SyncRoomEngine | null = null;
  private directBarrierTimer: ReturnType<typeof setTimeout> | null = null;
  private lastDirectInboundMs = 0;
  private lastDirectAnchor: PlaybackAnchor | null = null;
  private lastDirectProgressRelayMs = 0;

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lanRetryTimer: ReturnType<typeof setInterval> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private clockBurstTimers: Array<ReturnType<typeof setTimeout>> = [];
  private attemptCounter = 0;

  private listeners = {
    "room:snapshot": new Set<OutboundListener<"room:snapshot">>(),
    "sync:anchor": new Set<OutboundListener<"sync:anchor">>(),
    "sync:preload": new Set<OutboundListener<"sync:preload">>(),
    "sync:go": new Set<OutboundListener<"sync:go">>(),
    "party:event": new Set<OutboundListener<"party:event">>(),
    "room:presence": new Set<OutboundListener<"room:presence">>(),
  };
  private statusListeners = new Set<(status: SyncStatusState) => void>();

  constructor(options: PoneleSyncClientOptions) {
    this.slug = options.slug;
    this.role = options.role;
    this.deviceId = options.deviceId;
    this.clientId = `${options.role}-${Math.random().toString(36).slice(2, 10)}`;
    this.preferenceMode = options.mode ?? getSavedSyncPreferenceMode();
    if (this.role === "master" || this.role === "tv") {
      this.directP2P = new DirectP2PManager({
        slug: this.slug,
        clientId: this.clientId,
        role: this.role,
        onSendSignal: (signal) => {
          this.send({
            type: "rtc:signal",
            targetClientId: signal.targetClientId,
            signalType: signal.signalType,
            sdp: signal.sdp,
            candidate: signal.candidate,
          });
        },
        onDirectMessage: (payload) => {
          this.handleDirectPayload(payload);
        },
        onStatsChange: () => {
          if (this.role === "master" && this.getEffectivePreferenceMode() === "direct") {
            this.syncDirectEngineClients();
          }
          this.emitStatus();
        },
      });
    }
  }

  getPreferenceMode(): SyncPreferenceMode {
    return this.getEffectivePreferenceMode();
  }

  private getEffectivePreferenceMode(): Exclude<SyncPreferenceMode, "auto"> {
    if (this.preferenceMode === "direct" || this.preferenceMode === "lan" || this.preferenceMode === "cloud") {
      return this.preferenceMode;
    }
    return isLocalHttpContext() ? "lan" : "cloud";
  }

  setPreferenceMode(mode: SyncPreferenceMode): void {
    const normalized: Exclude<SyncPreferenceMode, "auto"> =
      mode === "direct" || mode === "lan" ? mode : "cloud";
    setSavedSyncPreferenceMode(normalized);
    if (this.preferenceMode === normalized) {
      this.emitStatus();
      return;
    }
    this.preferenceMode = normalized;

    if (normalized === "direct") {
      this.stopLanProbeLoop();
      this.startDirectModeRuntime();
      if (this.activeTransport === "lan") {
        this.reconnectNow(true);
      } else if (this.isConnected()) {
        this.send({
          type: "rtc:signal",
          signalType: "direct-ready",
          directEnabled: true,
        });
      } else {
        this.reconnectNow(true);
      }
      this.emitStatus();
      return;
    }

    this.stopDirectModeRuntime();
    if (this.isConnected()) {
      this.send({
        type: "rtc:signal",
        signalType: "direct-ready",
        directEnabled: false,
      });
    }

    if (normalized === "lan") {
      this.reconnectNow(true);
    } else {
      // Pure Cloud mode: never probe or connect to local 127.0.0.1 behind Netlify
      this.stopLanProbeLoop();
      if (this.activeTransport === "lan") {
        this.reconnectNow(true);
      }
    }
    this.emitStatus();
  }

  retain(): void {
    this.refCount += 1;
    this.disposed = false;
    if (!this.ws && this.activeTransport === "offline") {
      this.connect();
    }
  }

  release(): void {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount === 0) {
      this.destroy();
    }
  }

  hasTargetsConfigured(): boolean {
    const mode = this.getEffectivePreferenceMode();
    return Boolean(
      getConfiguredCloudWsUrl(this.runtimeCloudWsUrl) ||
        (this.role === "master" && mode === "lan") ||
        isLocalHttpContext(),
    );
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private isDirectActive(): boolean {
    if (!this.directP2P?.isEnabled() || !this.directP2P.hasOpenPeer()) return false;
    if (this.role === "master") {
      return this.getEffectivePreferenceMode() === "direct";
    }
    if (this.role === "tv") {
      return (
        this.directP2P.getDirectClock() !== null ||
        Date.now() - this.lastDirectInboundMs < 15_000
      );
    }
    return false;
  }

  getStatus(): SyncStatusState {
    const directStats = this.directP2P?.getStats() ?? null;
    const directActive = this.isDirectActive();
    const effectiveTransport: SyncClientTransport =
      this.activeTransport === "cloud" && directActive
        ? "direct"
        : this.activeTransport === "offline" && directActive && this.directP2P?.hasOpenPeer()
          ? "direct"
          : this.activeTransport;
    const directRtt = directStats?.bestDirectRttMs ?? null;
    return {
      transport: effectiveTransport,
      preferenceMode: this.getEffectivePreferenceMode(),
      connected: this.isConnected() || directActive,
      rttMs: directActive ? (directRtt ?? (directStats?.broadcastPeerCount ? 1 : this.clockEstimate?.bestRttMs ?? null)) : (this.clockEstimate?.bestRttMs ?? null),
      offsetMs: directActive
        ? (this.role === "master" ? 0 : (this.directP2P?.getDirectClock()?.offsetMs ?? 0))
        : (this.clockEstimate?.offsetMs ?? 0),
      presence: this.presence,
      lanEndpoints: [...this.lanEndpoints],
      peers: [...this.peers],
      directStats,
    };
  }

  setRuntimeCloudWsUrl(url?: string | null): void {
    const normalized = normalizeSyncWsUrl(url);
    if (!normalized || normalized === this.runtimeCloudWsUrl) return;
    const prevEffective = getConfiguredCloudWsUrl(this.runtimeCloudWsUrl);
    this.runtimeCloudWsUrl = normalized;
    if (!this.disposed && this.refCount > 0 && !prevEffective && this.activeTransport !== "lan") {
      this.attemptCounter = 0;
      if (this.activeTransport === "offline" && !this.ws) {
        this.connect();
      } else {
        this.reconnectNow(true);
      }
    }
  }

  reconnectNow(preferLan = true): void {
    if (this.disposed) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (preferLan) {
      this.attemptCounter = 0;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // handled cleanly in onclose
      }
      return;
    }
    if (this.refCount > 0) {
      this.connect();
    }
  }

  async probeLocalLanHubOnce(): Promise<boolean> {
    if (typeof fetch !== "function") return false;
    const lanPort = getConfiguredLanPort();
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeout = ctrl ? setTimeout(() => ctrl.abort(), 900) : null;
    try {
      const res = await fetch(`http://127.0.0.1:${lanPort}/health`, {
        cache: "no-store",
        signal: ctrl?.signal,
      });
      if (res.ok) {
        this.stopLanProbeLoop();
        if (this.activeTransport !== "lan") {
          this.reconnectNow(true);
        }
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  getLatestSnapshot(): SyncRoomSnapshot | null {
    return this.latestSnapshot;
  }

  estimatedServerMs(): number {
    if (this.isDirectActive()) {
      if (this.role === "master") return Date.now();
      return Date.now() + (this.directP2P?.getDirectClock()?.offsetMs ?? 0);
    }
    return Date.now() + (this.clockEstimate?.offsetMs ?? 0);
  }

  /**
   * Computes remaining local delay in ms until an authoritative server epoch timestamp arrives.
   */
  msUntilServerTime(targetServerMs: number): number {
    return Math.max(0, targetServerMs - this.estimatedServerMs());
  }

  onStatus(cb: (status: SyncStatusState) => void): () => void {
    this.statusListeners.add(cb);
    cb(this.getStatus());
    return () => {
      this.statusListeners.delete(cb);
    };
  }

  on<K extends keyof typeof this.listeners>(
    event: K,
    cb: OutboundListener<K>,
  ): () => void {
    const set = this.listeners[event] as unknown as Set<OutboundListener<K>>;
    set.add(cb);
    return () => {
      set.delete(cb);
    };
  }

  sendCommand(
    command: string,
    payload: Record<string, unknown> = {},
    options?: { useBarrier?: boolean },
  ): boolean {
    if (
      this.role === "master" &&
      this.getEffectivePreferenceMode() === "direct" &&
      this.directP2P?.hasOpenPeer()
    ) {
      const engine = this.ensureDirectEngine();
      this.syncDirectEngineClients();
      const nowMs = Date.now();
      const { outbound, nextAlarmMs } = engine.applyPlaybackCommand(command, payload, nowMs, {
        useBarrier: options?.useBarrier ?? true,
      });
      this.dispatchDirectOutboundBatch(outbound);
      this.scheduleDirectBarrierAlarm(nextAlarmMs);
      const snap = engine.getSnapshot(nowMs);
      this.send({
        type: "room:snapshot_sync",
        tvFeed: snap.tvFeed,
        anchor: snap.anchor,
        forceSeek: command === "seek",
        source: "direct",
      });
      return true;
    }

    return this.send({
      type: "playback:command",
      command,
      payload,
      useBarrier: options?.useBarrier,
    });
  }

  sendSkip(expectedVideoId?: string, payload: Record<string, unknown> = {}): boolean {
    return this.sendCommand("skip", {
      ...payload,
      ...(expectedVideoId ? { expectedVideoId } : {}),
    });
  }

  sendReady(barrierId: string): boolean {
    if (
      this.role === "master" &&
      this.getEffectivePreferenceMode() === "direct" &&
      this.directEngine
    ) {
      const outbound = this.directEngine.markReady(barrierId, this.clientId, Date.now());
      if (outbound.length > 0) {
        this.dispatchDirectOutboundBatch(outbound);
        const snap = this.directEngine.getSnapshot(Date.now());
        this.send({
          type: "room:snapshot_sync",
          tvFeed: snap.tvFeed,
          anchor: snap.anchor,
          source: "direct",
        });
        return true;
      }
    }

    if (
      this.role === "tv" &&
      this.isDirectActive() &&
      this.directP2P?.sendPayload({
        type: "sync:ready",
        barrierId,
        clientId: this.clientId,
        role: this.role,
      })
    ) {
      return true;
    }

    return this.send({
      type: "sync:ready",
      barrierId,
      clientId: this.clientId,
      role: this.role,
    });
  }

  sendProgress(report: {
    currentTime: number;
    reportedAtServerMs?: number;
    duration?: number;
    isPaused?: boolean;
    isFromAdminAudio?: boolean;
    seekSeq?: number;
    forceSeek?: boolean;
    tvMuted?: boolean;
    volume?: number;
    track?: SyncTrack | null;
  }): boolean {
    const nowMs = Date.now();
    if (
      this.role === "master" &&
      this.getEffectivePreferenceMode() === "direct" &&
      this.directP2P?.hasOpenPeer()
    ) {
      const engine = this.ensureDirectEngine();
      const prevRev = engine.getSnapshot(nowMs).revision;
      const anchorMsg = engine.applyProgressReport(
        {
          ...report,
          reportedAtServerMs: nowMs,
        },
        nowMs,
      );
      const nextRev = engine.getSnapshot(nowMs).revision;
      if (nextRev !== prevRev || report.forceSeek) {
        this.directP2P.sendPayload(anchorMsg);
        if (report.forceSeek || nowMs - this.lastDirectProgressRelayMs >= 1_000) {
          this.lastDirectProgressRelayMs = nowMs;
          this.send({
            type: "room:snapshot_sync",
            anchor: (anchorMsg as Extract<SyncOutboundMessage, { type: "sync:anchor" }>).anchor,
            forceSeek: Boolean(report.forceSeek),
            source: "direct",
          });
        }
      }
      return true;
    }

    const observedServerMs =
      report.reportedAtServerMs ??
      (this.clockEstimate ? this.estimatedServerMs() : undefined);
    return this.send({
      type: "sync:progress",
      ...report,
      ...(observedServerMs !== undefined ? { reportedAtServerMs: observedServerMs } : {}),
    });
  }

  sendPartyEvent(payload: Record<string, unknown>): boolean {
    if (
      this.role === "master" &&
      this.getEffectivePreferenceMode() === "direct" &&
      this.directP2P?.hasOpenPeer()
    ) {
      this.directP2P.sendPayload({
        type: "party:event",
        payload,
        serverNowMs: Date.now(),
      });
    }
    return this.send({
      type: "party:event",
      payload,
    });
  }

  requestRefresh(): boolean {
    return this.send({ type: "state:refresh_request" });
  }

  pushSnapshot(tvFeed: Record<string, unknown>, anchor?: Partial<PlaybackAnchor>): boolean {
    return this.send({
      type: "room:snapshot_sync",
      tvFeed,
      anchor,
      source:
        this.activeTransport === "lan"
          ? "lan"
          : this.getEffectivePreferenceMode() === "direct"
            ? "direct"
            : "cloud",
    });
  }

  private send(msg: SyncInboundMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  private emitStatus(): void {
    const st = this.getStatus();
    for (const cb of this.statusListeners) {
      try {
        cb(st);
      } catch {
        // ignore listener failure
      }
    }
  }

  private buildTargetCandidates(): Array<{ mode: "lan" | "cloud"; url: string }> {
    const candidates: Array<{ mode: "lan" | "cloud"; url: string }> = [];
    const cloudBase = getConfiguredCloudWsUrl(this.runtimeCloudWsUrl);
    const originUrl = typeof window !== "undefined" ? window.location.origin : "";
    const lanPort = getConfiguredLanPort();
    const prefMode = this.getEffectivePreferenceMode();
    const qs = new URLSearchParams({
      role: this.role,
      clientId: this.clientId,
    });
    if (this.deviceId) qs.set("deviceId", this.deviceId);

    // Only attempt localhost LAN Hub on master when LAN mode is explicitly selected
    if (this.role === "master" && prefMode === "lan") {
      const lanQs = new URLSearchParams(qs);
      if (cloudBase) lanQs.set("cloudUrl", cloudBase);
      if (originUrl) lanQs.set("originUrl", originUrl);
      candidates.push({
        mode: "lan",
        url: `ws://127.0.0.1:${lanPort}/ws/${encodeURIComponent(this.slug)}?${lanQs.toString()}`,
      });
    } else if (isLocalHttpContext() && prefMode !== "cloud" && prefMode !== "direct") {
      const host = window.location.hostname;
      const lanQs = new URLSearchParams(qs);
      if (cloudBase) lanQs.set("cloudUrl", cloudBase);
      if (originUrl) lanQs.set("originUrl", originUrl);
      candidates.push({
        mode: "lan",
        url: `ws://${host}:${lanPort}/ws/${encodeURIComponent(this.slug)}?${lanQs.toString()}`,
      });
    }

    if (cloudBase) {
      const cloudQs = new URLSearchParams(qs);
      if (prefMode === "direct" && this.role === "master") {
        cloudQs.set("direct", "1");
      }
      candidates.push({
        mode: "cloud",
        url: `${cloudBase}/ws/${encodeURIComponent(this.slug)}?${cloudQs.toString()}`,
      });
    }

    return candidates;
  }

  private connect(): void {
    if (this.disposed || typeof WebSocket === "undefined") return;
    const candidates = this.buildTargetCandidates();
    if (candidates.length === 0) {
      this.activeTransport = "offline";
      this.emitStatus();
      return;
    }

    const idx = this.attemptCounter % candidates.length;
    const target = candidates[idx];
    this.activeTransport = "connecting";
    this.emitStatus();

    let opened = false;
    try {
      const ws = new WebSocket(target.url);
      this.ws = ws;

      const connectTimeout = setTimeout(() => {
        if (!opened && ws.readyState === WebSocket.CONNECTING) {
          try {
            ws.close();
          } catch {
            // ignore
          }
        }
      }, target.mode === "lan" ? 850 : 4500);

      ws.onopen = () => {
        clearTimeout(connectTimeout);
        if (this.disposed || this.ws !== ws) {
          ws.close();
          return;
        }
        opened = true;
        this.attemptCounter = 0;
        this.activeTransport = target.mode;
        this.emitStatus();
        this.startClockSync();

        if (this.getEffectivePreferenceMode() === "direct" && target.mode === "cloud") {
          this.startDirectModeRuntime();
          this.send({
            type: "rtc:signal",
            signalType: "direct-ready",
            directEnabled: true,
          });
        }

        // Only probe local LAN Hub in background when user explicitly enabled LAN mode
        if (
          target.mode === "cloud" &&
          this.role === "master" &&
          this.getEffectivePreferenceMode() === "lan"
        ) {
          this.startLanProbeLoop();
        } else {
          this.stopLanProbeLoop();
        }
      };

      ws.onmessage = (ev) => {
        if (typeof ev.data !== "string" || ev.data === "pong") return;
        let parsed: SyncOutboundMessage;
        try {
          parsed = JSON.parse(ev.data) as SyncOutboundMessage;
        } catch {
          return;
        }
        this.handleOutbound(parsed);
      };

      ws.onclose = () => {
        clearTimeout(connectTimeout);
        this.stopClockSync();
        if (this.ws === ws) {
          this.ws = null;
          this.activeTransport = "offline";
          this.emitStatus();
        }
        if (!this.disposed && this.refCount > 0) {
          this.attemptCounter += 1;
          const delayMs = !opened && candidates.length > 1 ? 150 : 2500;
          this.scheduleReconnect(delayMs);
        }
      };

      ws.onerror = () => {
        // Handled cleanly by onclose failover
      };
    } catch {
      this.attemptCounter += 1;
      this.activeTransport = "offline";
      this.emitStatus();
      this.scheduleReconnect(2500);
    }
  }

  private startDirectModeRuntime(): void {
    if (!this.directP2P) return;
    this.directP2P.start();
    if (this.role === "master") {
      this.ensureDirectEngine();
      this.syncDirectEngineClients();
      if (this.peers.length > 0) {
        this.directP2P.syncPeers(this.peers);
      }
    }
  }

  private stopDirectModeRuntime(): void {
    if (this.directBarrierTimer) {
      clearTimeout(this.directBarrierTimer);
      this.directBarrierTimer = null;
    }
    this.lastDirectInboundMs = 0;
    this.lastDirectAnchor = null;
    this.directP2P?.stop();
  }

  private ensureDirectEngine(): SyncRoomEngine {
    if (!this.directEngine) {
      this.directEngine = new SyncRoomEngine(this.slug);
      if (this.latestSnapshot) {
        this.directEngine.mergeExternalSnapshotSync(
          {
            tvFeed: this.latestSnapshot.tvFeed,
            anchor: this.latestSnapshot.anchor,
            source: "cloud",
          },
          Date.now(),
        );
      }
    }
    return this.directEngine;
  }

  private syncDirectEngineClients(): void {
    const engine = this.directEngine;
    if (!engine) return;
    const nowMs = Date.now();
    const activeDirectTvIds = new Set(this.directP2P?.getOpenPeerClientIds() ?? []);

    engine.upsertClient({
      clientId: this.clientId,
      role: this.role,
      deviceId: this.deviceId,
      joinedAtMs: nowMs,
      directEnabled: true,
    });

    // Remove peers that aren't open on Direct P2P so Cloud-only TVs never block Direct barriers
    for (const existingPeer of engine.getPeers()) {
      if (existingPeer.clientId === this.clientId) continue;
      if (!activeDirectTvIds.has(existingPeer.clientId)) {
        engine.removeClient(existingPeer.clientId, nowMs);
      }
    }

    for (const tvId of activeDirectTvIds) {
      const peerMeta = this.peers.find((p) => p.clientId === tvId);
      engine.upsertClient({
        clientId: tvId,
        role: "tv",
        deviceId: peerMeta?.deviceId,
        joinedAtMs: nowMs,
        directEnabled: true,
      });
    }
  }

  private scheduleDirectBarrierAlarm(nextAlarmMs: number | null): void {
    if (this.directBarrierTimer) {
      clearTimeout(this.directBarrierTimer);
      this.directBarrierTimer = null;
    }
    if (!nextAlarmMs) return;
    const delayMs = Math.max(40, nextAlarmMs - Date.now());
    this.directBarrierTimer = setTimeout(() => {
      this.directBarrierTimer = null;
      if (!this.directEngine || this.disposed) return;
      const released = this.directEngine.checkBarrierDeadline(Date.now());
      if (released.length > 0) {
        this.dispatchDirectOutboundBatch(released);
        const snap = this.directEngine.getSnapshot(Date.now());
        this.send({
          type: "room:snapshot_sync",
          tvFeed: snap.tvFeed,
          anchor: snap.anchor,
          source: "direct",
        });
      }
    }, delayMs);
  }

  private dispatchDirectOutboundBatch(outbound: SyncOutboundMessage[]): void {
    for (const msg of outbound) {
      this.directP2P?.sendPayload(msg);
      this.handleOutbound(msg, "direct");
    }
  }

  private handleDirectPayload(
    payload: SyncOutboundMessage | SyncInboundMessage,
  ): void {
    if (this.role === "master") {
      if (payload.type === "sync:ready" && this.directEngine) {
        const outbound = this.directEngine.markReady(
          payload.barrierId,
          payload.clientId,
          Date.now(),
        );
        if (outbound.length > 0) {
          this.dispatchDirectOutboundBatch(outbound);
          const snap = this.directEngine.getSnapshot(Date.now());
          this.send({
            type: "room:snapshot_sync",
            tvFeed: snap.tvFeed,
            anchor: snap.anchor,
            source: "direct",
          });
        }
      }
      return;
    }

    if (payload.type === "party:event") {
      this.lastDirectInboundMs = Date.now();
      const serverNowMs =
        "serverNowMs" in payload && typeof payload.serverNowMs === "number"
          ? payload.serverNowMs
          : Date.now();
      this.handleOutbound(
        {
          type: "party:event",
          payload: payload.payload,
          serverNowMs,
        },
        "direct",
      );
      return;
    }

    if (
      payload.type === "sync:anchor" ||
      payload.type === "sync:preload" ||
      payload.type === "sync:go" ||
      payload.type === "room:snapshot"
    ) {
      this.lastDirectInboundMs = Date.now();
      this.handleOutbound(payload, "direct");
    }
  }

  private handleOutbound(msg: SyncOutboundMessage, source: "ws" | "direct" = "ws"): void {
    if (msg.type === "clock:pong") {
      const sample = computeClockOffsetSample(msg.clientSentMs, msg.serverNowMs, Date.now());
      this.clockEstimate = mergeClockOffset(this.clockEstimate, sample);
      this.emitStatus();
      return;
    }

    if (msg.type === "rtc:signal") {
      void this.directP2P?.handleSignal(msg);
      return;
    }

    if (msg.type === "room:snapshot") {
      this.latestSnapshot = msg.snapshot;
      this.presence = msg.snapshot.connectedClients;
      if (Array.isArray(msg.snapshot.lanEndpoints)) {
        this.lanEndpoints = msg.snapshot.lanEndpoints;
      }
      if (Array.isArray(msg.snapshot.peers)) {
        this.peers = msg.snapshot.peers;
        if (this.role === "master" && this.getEffectivePreferenceMode() === "direct") {
          this.syncDirectEngineClients();
          this.directP2P?.syncPeers(this.peers);
        } else if (
          this.role === "tv" &&
          this.peers.some((p) => p.role === "master" && p.directEnabled)
        ) {
          this.directP2P?.start();
        }
      }
      if (this.role === "master" && this.directEngine && source === "ws") {
        this.directEngine.mergeExternalSnapshotSync(
          {
            tvFeed: msg.snapshot.tvFeed,
            anchor: msg.snapshot.anchor,
            source: "cloud",
          },
          Date.now(),
        );
      }
      const snapshotToEmit =
        source === "ws" && this.role === "tv" && this.isDirectActive() && this.lastDirectAnchor
          ? {
              ...msg,
              snapshot: {
                ...msg.snapshot,
                anchor: this.lastDirectAnchor,
              },
            }
          : msg;
      this.emitStatus();
      for (const cb of this.listeners["room:snapshot"]) cb(snapshotToEmit);
      return;
    }

    if (msg.type === "room:presence") {
      this.presence = msg.connectedClients;
      if (Array.isArray(msg.lanEndpoints)) {
        this.lanEndpoints = msg.lanEndpoints;
      }
      if (Array.isArray(msg.peers)) {
        this.peers = msg.peers;
        if (this.role === "master" && this.getEffectivePreferenceMode() === "direct") {
          this.syncDirectEngineClients();
          this.directP2P?.syncPeers(this.peers);
        } else if (
          this.role === "tv" &&
          this.peers.some((p) => p.role === "master" && p.directEnabled)
        ) {
          this.directP2P?.start();
        }
      }
      this.emitStatus();
      for (const cb of this.listeners["room:presence"]) cb(msg);
      return;
    }

    // When Direct P2P is delivering sub-5ms timing directly on TV, ignore trailing Cloud timing duplicates
    if (
      source === "ws" &&
      this.role === "tv" &&
      this.isDirectActive() &&
      Date.now() - this.lastDirectInboundMs < 15_000 &&
      (msg.type === "sync:anchor" || msg.type === "sync:preload" || msg.type === "sync:go")
    ) {
      return;
    }

    if (msg.type === "sync:anchor") {
      if (source === "direct") {
        this.lastDirectAnchor = msg.anchor;
      }
      for (const cb of this.listeners["sync:anchor"]) cb(msg);
      return;
    }

    if (msg.type === "sync:preload") {
      for (const cb of this.listeners["sync:preload"]) cb(msg);
      return;
    }

    if (msg.type === "sync:go") {
      if (source === "direct") {
        this.lastDirectAnchor = msg.anchor;
      }
      for (const cb of this.listeners["sync:go"]) cb(msg);
      return;
    }

    if (msg.type === "party:event") {
      for (const cb of this.listeners["party:event"]) cb(msg);
    }
  }

  private startClockSync(): void {
    this.stopClockSync();
    const sendPing = () => {
      this.send({ type: "clock:ping", clientSentMs: Date.now() });
    };
    sendPing();
    this.clockBurstTimers.push(setTimeout(sendPing, 60));
    this.clockBurstTimers.push(setTimeout(sendPing, 140));
    this.clockBurstTimers.push(setTimeout(sendPing, 260));
    this.clockBurstTimers.push(setTimeout(sendPing, 450));
    this.clockBurstTimers.push(setTimeout(sendPing, 800));
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send("ping");
        sendPing();
      }
    }, 10_000);
  }

  private stopClockSync(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    for (const t of this.clockBurstTimers) clearTimeout(t);
    this.clockBurstTimers = [];
  }

  private startLanProbeLoop(): void {
    if (this.lanRetryTimer) return;
    const lanPort = getConfiguredLanPort();
    this.lanRetryTimer = setInterval(async () => {
      if (this.disposed || this.activeTransport === "lan") return;
      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timeout = ctrl ? setTimeout(() => ctrl.abort(), 900) : null;
      try {
        const res = await fetch(`http://127.0.0.1:${lanPort}/health`, {
          cache: "no-store",
          signal: ctrl?.signal,
        });
        if (res.ok && !this.disposed && (this.activeTransport as SyncClientTransport) !== "lan") {
          this.stopLanProbeLoop();
          this.attemptCounter = 0;
          try {
            this.ws?.close();
          } catch {
            // reconnect triggers immediately on LAN
          }
        }
      } catch {
        // LAN Hub still offline
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    }, 12_000);
  }

  private stopLanProbeLoop(): void {
    if (this.lanRetryTimer) {
      clearInterval(this.lanRetryTimer);
      this.lanRetryTimer = null;
    }
  }

  private scheduleReconnect(delayMs: number): void {
    if (this.reconnectTimer || this.disposed) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.disposed && this.refCount > 0) {
        this.connect();
      }
    }, delayMs);
  }

  private destroy(): void {
    this.disposed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopLanProbeLoop();
    this.stopClockSync();
    this.stopDirectModeRuntime();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.activeTransport = "offline";
  }
}

const registry = new Map<string, PoneleSyncClient>();

export function acquireSyncClient(options: PoneleSyncClientOptions): PoneleSyncClient {
  const key = `${options.role}:${options.slug}:${options.deviceId || ""}`;
  let client = registry.get(key);
  if (!client) {
    client = new PoneleSyncClient(options);
    registry.set(key, client);
  } else if (options.mode) {
    client.setPreferenceMode(options.mode);
  }
  client.retain();
  return client;
}

export function releaseSyncClient(client: PoneleSyncClient): void {
  const key = `${client.role}:${client.slug}:${client.deviceId || ""}`;
  client.release();
  if (!client.isConnected() && client.getStatus().transport === "offline") {
    const stored = registry.get(key);
    if (stored === client) {
      registry.delete(key);
    }
  }
}

export function findActiveSyncClient(slug: string): PoneleSyncClient | null {
  for (const client of registry.values()) {
    if (client.slug === slug && client.isConnected()) {
      return client;
    }
  }
  return null;
}

export function triggerRoomSyncRefresh(
  slug: string,
  options?: { partyEvent?: Record<string, unknown> | null },
): void {
  if (!slug || typeof window === "undefined") return;
  const activeClient = findActiveSyncClient(slug);
  if (activeClient) {
    if (options?.partyEvent) {
      activeClient.sendPartyEvent(options.partyEvent);
    }
    activeClient.requestRefresh();
    return;
  }

  if (typeof fetch === "function") {
    void fetch("/api/sync/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        partyEvent: options?.partyEvent ?? null,
      }),
    }).catch(() => {});
  }
}
