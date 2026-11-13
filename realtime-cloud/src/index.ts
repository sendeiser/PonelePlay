import { DurableObject } from "cloudflare:workers";
import type {
  SyncInboundMessage,
  SyncOutboundMessage,
  SyncRole,
} from "../../src/lib/sync/protocol";
import {
  SyncRoomEngine,
  type SerializedRoomEngineState,
} from "../../src/lib/sync/room-engine";

export interface Env {
  SYNC_ROOMS: DurableObjectNamespace<PoneleSyncRoom>;
  NEXT_APP_ORIGIN?: string;
  SYNC_SHARED_SECRET?: string;
}

interface SocketAttachment {
  clientId: string;
  role: SyncRole;
  deviceId?: string;
  slug: string;
  joinedAtMs: number;
  lanEndpoints?: string[];
  directEnabled?: boolean;
}

function parseLanEndpointsParam(raw: string | null): string[] | undefined {
  if (!raw) return undefined;
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : undefined;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

function normalizeRole(raw: string | null): SyncRole {
  if (raw === "master" || raw === "tv" || raw === "lan-bridge") return raw;
  return "client";
}

function isAuthorized(req: Request, env: Env): boolean {
  const secret = env.SYNC_SHARED_SECRET?.trim();
  if (!secret) return true;
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const segments = url.pathname.split("/").filter(Boolean);

    if (url.pathname === "/" || url.pathname === "/health") {
      return jsonResponse({
        ok: true,
        service: "poneleplay-sync",
        runtime: "cloudflare-durable-objects",
        timestamp: Date.now(),
      });
    }

    // WebSocket endpoint: GET /ws/:slug?role=master|tv|client|lan-bridge&clientId=...
    if (segments[0] === "ws" && segments[1]) {
      const slug = decodeURIComponent(segments[1]).trim();
      const id = env.SYNC_ROOMS.idFromName(slug);
      const stub = env.SYNC_ROOMS.get(id);
      const forwardUrl = new URL(request.url);
      forwardUrl.pathname = "/ws";
      forwardUrl.searchParams.set("slug", slug);
      return stub.fetch(new Request(forwardUrl.toString(), request));
    }

    // Room snapshot read endpoint: GET /room/:slug/state
    if (segments[0] === "room" && segments[1] && segments[2] === "state" && request.method === "GET") {
      const slug = decodeURIComponent(segments[1]).trim();
      const id = env.SYNC_ROOMS.idFromName(slug);
      const stub = env.SYNC_ROOMS.get(id);
      return stub.fetch(new Request(`https://sync.internal/state?slug=${encodeURIComponent(slug)}`));
    }

    // Internal webhook pushed by Next.js API mutations: POST /internal/room/:slug/notify
    if (
      segments[0] === "internal" &&
      segments[1] === "room" &&
      segments[2] &&
      segments[3] === "notify" &&
      request.method === "POST"
    ) {
      if (!isAuthorized(request, env)) {
        return jsonResponse({ ok: false, error: "unauthorized" }, 401);
      }
      const slug = decodeURIComponent(segments[2]).trim();
      const id = env.SYNC_ROOMS.idFromName(slug);
      const stub = env.SYNC_ROOMS.get(id);
      const bodyText = await request.text();
      return stub.fetch(
        new Request(`https://sync.internal/notify?slug=${encodeURIComponent(slug)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: bodyText,
        }),
      );
    }

    return jsonResponse({ ok: false, error: "not_found" }, 404);
  },
};

export class PoneleSyncRoom extends DurableObject<Env> {
  private engine: SyncRoomEngine | null = null;
  private slug = "";

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS room_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          slug TEXT NOT NULL,
          state_json TEXT NOT NULL
        )
      `);
    });
  }

  private loadEngine(slugHint?: string): SyncRoomEngine {
    if (this.engine) {
      if (slugHint && !this.slug) this.slug = slugHint;
      return this.engine;
    }

    let restored: SerializedRoomEngineState | null = null;
    const rows = this.ctx.storage.sql
      .exec<{ slug: string; state_json: string }>("SELECT slug, state_json FROM room_state WHERE id = 1")
      .toArray();

    if (rows.length > 0) {
      this.slug = rows[0].slug || slugHint || "";
      try {
        restored = JSON.parse(rows[0].state_json) as SerializedRoomEngineState;
      } catch {
        restored = null;
      }
    } else {
      this.slug = slugHint || "default";
    }

    const engine = restored
      ? SyncRoomEngine.restore(restored)
      : new SyncRoomEngine(this.slug || "default");

    // Re-attach surviving WebSockets across hibernation isolates
    for (const ws of this.ctx.getWebSockets()) {
      const meta = ws.deserializeAttachment() as SocketAttachment | null;
      if (meta?.clientId) {
        if (!this.slug && meta.slug) this.slug = meta.slug;
        engine.upsertClient({
          clientId: meta.clientId,
          role: meta.role,
          deviceId: meta.deviceId,
          joinedAtMs: meta.joinedAtMs,
          lanEndpoints: meta.lanEndpoints,
        });
      }
    }

    this.engine = engine;
    return engine;
  }

  private persistEngine(): void {
    if (!this.engine) return;
    const serialized = JSON.stringify(this.engine.serialize());
    this.ctx.storage.sql.exec(
      `INSERT INTO room_state (id, slug, state_json)
       VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET slug = excluded.slug, state_json = excluded.state_json`,
      this.slug || "default",
      serialized,
    );
  }

  private broadcast(messages: SyncOutboundMessage[], exclude?: WebSocket): void {
    if (messages.length === 0) return;
    const payloads = messages.map((m) => JSON.stringify(m));
    for (const client of this.ctx.getWebSockets()) {
      if (exclude && client === exclude) continue;
      if (client.readyState !== WebSocket.OPEN) continue;
      for (const raw of payloads) {
        try {
          client.send(raw);
        } catch {
          // Ignore broken pipe; webSocketClose cleans up
        }
      }
    }
  }

  private async hydrateFromOrigin(slug: string, force = false): Promise<Record<string, unknown> | null> {
    const engine = this.loadEngine(slug);
    const snap = engine.getSnapshot();
    const ageMs = Date.now() - snap.updatedAtServerMs;
    if (!force && snap.tvFeed && ageMs < 60_000) {
      return snap.tvFeed;
    }

    const origin = (this.env.NEXT_APP_ORIGIN || "https://poneleplay.netlify.app").replace(/\/+$/, "");
    try {
      const res = await fetch(`${origin}/api/tv/${encodeURIComponent(slug)}?internalSync=1`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as Record<string, unknown>;
      if (!data?.ok) return null;
      const snapshotMsg = engine.mergeExternalTvFeed(data, Date.now());
      this.persistEngine();
      this.broadcast([snapshotMsg]);
      return data;
    } catch {
      return null;
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const slug = url.searchParams.get("slug")?.trim() || this.slug || "default";

    if (url.pathname === "/state") {
      const engine = this.loadEngine(slug);
      if (!engine.getSnapshot().tvFeed) {
        await this.hydrateFromOrigin(slug, true);
      }
      return jsonResponse({ ok: true, snapshot: engine.getSnapshot(Date.now()) });
    }

    if (url.pathname === "/notify" && request.method === "POST") {
      const engine = this.loadEngine(slug);
      let body: {
        tvFeed?: Record<string, unknown> | null;
        partyEvent?: Record<string, unknown> | null;
        refreshFromOrigin?: boolean;
      } = {};
      try {
        body = (await request.json()) as typeof body;
      } catch {
        body = {};
      }

      if (body.tvFeed && typeof body.tvFeed === "object") {
        const msg = engine.mergeExternalTvFeed(body.tvFeed, Date.now());
        this.persistEngine();
        this.broadcast([msg]);
      } else if (body.refreshFromOrigin !== false) {
        await this.hydrateFromOrigin(slug, true);
      }

      if (body.partyEvent && typeof body.partyEvent === "object") {
        this.broadcast([
          {
            type: "party:event",
            payload: body.partyEvent,
            serverNowMs: Date.now(),
          },
        ]);
      }

      return jsonResponse({ ok: true, revision: engine.getSnapshot().revision });
    }

    // WebSocket Upgrade
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected Upgrade: websocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    const role = normalizeRole(url.searchParams.get("role"));
    const deviceId = url.searchParams.get("deviceId") || undefined;
    const lanEndpoints = parseLanEndpointsParam(url.searchParams.get("lanEndpoints"));
    const directEnabled = url.searchParams.get("direct") === "1" ? true : undefined;
    const clientId =
      url.searchParams.get("clientId")?.trim() || `${role}-${crypto.randomUUID().slice(0, 8)}`;
    const nowMs = Date.now();

    const attachment: SocketAttachment = {
      clientId,
      role,
      deviceId,
      slug,
      joinedAtMs: nowMs,
      lanEndpoints,
      directEnabled,
    };

    this.ctx.acceptWebSocket(server, [role, slug]);
    server.serializeAttachment(attachment);

    const engine = this.loadEngine(slug);
    const presenceMsg = engine.upsertClient({
      clientId,
      role,
      deviceId,
      joinedAtMs: nowMs,
      lanEndpoints,
      directEnabled,
    });

    if (!engine.getSnapshot().tvFeed) {
      this.ctx.waitUntil(this.hydrateFromOrigin(slug, false));
    }

    try {
      server.send(
        JSON.stringify({
          type: "room:snapshot",
          snapshot: engine.getSnapshot(nowMs),
          serverNowMs: nowMs,
        } satisfies SyncOutboundMessage),
      );
    } catch {
      // Ignore immediate close
    }

    this.broadcast([presenceMsg], server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(ws: WebSocket, rawMessage: string | ArrayBuffer): Promise<void> {
    if (typeof rawMessage !== "string") return;
    if (rawMessage === "ping") return;

    let msg: SyncInboundMessage;
    try {
      msg = JSON.parse(rawMessage) as SyncInboundMessage;
    } catch {
      return;
    }

    const nowMs = Date.now();

    if (msg.type === "clock:ping") {
      ws.send(
        JSON.stringify({
          type: "clock:pong",
          clientSentMs: msg.clientSentMs,
          serverNowMs: nowMs,
        } satisfies SyncOutboundMessage),
      );
      return;
    }

    const meta = ws.deserializeAttachment() as SocketAttachment | null;
    const slug = (msg.type === "room:join" ? msg.slug : meta?.slug) || this.slug || "default";
    const engine = this.loadEngine(slug);

    if (msg.type === "room:join") {
      const nextAttachment: SocketAttachment = {
        clientId: msg.clientId || meta?.clientId || `client-${crypto.randomUUID().slice(0, 8)}`,
        role: msg.role || meta?.role || "client",
        deviceId: msg.deviceId ?? meta?.deviceId,
        slug: msg.slug || slug,
        joinedAtMs: meta?.joinedAtMs || nowMs,
        lanEndpoints: Array.isArray(msg.lanEndpoints)
          ? msg.lanEndpoints
          : meta?.lanEndpoints,
        directEnabled:
          typeof msg.directEnabled === "boolean" ? msg.directEnabled : meta?.directEnabled,
      };
      ws.serializeAttachment(nextAttachment);
      const presence = engine.upsertClient(nextAttachment);
      ws.send(
        JSON.stringify({
          type: "room:snapshot",
          snapshot: engine.getSnapshot(nowMs),
          serverNowMs: nowMs,
        } satisfies SyncOutboundMessage),
      );
      this.broadcast([presence], ws);
      return;
    }

    if (msg.type === "rtc:signal") {
      const fromClientId = meta?.clientId;
      if (!fromClientId) return;

      if (msg.signalType === "direct-ready") {
        const directFlag = msg.directEnabled !== false;
        if (meta) {
          ws.serializeAttachment({
            ...meta,
            directEnabled: directFlag,
          });
        }
        const presence = engine.setClientDirectEnabled(fromClientId, directFlag, nowMs);
        if (presence) {
          this.broadcast([presence]);
        }
        return;
      }

      const outboundMsg: SyncOutboundMessage = {
        type: "rtc:signal",
        fromClientId,
        fromRole: meta.role,
        targetClientId: msg.targetClientId,
        signalType: msg.signalType,
        sdp: msg.sdp,
        candidate: msg.candidate,
        directEnabled: msg.directEnabled,
        serverNowMs: nowMs,
      };
      const serialized = JSON.stringify(outboundMsg);
      for (const client of this.ctx.getWebSockets()) {
        if (client === ws || client.readyState !== WebSocket.OPEN) continue;
        if (msg.targetClientId) {
          const peerMeta = client.deserializeAttachment() as SocketAttachment | null;
          if (peerMeta?.clientId !== msg.targetClientId) continue;
        }
        try {
          client.send(serialized);
        } catch {
          // Ignore broken pipe
        }
      }
      return;
    }

    if (msg.type === "lan:announce") {
      const clientId = meta?.clientId;
      if (clientId && Array.isArray(msg.lanEndpoints)) {
        if (meta) {
          ws.serializeAttachment({
            ...meta,
            lanEndpoints: msg.lanEndpoints,
          });
        }
        const presence = engine.setClientLanEndpoints(clientId, msg.lanEndpoints, nowMs);
        if (presence) {
          this.broadcast([presence]);
        }
      }
      return;
    }

    if (msg.type === "state:refresh_request") {
      const hydrated = await this.hydrateFromOrigin(slug, true);
      if (!hydrated) {
        ws.send(
          JSON.stringify({
            type: "room:snapshot",
            snapshot: engine.getSnapshot(nowMs),
            serverNowMs: nowMs,
          } satisfies SyncOutboundMessage),
        );
      }
      return;
    }

    if (msg.type === "playback:command") {
      const { outbound, nextAlarmMs } = engine.applyPlaybackCommand(
        msg.command,
        msg.payload || {},
        nowMs,
        { useBarrier: msg.useBarrier },
      );
      this.persistEngine();
      if (nextAlarmMs) {
        await this.ctx.storage.setAlarm(nextAlarmMs);
      }
      this.broadcast(outbound);
      return;
    }

    if (msg.type === "sync:ready") {
      const clientId = msg.clientId || meta?.clientId || "unknown";
      const outbound = engine.markReady(msg.barrierId, clientId, nowMs);
      if (outbound.length > 0) {
        this.persistEngine();
        this.broadcast(outbound);
      }
      return;
    }

    if (msg.type === "sync:progress") {
      const prevRev = engine.getSnapshot(nowMs).revision;
      const anchorMsg = engine.applyProgressReport(msg, nowMs);
      const nextRev = engine.getSnapshot(nowMs).revision;
      if (nextRev !== prevRev || msg.forceSeek) {
        this.persistEngine();
        this.broadcast([anchorMsg], ws);
      }
      return;
    }

    if (msg.type === "party:event") {
      this.broadcast(
        [
          {
            type: "party:event",
            payload: msg.payload,
            serverNowMs: nowMs,
          },
        ],
        ws,
      );
      return;
    }

    if (msg.type === "room:snapshot_sync") {
      const outbound = engine.mergeExternalSnapshotSync(
        {
          tvFeed: msg.tvFeed,
          anchor: msg.anchor,
          forceSeek: msg.forceSeek,
          source: msg.source,
        },
        nowMs,
      );
      if (outbound.length > 0) {
        this.persistEngine();
        this.broadcast(outbound, ws);
      }
      return;
    }
  }

  async alarm(): Promise<void> {
    const engine = this.loadEngine(this.slug || "default");
    const released = engine.checkBarrierDeadline(Date.now());
    if (released.length > 0) {
      this.persistEngine();
      this.broadcast(released);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    const meta = ws.deserializeAttachment() as SocketAttachment | null;
    if (meta?.clientId) {
      const engine = this.loadEngine(meta.slug || this.slug || "default");
      const outbound = engine.removeClient(meta.clientId, Date.now());
      if (outbound.some((m) => m.type === "sync:go")) {
        this.persistEngine();
      }
      this.broadcast(outbound, ws);
    }
    try {
      ws.close(code, reason);
    } catch {
      // Already closed
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    const meta = ws.deserializeAttachment() as SocketAttachment | null;
    if (meta?.clientId) {
      const engine = this.loadEngine(meta.slug || this.slug || "default");
      const outbound = engine.removeClient(meta.clientId, Date.now());
      if (outbound.some((m) => m.type === "sync:go")) {
        this.persistEngine();
      }
      this.broadcast(outbound, ws);
    }
  }
}

