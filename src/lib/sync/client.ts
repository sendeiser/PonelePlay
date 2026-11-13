"use client";

import {
  computeClockOffsetSample,
  mergeClockOffset,
  type ClockSyncEstimate,
  type PlaybackAnchor,
  type RoomPresenceSummary,
  type SyncInboundMessage,
  type SyncOutboundMessage,
  type SyncRole,
  type SyncRoomSnapshot,
  type SyncTrack,
} from "./protocol";

export type SyncClientTransport = "lan" | "cloud" | "connecting" | "offline";

export interface SyncStatusState {
  transport: SyncClientTransport;
  connected: boolean;
  rttMs: number | null;
  offsetMs: number;
  presence: RoomPresenceSummary | null;
  lanEndpoints: string[];
}

type OutboundListener<T extends SyncOutboundMessage["type"]> = (
  msg: Extract<SyncOutboundMessage, { type: T }>,
) => void;

export interface PoneleSyncClientOptions {
  slug: string;
  role: SyncRole;
  deviceId?: string;
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
  private clockEstimate: ClockSyncEstimate | null = null;
  private presence: RoomPresenceSummary | null = null;
  private lanEndpoints: string[] = [];
  private runtimeCloudWsUrl = "";
  private latestSnapshot: SyncRoomSnapshot | null = null;
  private refCount = 0;
  private disposed = false;

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
    return Boolean(
      getConfiguredCloudWsUrl(this.runtimeCloudWsUrl) ||
        this.role === "master" ||
        isLocalHttpContext(),
    );
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getStatus(): SyncStatusState {
    return {
      transport: this.activeTransport,
      connected: this.isConnected(),
      rttMs: this.clockEstimate?.bestRttMs ?? null,
      offsetMs: this.clockEstimate?.offsetMs ?? 0,
      presence: this.presence,
      lanEndpoints: [...this.lanEndpoints],
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
    return this.send({
      type: "sync:ready",
      barrierId,
      clientId: this.clientId,
      role: this.role,
    });
  }

  sendProgress(report: {
    currentTime: number;
    duration?: number;
    isPaused?: boolean;
    isFromAdminAudio?: boolean;
    seekSeq?: number;
    forceSeek?: boolean;
    tvMuted?: boolean;
    volume?: number;
    track?: SyncTrack | null;
  }): boolean {
    return this.send({
      type: "sync:progress",
      ...report,
    });
  }

  sendPartyEvent(payload: Record<string, unknown>): boolean {
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
      source: this.activeTransport === "lan" ? "lan" : "cloud",
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
    const qs = new URLSearchParams({
      role: this.role,
      clientId: this.clientId,
    });
    if (this.deviceId) qs.set("deviceId", this.deviceId);

    // Master running under HTTPS can securely connect to loopback 127.0.0.1 LAN Hub
    if (this.role === "master") {
      const lanQs = new URLSearchParams(qs);
      if (cloudBase) lanQs.set("cloudUrl", cloudBase);
      if (originUrl) lanQs.set("originUrl", originUrl);
      candidates.push({
        mode: "lan",
        url: `ws://127.0.0.1:${lanPort}/ws/${encodeURIComponent(this.slug)}?${lanQs.toString()}`,
      });
    } else if (isLocalHttpContext()) {
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
      candidates.push({
        mode: "cloud",
        url: `${cloudBase}/ws/${encodeURIComponent(this.slug)}?${qs.toString()}`,
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

        // If Cabina fell back to Cloud WS, silently probe local LAN Hub every 15s in case DJ starts it
        if (target.mode === "cloud" && this.role === "master") {
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

  private handleOutbound(msg: SyncOutboundMessage): void {
    if (msg.type === "clock:pong") {
      const sample = computeClockOffsetSample(msg.clientSentMs, msg.serverNowMs, Date.now());
      this.clockEstimate = mergeClockOffset(this.clockEstimate, sample);
      this.emitStatus();
      return;
    }

    if (msg.type === "room:snapshot") {
      this.latestSnapshot = msg.snapshot;
      this.presence = msg.snapshot.connectedClients;
      if (Array.isArray(msg.snapshot.lanEndpoints)) {
        this.lanEndpoints = msg.snapshot.lanEndpoints;
      }
      this.emitStatus();
      for (const cb of this.listeners["room:snapshot"]) cb(msg);
      return;
    }

    if (msg.type === "room:presence") {
      this.presence = msg.connectedClients;
      if (Array.isArray(msg.lanEndpoints)) {
        this.lanEndpoints = msg.lanEndpoints;
      }
      this.emitStatus();
      for (const cb of this.listeners["room:presence"]) cb(msg);
      return;
    }

    if (msg.type === "sync:anchor") {
      for (const cb of this.listeners["sync:anchor"]) cb(msg);
      return;
    }

    if (msg.type === "sync:preload") {
      for (const cb of this.listeners["sync:preload"]) cb(msg);
      return;
    }

    if (msg.type === "sync:go") {
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
    this.clockBurstTimers.push(setTimeout(sendPing, 80));
    this.clockBurstTimers.push(setTimeout(sendPing, 180));
    this.clockBurstTimers.push(setTimeout(sendPing, 320));
    this.clockBurstTimers.push(setTimeout(sendPing, 550));
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send("ping");
        sendPing();
      }
    }, 12_000);
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
