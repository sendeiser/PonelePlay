import assert from "node:assert/strict";
import test from "node:test";
import { WebSocket } from "ws";
import { PoneleLanHub } from "./hub";

function connectWs(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
}

function waitForMessage<T extends { type: string }>(
  ws: WebSocket,
  predicate: (msg: T) => boolean,
  timeoutMs = 3000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for WebSocket message"));
    }, timeoutMs);

    const onMsg = (raw: WebSocket.RawData) => {
      const text = typeof raw === "string" ? raw : raw.toString("utf8");
      if (text === "pong") return;
      try {
        const parsed = JSON.parse(text) as T;
        if (predicate(parsed)) {
          cleanup();
          resolve(parsed);
        }
      } catch {
        // ignore
      }
    };

    const cleanup = () => {
      clearTimeout(timer);
      ws.off("message", onMsg);
    };

    ws.on("message", onMsg);
  });
}

test("PoneleLanHub coordinates clock sync and Ready-Barrier across LAN sockets", async () => {
  const hub = new PoneleLanHub({ port: 0, enableMdns: false });
  await hub.start();
  const port = hub.getListeningPort();
  assert.ok(port > 0);

  const master = await connectWs(`ws://127.0.0.1:${port}/ws/juntada?role=master&clientId=m1`);
  const tv = await connectWs(`ws://127.0.0.1:${port}/ws/juntada?role=tv&clientId=tv1`);

  try {
    // 1. Clock ping/pong
    const pongPromise = waitForMessage<{ type: string; clientSentMs: number; serverNowMs: number }>(
      tv,
      (m) => m.type === "clock:pong",
    );
    tv.send(JSON.stringify({ type: "clock:ping", clientSentMs: 123456 }));
    const pong = await pongPromise;
    assert.equal(pong.clientSentMs, 123456);
    assert.ok(pong.serverNowMs > 0);

    // 2. Ready-Barrier preload -> ready -> go
    const masterPreloadP = waitForMessage<{ type: string; barrierId: string }>(
      master,
      (m) => m.type === "sync:preload",
    );
    const tvPreloadP = waitForMessage<{ type: string; barrierId: string }>(
      tv,
      (m) => m.type === "sync:preload",
    );

    master.send(
      JSON.stringify({
        type: "playback:command",
        command: "play_now",
        payload: {
          track: {
            itemId: "i-1",
            trackId: "t-1",
            title: "Tema LAN",
            artist: "PonelePlay",
            youtubeVideoId: "dQw4w9WgXcQ",
            durationSeconds: 180,
          },
        },
      }),
    );

    const [masterPreload, tvPreload] = await Promise.all([masterPreloadP, tvPreloadP]);
    assert.equal(masterPreload.barrierId, tvPreload.barrierId);

    const masterGoP = waitForMessage<{ type: string; barrierId: string; startAtServerMs: number }>(
      master,
      (m) => m.type === "sync:go",
    );
    const tvGoP = waitForMessage<{ type: string; barrierId: string; startAtServerMs: number }>(
      tv,
      (m) => m.type === "sync:go",
    );

    master.send(JSON.stringify({ type: "sync:ready", barrierId: masterPreload.barrierId, clientId: "m1" }));
    tv.send(JSON.stringify({ type: "sync:ready", barrierId: tvPreload.barrierId, clientId: "tv1" }));

    const [masterGo, tvGo] = await Promise.all([masterGoP, tvGoP]);
    assert.equal(masterGo.barrierId, tvGo.barrierId);
    assert.equal(masterGo.startAtServerMs, tvGo.startAtServerMs);

    // 3. Health HTTP check
    const healthRes = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(healthRes.status, 200);
    const healthJson = (await healthRes.json()) as { ok: boolean; rooms: Array<{ slug: string }> };
    assert.equal(healthJson.ok, true);
    assert.equal(healthJson.rooms[0]?.slug, "juntada");

    // 4. Only material progress drift (> 0.18s) broadcasts sync:anchor
    let tvAnchorCount = 0;
    const countHandler = (raw: WebSocket.RawData) => {
      const text = typeof raw === "string" ? raw : raw.toString("utf8");
      if (text.includes('"sync:anchor"')) tvAnchorCount += 1;
    };
    tv.on("message", countHandler);

    master.send(JSON.stringify({ type: "sync:progress", currentTime: 0.05, isPaused: false }));
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(tvAnchorCount, 0);

    master.send(JSON.stringify({ type: "sync:progress", currentTime: 5.5, forceSeek: true, isPaused: false }));
    await waitForMessage<{ type: string }>(tv, (m) => m.type === "sync:anchor");
    tv.off("message", countHandler);
  } finally {
    master.close();
    tv.close();
    await hub.stop();
  }
});

