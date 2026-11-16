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
    if (typeof window !== "undefined") {
      try {
        window.localStorage?.clear();
      } catch {
        // ignore
      }
    }
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

  it("prioritizes local LAN 127.0.0.1 for master role when LAN mode is selected and passes cloudUrl hint, then fails over to Cloud WS", () => {
    const client = acquireSyncClient({ slug: "bar-test", role: "master", mode: "lan" });

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

  it("defaults master role to pure Cloud WS without probing 127.0.0.1, keeping Netlify safe", () => {
    const client = acquireSyncClient({ slug: "bar-cloud", role: "master" });
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].url).toContain("wss://poneleplay-sync.workers.dev/ws/bar-cloud");
    expect(FakeWebSocket.instances[0].url).not.toContain("127.0.0.1");

    FakeWebSocket.instances[0].simulateOpen();
    expect(client.getStatus().transport).toBe("cloud");
    expect(client.getStatus().preferenceMode).toBe("cloud");

    releaseSyncClient(client);
  });

  it("runs Direct P2P mode over BroadcastChannel alongside Cloud mirror without leaving Cloud", () => {
    const channels = new Map<string, Set<{ onmessage: ((ev: { data: unknown }) => void) | null }>>();
    class FakeBroadcastChannel {
      name: string;
      onmessage: ((ev: { data: unknown }) => void) | null = null;
      constructor(name: string) {
        this.name = name;
        if (!channels.has(name)) channels.set(name, new Set());
        channels.get(name)!.add(this);
      }
      postMessage(data: unknown) {
        for (const peer of channels.get(this.name) ?? []) {
          if (peer !== this) peer.onmessage?.({ data });
        }
      }
      close() {
        channels.get(this.name)?.delete(this);
      }
    }
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel as unknown as typeof BroadcastChannel);

    const master = acquireSyncClient({ slug: "direct-room", role: "master", mode: "direct" });
    const tv = acquireSyncClient({ slug: "direct-room", role: "tv", mode: "direct" });
    expect(FakeWebSocket.instances).toHaveLength(2);
    const masterWs = FakeWebSocket.instances[0];
    const tvWs = FakeWebSocket.instances[1];
    masterWs.simulateOpen();
    tvWs.simulateOpen();

    expect(masterWs.url).toContain("direct=1");
    expect(master.getStatus().transport).toBe("direct");

    const tvPreloads: string[] = [];
    const tvGos: string[] = [];
    tv.on("sync:preload", (m) => {
      tvPreloads.push(m.barrierId);
      tv.sendReady(m.barrierId);
    });
    tv.on("sync:go", (m) => {
      tvGos.push(m.barrierId);
    });
    master.on("sync:preload", (m) => {
      master.sendReady(m.barrierId);
    });

    master.sendCommand("play_now", {
      track: {
        itemId: "i1",
        trackId: "t1",
        title: "Tema Directo",
        artist: "PonelePlay",
        youtubeVideoId: "abc123xyz",
        durationSeconds: 180,
      },
    });

    expect(tvPreloads).toHaveLength(1);
    expect(tvGos).toEqual(tvPreloads);
    // Cloud WS stayed open and received a snapshot_sync mirror, never disconnected
    expect(masterWs.sent.some((m) => m.includes('"room:snapshot_sync"') && m.includes('"direct"'))).toBe(true);

    releaseSyncClient(master);
    releaseSyncClient(tv);
  });

  it("negotiates Option 2 live WebRTC MediaStream over channel='media' and tears down cleanly", async () => {
    class FakeMediaTrack {
      id: string;
      kind: "audio" | "video";
      label: string;
      readyState: "live" | "ended" = "live";
      stopped = false;
      private endListeners = new Set<() => void>();
      onended: (() => void) | null = null;
      constructor(kind: "audio" | "video", id: string, label: string) {
        this.kind = kind;
        this.id = id;
        this.label = label;
      }
      addEventListener(type: string, cb: () => void) {
        if (type === "ended") this.endListeners.add(cb);
      }
      stop() {
        this.stopped = true;
        this.readyState = "ended";
      }
      triggerEnded() {
        this.readyState = "ended";
        this.onended?.();
        for (const cb of this.endListeners) cb();
      }
    }

    class FakeMediaStream {
      private tracks: FakeMediaTrack[];
      constructor(tracks: FakeMediaTrack[] = []) {
        this.tracks = [...tracks];
      }
      getTracks() {
        return this.tracks;
      }
      getAudioTracks() {
        return this.tracks.filter((t) => t.kind === "audio");
      }
      getVideoTracks() {
        return this.tracks.filter((t) => t.kind === "video");
      }
      addTrack(t: FakeMediaTrack) {
        this.tracks.push(t);
      }
    }

    const fakePeers: FakeRtcPc[] = [];
    class FakeRtcPc {
      ontrack: ((ev: { track: FakeMediaTrack; streams: FakeMediaStream[] }) => void) | null = null;
      onicecandidate: ((ev: { candidate: null }) => void) | null = null;
      onconnectionstatechange: (() => void) | null = null;
      connectionState = "new";
      addedTracks: FakeMediaTrack[] = [];
      closed = false;
      constructor() {
        fakePeers.push(this);
      }
      addTrack(track: FakeMediaTrack) {
        this.addedTracks.push(track);
        return {
          track,
          getParameters: () => ({ encodings: [{}] }),
          setParameters: async () => {},
        };
      }
      async createOffer() {
        return { type: "offer", sdp: "v=0-fake-media-offer" };
      }
      async createAnswer() {
        return { type: "answer", sdp: "v=0-fake-media-answer" };
      }
      async setLocalDescription() {}
      async setRemoteDescription() {}
      async addIceCandidate() {}
      close() {
        this.closed = true;
        this.connectionState = "closed";
      }
    }

    const videoTrack = new FakeMediaTrack("video", "v1", "YouTube Tab HD");
    const audioTrack = new FakeMediaTrack("audio", "a1", "Tab Audio");
    const capturedStream = new FakeMediaStream([videoTrack, audioTrack]);

    vi.stubGlobal("MediaStream", FakeMediaStream as unknown as typeof MediaStream);
    vi.stubGlobal("RTCPeerConnection", FakeRtcPc as unknown as typeof RTCPeerConnection);
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getDisplayMedia: vi.fn(async () => capturedStream as unknown as MediaStream),
      },
    } as unknown as Navigator);

    const master = acquireSyncClient({ slug: "live-room", role: "master", mode: "cloud" });
    const tv = acquireSyncClient({ slug: "live-room", role: "tv", mode: "cloud" });
    const masterWs = FakeWebSocket.instances[0];
    const tvWs = FakeWebSocket.instances[1];
    masterWs.simulateOpen();
    tvWs.simulateOpen();

    // Inform master about TV peer presence (clientId is encoded in the WS URL query string)
    const tvClientId = new URL(tvWs.url).searchParams.get("clientId")!;
    const masterClientId = new URL(masterWs.url).searchParams.get("clientId")!;
    masterWs.simulateMessage({
      type: "room:presence",
      connectedClients: { total: 2, master: 1, tv: 1, guest: 0 },
      peers: [
        {
          clientId: masterClientId,
          role: "master",
          joinedAtMs: 1000,
          connected: true,
        },
        {
          clientId: tvClientId,
          role: "tv",
          joinedAtMs: 1001,
          connected: true,
        },
      ],
      serverNowMs: 1002,
    });

    const receivedStreams: Array<MediaStream | null> = [];
    tv.onMediaStream((s) => receivedStreams.push(s));

    const startRes = await master.startLiveMediaBroadcast({ preferCurrentTab: false });
    expect(startRes.ok).toBe(true);
    expect(startRes.hasAudio).toBe(true);
    expect(startRes.hasVideo).toBe(true);
    expect(master.getStatus().mediaStats?.streaming).toBe(true);

    // Relay offer from master -> tv WS (wait for async createOffer + setLocalDescription microtasks)
    await new Promise((r) => setTimeout(r, 15));
    const offerRaw = masterWs.sent.find((raw) => raw.includes('"channel":"media"') && raw.includes('"offer"'));
    expect(offerRaw).toBeTruthy();
    const offerParsed = JSON.parse(offerRaw!) as {
      targetClientId?: string;
      sdp?: string;
    };
    expect(offerParsed.targetClientId).toBe(tvClientId);

    tvWs.simulateMessage({
      type: "rtc:signal",
      fromClientId: masterClientId,
      fromRole: "master",
      targetClientId: tvClientId,
      channel: "media",
      signalType: "offer",
      sdp: offerParsed.sdp,
      mediaActive: true,
      serverNowMs: Date.now(),
    });

    // Wait microtasks for createAnswer + simulate inbound ontrack on TV's RTCPeerConnection
    await new Promise((r) => setTimeout(r, 10));
    const tvPc = fakePeers[fakePeers.length - 1];
    expect(tvPc).toBeTruthy();
    tvPc.ontrack?.({ track: videoTrack, streams: [capturedStream] });

    expect(tv.getRemoteMediaStream()).not.toBeNull();
    expect(receivedStreams.filter(Boolean)).toHaveLength(1);

    // Master stops live media -> tracks stopped & TV receives bye clearing stream to null
    master.stopLiveMediaBroadcast();
    expect(master.getStatus().mediaStats?.streaming).toBe(false);
    expect(videoTrack.stopped).toBe(true);
    expect(audioTrack.stopped).toBe(true);

    tvWs.simulateMessage({
      type: "rtc:signal",
      fromClientId: masterClientId,
      fromRole: "master",
      channel: "media",
      signalType: "bye",
      mediaActive: false,
      serverNowMs: Date.now(),
    });

    expect(tv.getRemoteMediaStream()).toBeNull();
    expect(receivedStreams[receivedStreams.length - 1]).toBeNull();

    releaseSyncClient(master);
    releaseSyncClient(tv);
  });
});

