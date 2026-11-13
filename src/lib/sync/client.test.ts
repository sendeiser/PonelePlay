import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  acquireSyncClient,
  releaseSyncClient,
  triggerRoomSyncRefresh,
} from "./client";
import {
  getCachedPartyConfig,
  getCachedTvFeed,
  invalidateVenueSyncCache,
  notifySyncRoom,
  setCachedPartyConfig,
  setCachedTvFeed,
} from "./server-notify";

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  simulateOpen() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  simulateMessage(obj: unknown) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
}

describe("PoneleSyncClient & server-notify", () => {
  const originalWebSocket = globalThis.WebSocket;
  const originalFetch = globalThis.fetch;
  const origSyncWsUrl = process.env.NEXT_PUBLIC_SYNC_WS_URL;
  const origLanPort = process.env.NEXT_PUBLIC_LAN_HUB_PORT;
  const origSyncHttp = process.env.SYNC_HTTP_URL;
  const origSyncSecret = process.env.SYNC_SHARED_SECRET;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
    process.env.NEXT_PUBLIC_SYNC_WS_URL = "wss://poneleplay-sync.workers.dev";
    process.env.NEXT_PUBLIC_LAN_HUB_PORT = "4321";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalWebSocket) globalThis.WebSocket = originalWebSocket;
    if (originalFetch) globalThis.fetch = originalFetch;
    if (origSyncWsUrl === undefined) delete process.env.NEXT_PUBLIC_SYNC_WS_URL;
    else process.env.NEXT_PUBLIC_SYNC_WS_URL = origSyncWsUrl;
    if (origLanPort === undefined) delete process.env.NEXT_PUBLIC_LAN_HUB_PORT;
    else process.env.NEXT_PUBLIC_LAN_HUB_PORT = origLanPort;
    if (origSyncHttp === undefined) delete process.env.SYNC_HTTP_URL;
    else process.env.SYNC_HTTP_URL = origSyncHttp;
    if (origSyncSecret === undefined) delete process.env.SYNC_SHARED_SECRET;
    else process.env.SYNC_SHARED_SECRET = origSyncSecret;
    invalidateVenueSyncCache("bar-test");
  });

  it("prioritizes local LAN 127.0.0.1 for master role and passes cloudUrl hint, then fails over to Cloud WS", () => {
    const client = acquireSyncClient({ slug: "bar-test", role: "master" });

    expect(FakeWebSocket.instances.length).toBe(1);
    const firstUrl = FakeWebSocket.instances[0].url;
    expect(firstUrl).toContain("ws://127.0.0.1:4321/ws/bar-test");
    expect(firstUrl).toContain("role=master");
    expect(firstUrl).toContain("cloudUrl=wss%3A%2F%2Fponeleplay-sync.workers.dev");

    // Simulate LAN not running: close fails cleanly -> schedules failover to Cloud
    vi.useFakeTimers();
    FakeWebSocket.instances[0].close();
    vi.advanceTimersByTime(150);

    expect(FakeWebSocket.instances.length).toBe(2);
    expect(FakeWebSocket.instances[1].url).toContain("wss://poneleplay-sync.workers.dev/ws/bar-test");

    FakeWebSocket.instances[1].simulateOpen();
    expect(client.getStatus().transport).toBe("cloud");
    expect(client.isConnected()).toBe(true);

    vi.useRealTimers();
    releaseSyncClient(client);
  });

  it("converges clock offset via clock:pong and triggers active room sync refresh", () => {
    const client = acquireSyncClient({ slug: "bar-test", role: "client" });
    expect(FakeWebSocket.instances.length).toBe(1);
    const ws = FakeWebSocket.instances[0];
    ws.simulateOpen();

    const pingRaw = ws.sent.find((m) => m.includes('"clock:ping"'));
    expect(pingRaw).toBeDefined();
    const ping = JSON.parse(pingRaw!) as { clientSentMs: number };

    vi.spyOn(Date, "now").mockReturnValue(ping.clientSentMs + 40); // rtt = 40ms
    ws.simulateMessage({
      type: "clock:pong",
      clientSentMs: ping.clientSentMs,
      serverNowMs: ping.clientSentMs + 20 + 1500, // server is +1500ms ahead
    });

    expect(client.getStatus().rttMs).toBe(40);
    expect(client.getStatus().offsetMs).toBe(1500);
    expect(client.msUntilServerTime(ping.clientSentMs + 40 + 2500)).toBe(1000);

    triggerRoomSyncRefresh("bar-test", {
      partyEvent: { type: "live_dedication", dedication: "Feliz cumple!" },
    });

    expect(ws.sent.some((m) => m.includes('"party:event"') && m.includes("live_dedication"))).toBe(true);
    expect(ws.sent.some((m) => m.includes('"state:refresh_request"'))).toBe(true);

    releaseSyncClient(client);
  });

  it("caches and invalidates venue tvFeed (${slug}:*) and partyConfig, and notifies Cloudflare endpoint", async () => {
    setCachedTvFeed("bar-test:default", { ok: true, id: 1 });
    setCachedTvFeed("bar-test:tv-9", { ok: true, id: 2 });
    setCachedTvFeed("other-bar:default", { ok: true, id: 3 });
    setCachedPartyConfig("bar-test", { venueType: "party" });

    expect(getCachedTvFeed("bar-test:default")).toEqual({ ok: true, id: 1 });
    expect(getCachedTvFeed("bar-test:tv-9")).toEqual({ ok: true, id: 2 });
    expect(getCachedPartyConfig("bar-test")).toEqual({ venueType: "party" });

    process.env.SYNC_HTTP_URL = "https://poneleplay-sync.workers.dev";
    process.env.SYNC_SHARED_SECRET = "secret-xyz";

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await notifySyncRoom("bar-test", {
      partyEvent: { type: "party_duel_start" },
      refreshFromOrigin: true,
    });

    expect(getCachedTvFeed("bar-test:default")).toBeNull();
    expect(getCachedTvFeed("bar-test:tv-9")).toBeNull();
    expect(getCachedPartyConfig("bar-test")).toBeNull();
    expect(getCachedTvFeed("other-bar:default")).toEqual({ ok: true, id: 3 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://poneleplay-sync.workers.dev/internal/room/bar-test/notify");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-xyz");
  });

  it("accepts runtime cloudWsUrl when env var is missing and stores lanEndpoints from room:presence", () => {
    delete process.env.NEXT_PUBLIC_SYNC_WS_URL;
    vi.stubGlobal("location", new URL("https://poneleplay.netlify.app/tv/disco-vip"));
    vi.useFakeTimers();

    const client = acquireSyncClient({ slug: "disco-vip", role: "tv" });
    expect(FakeWebSocket.instances).toHaveLength(0);

    client.setRuntimeCloudWsUrl("https://poneleplay-sync.martinsgons709.workers.dev/");
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].url).toContain(
      "wss://poneleplay-sync.martinsgons709.workers.dev/ws/disco-vip",
    );

    FakeWebSocket.instances[0].simulateOpen();
    FakeWebSocket.instances[0].simulateMessage({
      type: "room:presence",
      connectedClients: { total: 2, master: 1, tv: 1, guest: 0 },
      lanEndpoints: ["ws://192.168.1.44:4321"],
      serverNowMs: Date.now(),
    });

    expect(client.getStatus().lanEndpoints).toEqual(["ws://192.168.1.44:4321"]);
    vi.useRealTimers();
    releaseSyncClient(client);
  });
});

