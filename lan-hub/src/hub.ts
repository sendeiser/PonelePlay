import http from "node:http";
import os from "node:os";
import { WebSocket, WebSocketServer } from "ws";
import { Bonjour } from "bonjour-service";
import type {
  PlaybackAnchor,
  SyncInboundMessage,
  SyncOutboundMessage,
  SyncRole,
  SyncRoomSnapshot,
} from "../../src/lib/sync/protocol";
import { SyncRoomEngine } from "../../src/lib/sync/room-engine";
import { getLocalLanAddresses, getPrimaryLanIp } from "./network";

export interface LanHubOptions {
  port?: number;
  host?: string;
  defaultCloudWsUrl?: string;
  defaultOriginUrl?: string;
  enableMdns?: boolean;
}

interface LanClientMeta {
  clientId: string;
  role: SyncRole;
  deviceId?: string;
  slug: string;
  joinedAtMs: number;
}

interface LanRoomRuntime {
  slug: string;
  engine: SyncRoomEngine;
  sockets: Map<WebSocket, LanClientMeta>;
  barrierTimer: ReturnType<typeof setTimeout> | null;
  cloudUrl: string;
  originUrl: string;
  cloudWs: WebSocket | null;
  cloudConnected: boolean;
  cloudReconnectTimer: ReturnType<typeof setTimeout> | null;
  cloudPingTimer: ReturnType<typeof setInterval> | null;
  lastHydrateAtMs: number;
}

function normalizeRole(raw: string | null): SyncRole {
  if (raw === "master" || raw === "tv" || raw === "lan-bridge") return raw;
  return "client";
}

function setCorsHeaders(res: http.ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Access-Control-Request-Private-Network");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
}

function renderStatusHtml(status: ReturnType<PoneleLanHub["getStatusSnapshot"]>): string {
  const realIps = status.lanIps.filter((i) => !i.isVirtual);
  const displayIps = realIps.length > 0 ? realIps : status.lanIps;
  const ipsHtml =
    displayIps.length > 0
      ? displayIps
          .map(
            (i) =>
              `<div class="ip-pill">${i.address}:${status.port} <span>(${i.interfaceName}${i.isVirtual ? " · virtual" : ""})</span></div>`,
          )
          .join("")
      : `<div class="ip-pill">Sin IP Wi-Fi/LAN detectada (solo localhost:${status.port})</div>`;

  const roomsHtml =
    status.rooms.length > 0
      ? status.rooms
          .map(
            (r) => `
          <div class="room-card">
            <div class="room-head">
              <strong>${r.slug}</strong>
              <span class="badge ${r.cloudConnected ? "ok" : "warn"}">${r.cloudConnected ? "Bridge Cloud Activo" : "Solo LAN"}</span>
            </div>
            <div class="meta">Cabina: ${r.presence.masterCount} · TVs: ${r.presence.tvCount} · Clientes: ${r.presence.clientCount} · Rev: ${r.revision}</div>
          </div>`,
          )
          .join("")
      : `<p class="muted">Todavía no hay salas activas. Abrí tu Panel Cabina en este navegador y se conectará automáticamente.</p>`;

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>PonelePlay LAN Hub</title>
  <meta http-equiv="refresh" content="5" />
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #0b1020; color: #e2e8f0; margin: 0; padding: 32px; }
    .wrap { max-width: 780px; margin: 0 auto; }
    .hero { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
    h1 { margin: 0; font-size: 24px; color: #ffffff; }
    .ready-pill { background: rgba(16,185,129,0.18); color: #34d399; border: 1px solid rgba(16,185,129,0.45); border-radius: 999px; padding: 6px 14px; font-size: 13px; font-weight: 700; }
    .sub { color: #94a3b8; font-size: 14px; margin-bottom: 20px; }
    .card { background: #131b31; border: 1px solid #243154; border-radius: 16px; padding: 20px; margin-bottom: 16px; }
    .ip-pill { background: #0b1020; border: 1px solid #334155; border-radius: 10px; padding: 10px 14px; font-family: ui-monospace, monospace; font-size: 15px; font-weight: 700; color: #38bdf8; margin-top: 8px; }
    .ip-pill span { color: #94a3b8; font-size: 12px; font-weight: 400; }
    .room-card { background: #0f1629; border: 1px solid #263458; border-radius: 12px; padding: 12px 14px; margin-top: 10px; }
    .room-head { display: flex; justify-content: space-between; align-items: center; }
    .badge { font-size: 11px; padding: 3px 8px; border-radius: 999px; font-weight: 700; }
    .badge.ok { background: rgba(16,185,129,0.18); color: #34d399; border: 1px solid rgba(16,185,129,0.4); }
    .badge.warn { background: rgba(251,191,36,0.15); color: #fbbf24; border: 1px solid rgba(251,191,36,0.35); }
    .meta, .muted { color: #94a3b8; font-size: 13px; margin-top: 8px; line-height: 1.5; }
    .tip { background: rgba(56,189,248,0.08); border: 1px solid rgba(56,189,248,0.28); border-radius: 12px; padding: 14px; font-size: 13px; color: #bae6fd; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <h1>⚡ PonelePlay LAN Hub Local</h1>
      <span class="ready-pill">LISTO · NO CIERRES ESTA VENTANA (podés minimizarla)</span>
    </div>
    <div class="sub">Sincronización local (&lt;2ms) en la misma red Wi-Fi/LAN + auto-descubrimiento automático en Android TV.</div>
    <div class="card">
      <strong>Cómo se conectan las pantallas automáticamente:</strong>
      ${ipsHtml}
      <div class="meta">mDNS local: ${status.mdnsPublished ? "✅ _poneleplay._tcp.local. (activo)" : "⚪ Desactivado"} · Puerto TCP: ${status.port}</div>
      <div class="tip">
        1. Dejá esta app corriendo minimizada mientras dure el evento.<br/>
        2. Abrí tu Panel Cabina en Chrome/Edge: se conectará a LAN automáticamente.<br/>
        3. Tus Android TV en el mismo Wi-Fi reciben esta dirección sola vía Cloud/mDNS o escaneo en 1 click.
      </div>
    </div>
    <div class="card">
      <strong>Salas activas (${status.rooms.length})</strong>
      ${roomsHtml}
    </div>
  </div>
</body>
</html>`;
}

/**
 * Local LAN WebSocket Hub + mDNS Broadcaster + Bidirectional Cloud Bridge.
 */
export class PoneleLanHub {
  private readonly port: number;
  private readonly host: string;
  private readonly defaultCloudWsUrl: string;
  private readonly defaultOriginUrl: string;
  private readonly enableMdns: boolean;

  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private bonjour: Bonjour | null = null;
  private mdnsService: ReturnType<Bonjour["publish"]> | null = null;
  private mdnsPublished = false;
  private rooms = new Map<string, LanRoomRuntime>();
  private actualPort: number;

  constructor(options: LanHubOptions = {}) {
    this.port = options.port ?? 4321;
    this.actualPort = this.port;
    this.host = options.host ?? "0.0.0.0";
    this.defaultCloudWsUrl = (options.defaultCloudWsUrl || "").trim();
    this.defaultOriginUrl = (options.defaultOriginUrl || "https://poneleplay.netlify.app")
      .trim()
      .replace(/\/+$/, "");
    this.enableMdns = options.enableMdns ?? true;
  }

  getListeningPort(): number {
    return this.actualPort;
  }

  private getAdvertisedLanEndpoints(): string[] {
    const lanIps = getLocalLanAddresses();
    const real = lanIps.filter((item) => !item.isVirtual);
    const preferred = real.length > 0 ? real : lanIps;
    return preferred.map((item) => `${item.address}:${this.actualPort}`);
  }

  getStatusSnapshot() {
    const lanIps = getLocalLanAddresses();
    const rooms = Array.from(this.rooms.values()).map((r) => ({
      slug: r.slug,
      revision: r.engine.getSnapshot().revision,
      presence: r.engine.getPresenceSummary(),
      cloudConnected: r.cloudConnected,
      cloudUrl: r.cloudUrl || null,
    }));
    return {
      ok: true,
      service: "poneleplay-lan-hub",
      port: this.actualPort,
      primaryIp: getPrimaryLanIp(),
      lanIps,
      mdnsPublished: this.mdnsPublished,
      rooms,
      timestamp: Date.now(),
    };
  }

  async start(): Promise<void> {
    if (this.server) return;

    this.server = http.createServer((req, res) => {
      void this.handleHttpRequest(req, res);
    });

    this.wss = new WebSocketServer({ noServer: true });
    this.server.on("upgrade", (req, socket, head) => {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] !== "ws" || !parts[1]) {
        socket.destroy();
        return;
      }

      this.wss?.handleUpgrade(req, socket, head, (ws) => {
        this.handleWsConnection(ws, decodeURIComponent(parts[1]).trim(), url);
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(this.port, this.host, () => {
        const addr = this.server!.address();
        if (addr && typeof addr === "object") {
          this.actualPort = addr.port;
        }
        resolve();
      });
    });

    if (this.enableMdns) {
      this.publishMdns();
    }
  }

  async stop(): Promise<void> {
    if (this.mdnsService?.stop) {
      await new Promise<void>((resolve) => this.mdnsService!.stop!(() => resolve()));
      this.mdnsService = null;
      this.mdnsPublished = false;
    }
    if (this.bonjour) {
      try {
        this.bonjour.destroy();
      } catch {
        // ignore
      }
      this.bonjour = null;
    }

    for (const room of this.rooms.values()) {
      if (room.barrierTimer) clearTimeout(room.barrierTimer);
      if (room.cloudReconnectTimer) clearTimeout(room.cloudReconnectTimer);
      if (room.cloudPingTimer) clearInterval(room.cloudPingTimer);
      try {
        room.cloudWs?.close();
      } catch {
        // ignore
      }
      for (const sock of room.sockets.keys()) {
        try {
          sock.close();
        } catch {
          // ignore
        }
      }
    }
    this.rooms.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
      this.server = null;
    }
  }

  private publishMdns(): void {
    try {
      this.bonjour = new Bonjour();
      const hostname = os.hostname().replace(/[^a-zA-Z0-9-]/g, "").slice(0, 20) || "cabina";
      const primaryIp = getPrimaryLanIp() || "127.0.0.1";
      const slugs = Array.from(this.rooms.keys()).join(",");

      this.mdnsService = this.bonjour.publish({
        name: `PonelePlay-${hostname}`,
        type: "poneleplay",
        protocol: "tcp",
        port: this.actualPort,
        txt: {
          app: "poneleplay",
          ip: primaryIp,
          port: String(this.actualPort),
          slugs,
        },
      });
      this.mdnsPublished = true;
    } catch {
      this.mdnsPublished = false;
    }
  }

  private republishMdnsIfNeeded(): void {
    if (!this.enableMdns || !this.bonjour) return;
    try {
      this.mdnsService?.stop?.();
    } catch {
      // ignore
    }
    try {
      this.bonjour.destroy();
    } catch {
      // ignore
    }
    this.bonjour = null;
    this.publishMdns();
  }

  private getOrCreateRoom(slug: string, cloudUrlHint?: string, originUrlHint?: string): LanRoomRuntime {
    let room = this.rooms.get(slug);
    const cleanCloud = (cloudUrlHint || this.defaultCloudWsUrl).trim();
    const cleanOrigin = (originUrlHint || this.defaultOriginUrl).trim().replace(/\/+$/, "");

    if (!room) {
      room = {
        slug,
        engine: new SyncRoomEngine(slug),
        sockets: new Map(),
        barrierTimer: null,
        cloudUrl: cleanCloud,
        originUrl: cleanOrigin,
        cloudWs: null,
        cloudConnected: false,
        cloudReconnectTimer: null,
        cloudPingTimer: null,
        lastHydrateAtMs: 0,
      };
      this.rooms.set(slug, room);
      this.republishMdnsIfNeeded();
    } else {
      if (cleanCloud && cleanCloud !== room.cloudUrl) {
        room.cloudUrl = cleanCloud;
        this.ensureCloudBridge(room);
      }
      if (cleanOrigin && cleanOrigin !== room.originUrl) {
        room.originUrl = cleanOrigin;
      }
    }

    if (room.cloudUrl && !room.cloudWs && !room.cloudReconnectTimer) {
      this.ensureCloudBridge(room);
    }

    return room;
  }

  private async handleHttpRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    setCorsHeaders(res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const parts = url.pathname.split("/").filter(Boolean);

    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(this.getStatusSnapshot()));
      return;
    }

    if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderStatusHtml(this.getStatusSnapshot()));
      return;
    }

    if (parts[0] === "room" && parts[1] && parts[2] === "state") {
      const slug = decodeURIComponent(parts[1]).trim();
      const room = this.getOrCreateRoom(slug);
      if (!room.engine.getSnapshot().tvFeed) {
        await this.hydrateRoomFromOrigin(room, true);
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, snapshot: room.engine.getSnapshot(Date.now()) }));
      return;
    }

    if (parts[0] === "api" && parts[1] === "tv" && parts[2]) {
      const slug = decodeURIComponent(parts[2]).trim();
      const room = this.getOrCreateRoom(slug);
      if (!room.engine.getSnapshot().tvFeed) {
        await this.hydrateRoomFromOrigin(room, true);
      }
      const tvFeed = room.engine.getSnapshot(Date.now()).tvFeed;
      if (tvFeed) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(tvFeed));
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "room_not_hydrated" }));
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "not_found" }));
  }

  private handleWsConnection(ws: WebSocket, slug: string, url: URL): void {
    const role = normalizeRole(url.searchParams.get("role"));
    const deviceId = url.searchParams.get("deviceId") || undefined;
    const clientId =
      url.searchParams.get("clientId")?.trim() ||
      `${role}-${Math.random().toString(36).slice(2, 10)}`;
    const cloudUrlHint = url.searchParams.get("cloudUrl") || undefined;
    const originUrlHint = url.searchParams.get("originUrl") || undefined;

    const room = this.getOrCreateRoom(slug, cloudUrlHint, originUrlHint);
    const nowMs = Date.now();
    const meta: LanClientMeta = {
      clientId,
      role,
      deviceId,
      slug,
      joinedAtMs: nowMs,
    };

    room.sockets.set(ws, meta);
    const presenceMsg = room.engine.upsertClient(meta);

    if (!room.engine.getSnapshot().tvFeed && room.originUrl) {
      void this.hydrateRoomFromOrigin(room, false);
    }

    this.sendToSocket(ws, {
      type: "room:snapshot",
      snapshot: room.engine.getSnapshot(nowMs),
      serverNowMs: nowMs,
    });
    this.broadcastLocal(room, [presenceMsg], ws);

    ws.on("message", (raw) => {
      const text = typeof raw === "string" ? raw : raw.toString("utf8");
      if (text === "ping") {
        ws.send("pong");
        return;
      }

      let msg: SyncInboundMessage;
      try {
        msg = JSON.parse(text) as SyncInboundMessage;
      } catch {
        return;
      }

      this.handleLocalMessage(room, ws, meta, msg);
    });

    ws.on("close", () => {
      room.sockets.delete(ws);
      const outbound = room.engine.removeClient(meta.clientId, Date.now());
      this.broadcastLocal(room, outbound, ws);
      this.relayAnchorToCloud(room, outbound);
    });

    ws.on("error", () => {
      room.sockets.delete(ws);
    });
  }

  private handleLocalMessage(
    room: LanRoomRuntime,
    ws: WebSocket,
    meta: LanClientMeta,
    msg: SyncInboundMessage,
  ): void {
    const nowMs = Date.now();

    if (msg.type === "clock:ping") {
      this.sendToSocket(ws, {
        type: "clock:pong",
        clientSentMs: msg.clientSentMs,
        serverNowMs: nowMs,
      });
      return;
    }

    if (msg.type === "room:join") {
      meta.role = msg.role || meta.role;
      meta.clientId = msg.clientId || meta.clientId;
      meta.deviceId = msg.deviceId ?? meta.deviceId;
      const presence = room.engine.upsertClient(meta);
      this.sendToSocket(ws, {
        type: "room:snapshot",
        snapshot: room.engine.getSnapshot(nowMs),
        serverNowMs: nowMs,
      });
      this.broadcastLocal(room, [presence], ws);
      return;
    }

    if (msg.type === "state:refresh_request") {
      void this.hydrateRoomFromOrigin(room, true);
      return;
    }

    if (msg.type === "playback:command") {
      const { outbound, nextAlarmMs } = room.engine.applyPlaybackCommand(
        msg.command,
        msg.payload || {},
        nowMs,
        { useBarrier: msg.useBarrier },
      );

      this.scheduleBarrierTimeout(room, nextAlarmMs);
      this.broadcastLocal(room, outbound);
      this.relayAnchorToCloud(room, outbound);
      return;
    }

    if (msg.type === "sync:ready") {
      const clientId = msg.clientId || meta.clientId;
      const outbound = room.engine.markReady(msg.barrierId, clientId, nowMs);
      if (outbound.length > 0) {
        if (room.barrierTimer) {
          clearTimeout(room.barrierTimer);
          room.barrierTimer = null;
        }
        this.broadcastLocal(room, outbound);
        this.relayAnchorToCloud(room, outbound);
      }
      return;
    }

    if (msg.type === "lan:announce") {
      return;
    }

    if (msg.type === "sync:progress") {
      const prevRev = room.engine.getSnapshot(nowMs).revision;
      const anchorMsg = room.engine.applyProgressReport(msg, nowMs);
      const nextRev = room.engine.getSnapshot(nowMs).revision;
      if (nextRev !== prevRev || msg.forceSeek) {
        this.broadcastLocal(room, [anchorMsg], ws);
        this.relayAnchorToCloud(room, [anchorMsg]);
      }
      return;
    }

    if (msg.type === "party:event") {
      this.broadcastLocal(
        room,
        [
          {
            type: "party:event",
            payload: msg.payload,
            serverNowMs: nowMs,
          },
        ],
        ws,
      );
      this.sendToCloud(room, msg);
      return;
    }

    if (msg.type === "room:snapshot_sync" && msg.tvFeed) {
      const snapshotMsg = room.engine.mergeExternalTvFeed(msg.tvFeed, nowMs);
      this.broadcastLocal(room, [snapshotMsg], ws);
    }
  }

  private scheduleBarrierTimeout(room: LanRoomRuntime, deadlineMs: number | null): void {
    if (room.barrierTimer) {
      clearTimeout(room.barrierTimer);
      room.barrierTimer = null;
    }
    if (!deadlineMs) return;

    const delayMs = Math.max(10, deadlineMs - Date.now());
    room.barrierTimer = setTimeout(() => {
      room.barrierTimer = null;
      const released = room.engine.checkBarrierDeadline(Date.now());
      if (released.length > 0) {
        this.broadcastLocal(room, released);
        this.relayAnchorToCloud(room, released);
      }
    }, delayMs);
  }

  private ensureCloudBridge(room: LanRoomRuntime): void {
    if (!room.cloudUrl) return;
    if (room.cloudWs && (room.cloudWs.readyState === WebSocket.OPEN || room.cloudWs.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const base = room.cloudUrl.replace(/\/+$/, "");
    const bridgeClientId = `lan-hub-${encodeURIComponent(os.hostname())}`;
    const initialEndpoints = this.getAdvertisedLanEndpoints();
    const lanQuery =
      initialEndpoints.length > 0
        ? `&lanEndpoints=${encodeURIComponent(initialEndpoints.join(","))}`
        : "";
    const target = `${base}/ws/${encodeURIComponent(room.slug)}?role=lan-bridge&clientId=${bridgeClientId}${lanQuery}`;

    try {
      const cloudWs = new WebSocket(target);
      room.cloudWs = cloudWs;
      let lastAnnouncedKey = initialEndpoints.join(",");

      cloudWs.on("open", () => {
        room.cloudConnected = true;
        const currentEndpoints = this.getAdvertisedLanEndpoints();
        lastAnnouncedKey = currentEndpoints.join(",");
        try {
          cloudWs.send(
            JSON.stringify({
              type: "room:join",
              slug: room.slug,
              role: "lan-bridge",
              clientId: `lan-hub-${os.hostname()}`,
              lanEndpoints: currentEndpoints,
            } satisfies SyncInboundMessage),
          );
        } catch {
          // ignore
        }
        const openNowMs = Date.now();
        const currentSnap = room.engine.getSnapshot(openNowMs);
        if (currentSnap.anchor.seq > 0) {
          this.relayAnchorToCloud(room, [
            { type: "sync:anchor", anchor: currentSnap.anchor, serverNowMs: openNowMs },
          ]);
        }
        if (room.cloudPingTimer) clearInterval(room.cloudPingTimer);
        room.cloudPingTimer = setInterval(() => {
          if (cloudWs.readyState === WebSocket.OPEN) {
            cloudWs.send("ping");
            const refreshed = this.getAdvertisedLanEndpoints();
            const nextKey = refreshed.join(",");
            if (nextKey !== lastAnnouncedKey) {
              lastAnnouncedKey = nextKey;
              try {
                cloudWs.send(
                  JSON.stringify({
                    type: "lan:announce",
                    lanEndpoints: refreshed,
                  } satisfies SyncInboundMessage),
                );
              } catch {
                // ignore
              }
            }
          }
        }, 20_000);
      });

      cloudWs.on("message", (raw) => {
        const text = typeof raw === "string" ? raw : raw.toString("utf8");
        if (text === "pong") return;

        let msg: SyncOutboundMessage;
        try {
          msg = JSON.parse(text) as SyncOutboundMessage;
        } catch {
          return;
        }

        const nowMs = Date.now();
        if (msg.type === "room:snapshot") {
          const mergedOutbound = room.engine.mergeExternalSnapshotSync(
            {
              tvFeed: msg.snapshot.tvFeed,
              anchor: msg.snapshot.anchor,
              source: "cloud",
            },
            nowMs,
          );
          if (mergedOutbound.length > 0) {
            this.broadcastLocal(room, mergedOutbound);
          }
          // If LAN Hub already has newer live commands than Cloud's snapshot, push LAN state up to Cloud
          const localSnap = room.engine.getSnapshot(nowMs);
          if (localSnap.anchor.seq > (msg.snapshot.anchor?.seq ?? 0)) {
            this.relayAnchorToCloud(room, [
              { type: "sync:anchor", anchor: localSnap.anchor, serverNowMs: nowMs },
            ]);
          }
        } else if (msg.type === "party:event") {
          this.broadcastLocal(room, [msg]);
        } else if (msg.type === "sync:anchor") {
          // Only adopt remote Cloud commands if they advance sequence beyond LAN master
          const localSnap = room.engine.getSnapshot(nowMs);
          if (
            msg.anchor.seq > localSnap.anchor.seq &&
            msg.anchor.anchorServerMs > localSnap.anchor.anchorServerMs + 100
          ) {
            const tvFeed = {
              ...(localSnap.tvFeed || {}),
              nowPlaying: msg.anchor.track
                ? { ...msg.anchor.track, id: msg.anchor.track.itemId }
                : localSnap.tvFeed?.nowPlaying,
              playback: {
                ...((localSnap.tvFeed?.playback as Record<string, unknown>) || {}),
                isPaused: msg.anchor.isPaused,
                volume: msg.anchor.volume,
                tvMuted: msg.anchor.tvMuted,
                cabinaMuted: msg.anchor.cabinaMuted,
                karaokeMode: msg.anchor.karaokeMode,
                commandSeq: msg.anchor.seq,
                seekSeq: msg.anchor.seekSeq,
                anchorPositionSeconds: msg.anchor.anchorPositionSec,
                anchorTimestampMs: msg.anchor.anchorServerMs,
                lastCommand: msg.anchor.lastCommand,
              },
            };
            const merged = room.engine.mergeExternalTvFeed(tvFeed, nowMs);
            this.broadcastLocal(room, [merged]);
          }
        }
      });

      const scheduleReconnect = () => {
        room.cloudConnected = false;
        room.cloudWs = null;
        if (room.cloudPingTimer) {
          clearInterval(room.cloudPingTimer);
          room.cloudPingTimer = null;
        }
        if (room.cloudReconnectTimer || !this.server) return;
        room.cloudReconnectTimer = setTimeout(() => {
          room.cloudReconnectTimer = null;
          if (room.cloudUrl && this.server) {
            this.ensureCloudBridge(room);
          }
        }, 4000);
      };

      cloudWs.on("close", scheduleReconnect);
      cloudWs.on("error", scheduleReconnect);
    } catch {
      room.cloudConnected = false;
    }
  }

  private relayAnchorToCloud(room: LanRoomRuntime, outbound: SyncOutboundMessage[]): void {
    if (!room.cloudWs || room.cloudWs.readyState !== WebSocket.OPEN) return;
    const anchorOrGo = outbound.find(
      (m): m is Extract<SyncOutboundMessage, { type: "sync:go" | "sync:anchor" }> =>
        m.type === "sync:go" || m.type === "sync:anchor",
    );
    const hasSnapshot = outbound.some((m) => m.type === "room:snapshot");
    if (!anchorOrGo && !hasSnapshot) return;

    const nowMs = Date.now();
    const snap: SyncRoomSnapshot = room.engine.getSnapshot(nowMs);
    const anchorToSync = anchorOrGo?.anchor ?? snap.anchor;
    const rawElapsedSec =
      !anchorToSync.isPaused && anchorToSync.anchorServerMs > 0
        ? Math.max(0, (nowMs - anchorToSync.anchorServerMs) / 1000)
        : 0;
    const livePos =
      Math.round((Math.max(0, anchorToSync.anchorPositionSec) + rawElapsedSec) * 1000) / 1000;
    const forceSeek =
      anchorOrGo?.type === "sync:anchor" ? Boolean(anchorOrGo.forceSeek) : false;

    this.sendToCloud(room, {
      type: "room:snapshot_sync",
      tvFeed: snap.tvFeed ?? null,
      anchor: {
        ...anchorToSync,
        anchorPositionSec: livePos,
        anchorServerMs: nowMs,
      },
      forceSeek,
      source: "lan",
    });
  }

  private sendToCloud(room: LanRoomRuntime, msg: SyncInboundMessage): void {
    if (room.cloudWs && room.cloudWs.readyState === WebSocket.OPEN) {
      try {
        room.cloudWs.send(JSON.stringify(msg));
      } catch {
        // ignore transient drop
      }
    }
  }

  private async hydrateRoomFromOrigin(room: LanRoomRuntime, force: boolean): Promise<void> {
    if (!room.originUrl) return;
    const nowMs = Date.now();
    if (!force && nowMs - room.lastHydrateAtMs < 15_000) return;
    room.lastHydrateAtMs = nowMs;

    try {
      const res = await fetch(
        `${room.originUrl}/api/tv/${encodeURIComponent(room.slug)}?internalSync=1`,
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) return;
      const data = (await res.json()) as Record<string, unknown>;
      if (!data?.ok) return;
      const snapshotMsg = room.engine.mergeExternalTvFeed(data, Date.now());
      this.broadcastLocal(room, [snapshotMsg]);
    } catch {
      // LAN standalone tolerance when offline
    }
  }

  private sendToSocket(ws: WebSocket, msg: SyncOutboundMessage): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // ignore
    }
  }

  private broadcastLocal(
    room: LanRoomRuntime,
    messages: SyncOutboundMessage[],
    exclude?: WebSocket,
  ): void {
    if (messages.length === 0) return;
    const payloads = messages.map((m) => JSON.stringify(m));
    for (const sock of room.sockets.keys()) {
      if (exclude && sock === exclude) continue;
      if (sock.readyState !== WebSocket.OPEN) continue;
      for (const raw of payloads) {
        try {
          sock.send(raw);
        } catch {
          // ignore
        }
      }
    }
  }
}
