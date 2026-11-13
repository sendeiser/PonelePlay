import { describe, expect, it } from "vitest";
import {
  computeClockOffsetSample,
  computeTargetPositionSec,
  createDefaultAnchor,
  mergeClockOffset,
  type SyncTrack,
} from "./protocol";
import { SyncRoomEngine } from "./room-engine";

const SAMPLE_TRACK: SyncTrack = {
  itemId: "item-1",
  trackId: "trk-1",
  title: "DesaKTa2 - Vivo",
  artist: "DesaKTa2",
  durationSeconds: 200,
  youtubeVideoId: "abc123xyz00",
};

describe("sync protocol clock & anchor math", () => {
  it("computes accurate clock offset accounting for symmetric RTT/2", () => {
    // Client clock is 500ms behind server; RTT = 40ms
    const sample = computeClockOffsetSample(1000, 1520, 1040);
    expect(sample.rttMs).toBe(40);
    expect(sample.offsetMs).toBe(500);
  });

  it("prefers lower-RTT samples over high-jitter outliers", () => {
    let est = mergeClockOffset(null, { rttMs: 12, offsetMs: 250 });
    expect(est.offsetMs).toBe(250);

    // High-jitter spike should barely perturb established low-RTT estimate
    est = mergeClockOffset(est, { rttMs: 420, offsetMs: 600 });
    expect(est.offsetMs).toBe(250);

    // Cleaner 4ms LAN sample refines the estimate
    est = mergeClockOffset(est, { rttMs: 4, offsetMs: 260 });
    expect(est.offsetMs).toBeGreaterThanOrEqual(255);
  });

  it("computes exact target position when playing, paused, before startAt, and capped by duration", () => {
    const anchor = {
      ...createDefaultAnchor(10_000),
      track: SAMPLE_TRACK,
      isPaused: false,
      anchorPositionSec: 12,
      anchorServerMs: 10_000,
    };

    expect(computeTargetPositionSec(anchor, 9_800)).toBe(12); // Scheduled future start
    expect(computeTargetPositionSec(anchor, 15_500)).toBeCloseTo(17.5, 3);
    expect(computeTargetPositionSec(anchor, 500_000)).toBe(200); // Duration cap

    const pausedAnchor = { ...anchor, isPaused: true };
    expect(computeTargetPositionSec(pausedAnchor, 25_000)).toBe(12);
  });
});

describe("SyncRoomEngine Ready-Barrier & conflict resolution", () => {
  it("coordinates preload -> ready -> synchronized go when master and TV are present", () => {
    const engine = new SyncRoomEngine("juntada", { barrierTimeoutMs: 1600, barrierStartLeadMs: 220 }, 1000);
    engine.upsertClient({ clientId: "cabina-1", role: "master", joinedAtMs: 1000 });
    engine.upsertClient({ clientId: "tv-1", role: "tv", deviceId: "android-tv-1", joinedAtMs: 1000 });

    const { outbound, nextAlarmMs } = engine.applyPlaybackCommand(
      "play_now",
      { track: SAMPLE_TRACK },
      2000,
    );

    expect(nextAlarmMs).toBe(3600);
    const preload = outbound.find((m) => m.type === "sync:preload");
    expect(preload).toBeDefined();
    if (!preload || preload.type !== "sync:preload") throw new Error("expected preload");

    // Master ready alone should still hold for TV
    const afterMaster = engine.markReady(preload.barrierId, "cabina-1", 2150);
    expect(afterMaster).toHaveLength(0);

    // Once TV reports ready, both receive sync:go with exact future startAtServerMs
    const afterTv = engine.markReady(preload.barrierId, "tv-1", 2300);
    const goMsg = afterTv.find((m) => m.type === "sync:go");
    expect(goMsg).toBeDefined();
    if (!goMsg || goMsg.type !== "sync:go") throw new Error("expected sync:go");

    expect(goMsg.startAtServerMs).toBe(2520);
    expect(goMsg.anchor.isPaused).toBe(false);
    expect(goMsg.anchor.anchorPositionSec).toBe(0);
    expect(goMsg.anchor.anchorServerMs).toBe(2520);
  });

  it("releases barrier automatically if deadline expires or TV disconnects", () => {
    const engine = new SyncRoomEngine("juntada", { barrierTimeoutMs: 1500, barrierStartLeadMs: 200 }, 1000);
    engine.upsertClient({ clientId: "cabina-1", role: "master", joinedAtMs: 1000 });
    engine.upsertClient({ clientId: "tv-slow", role: "tv", joinedAtMs: 1000 });

    engine.applyPlaybackCommand("play_now", { track: SAMPLE_TRACK }, 5000);
    expect(engine.checkBarrierDeadline(6000)).toHaveLength(0);

    const released = engine.checkBarrierDeadline(6500);
    expect(released.some((m) => m.type === "sync:go")).toBe(true);

    // Also test disconnect unblocking when master already reported ready
    const engine2 = new SyncRoomEngine("juntada", { barrierTimeoutMs: 1500, barrierStartLeadMs: 200 }, 1000);
    engine2.upsertClient({ clientId: "cabina-1", role: "master", joinedAtMs: 1000 });
    engine2.upsertClient({ clientId: "tv-drop", role: "tv", joinedAtMs: 1000 });
    const res2 = engine2.applyPlaybackCommand("play_now", { track: SAMPLE_TRACK }, 7000);
    const barrierId2 = (res2.outbound[0] as { barrierId: string }).barrierId;
    engine2.markReady(barrierId2, "cabina-1", 7100);
    const onDisconnect = engine2.removeClient("tv-drop", 7200);
    expect(onDisconnect.some((m) => m.type === "sync:go")).toBe(true);
  });

  it("fires immediate sync:go without waiting when no TV is joined", () => {
    const engine = new SyncRoomEngine("billar", undefined, 1000);
    engine.upsertClient({ clientId: "cabina-only", role: "master", joinedAtMs: 1000 });

    const { outbound, nextAlarmMs } = engine.applyPlaybackCommand("play_now", { track: SAMPLE_TRACK }, 2000);
    expect(nextAlarmMs).toBeNull();
    expect(outbound.some((m) => m.type === "sync:go")).toBe(true);
    expect(outbound.some((m) => m.type === "sync:preload")).toBe(false);
  });

  it("handles atomic pause, resume, seek and protects fresh timing from stale DB webhooks", () => {
    const engine = new SyncRoomEngine("juntada", undefined, 1000);
    engine.applyPlaybackCommand("play_now", { track: SAMPLE_TRACK }, 1000, { useBarrier: false });

    // Advance 10s, pause at 1080 + 10s -> ~10.0s
    engine.applyPlaybackCommand("pause", {}, 11_080);
    const pausedSnap = engine.getSnapshot(15_000);
    expect(pausedSnap.anchor.isPaused).toBe(true);
    expect(pausedSnap.anchor.anchorPositionSec).toBeCloseTo(10, 1);

    // Seek to 75s
    const { outbound: seekOut } = engine.applyPlaybackCommand("seek", { seconds: 75 }, 16_000);
    const seekAnchor = seekOut.find((m) => m.type === "sync:anchor");
    expect(seekAnchor?.type === "sync:anchor" && seekAnchor.forceSeek).toBe(true);

    // Stale webhook from older Postgres timestamp must NOT reset position back to 10s
    const merged = engine.mergeExternalTvFeed(
      {
        nowPlaying: { ...SAMPLE_TRACK, id: SAMPLE_TRACK.itemId },
        queue: [{ id: "q-next", title: "Next Song" }],
        playback: {
          isPaused: false,
          commandSeq: 1,
          seekSeq: 1,
          anchorPositionSeconds: 10,
          anchorTimestampMs: 11_000,
          tvMuted: true,
        },
      },
      16_500,
    );

    if (merged.type !== "room:snapshot") throw new Error("expected snapshot");
    expect(merged.snapshot.anchor.anchorPositionSec).toBe(75);
    expect(merged.snapshot.anchor.tvMuted).toBe(true);
    expect((merged.snapshot.tvFeed as { queue?: unknown[] }).queue).toHaveLength(1);
  });

  it("serializes and restores cleanly across hibernation", () => {
    const engine = new SyncRoomEngine("juntada", undefined, 1000);
    engine.applyPlaybackCommand("play_now", { track: SAMPLE_TRACK }, 2000, { useBarrier: false });
    engine.applyPlaybackCommand("set_volume", { volume: 64 }, 3000);

    const saved = engine.serialize();
    const restored = SyncRoomEngine.restore(saved);
    const snap = restored.getSnapshot(4000);

    expect(snap.anchor.volume).toBe(64);
    expect(snap.anchor.track?.youtubeVideoId).toBe(SAMPLE_TRACK.youtubeVideoId);
    expect(snap.revision).toBe(saved.revision);
  });

  it("tracks advertised LAN endpoints across room:presence and snapshots", () => {
    const engine = new SyncRoomEngine("juntada", undefined, 1000);
    engine.upsertClient({
      clientId: "cabina-1",
      role: "master",
      joinedAtMs: 1000,
      lanEndpoints: ["ws://192.168.1.40:4321"],
    });
    expect(engine.getSnapshot(1100).lanEndpoints).toEqual(["ws://192.168.1.40:4321"]);

    const presence = engine.setClientLanEndpoints(
      "cabina-1",
      ["ws://192.168.1.40:4321", "ws://192.168.1.50:4321"],
      1200,
    );
    expect(presence?.type).toBe("room:presence");
    if (presence && presence.type === "room:presence") {
      expect(presence.lanEndpoints).toEqual([
        "ws://192.168.1.40:4321",
        "ws://192.168.1.50:4321",
      ]);
    }
  });

  it("treats skip with expectedVideoId as idempotent when track already advanced", () => {
    const engine = new SyncRoomEngine("juntada", undefined, 1000);
    engine.applyPlaybackCommand("play_now", { track: SAMPLE_TRACK }, 2000, { useBarrier: false });

    // First skip matching active track advances anchor seq and broadcasts sync:anchor
    const first = engine.applyPlaybackCommand(
      "skip",
      { expectedVideoId: SAMPLE_TRACK.youtubeVideoId },
      3000,
    );
    expect(first.outbound.length).toBeGreaterThan(0);
    expect(engine.getSnapshot(3000).anchor.lastCommand).toBe("skip");

    // Re-load new track, then duplicate skip referencing old expectedVideoId is ignored
    const track2: SyncTrack = { ...SAMPLE_TRACK, itemId: "item-2", youtubeVideoId: "newTrack999" };
    engine.applyPlaybackCommand("play_now", { track: track2 }, 3500, { useBarrier: false });
    const seqBeforeDup = engine.getSnapshot(3500).anchor.seq;
    const dup = engine.applyPlaybackCommand(
      "skip",
      { expectedVideoId: SAMPLE_TRACK.youtubeVideoId },
      3600,
    );
    expect(dup.outbound).toHaveLength(0);
    expect(engine.getSnapshot(3600).anchor.seq).toBe(seqBeforeDup);
    expect(engine.getSnapshot(3600).anchor.track?.youtubeVideoId).toBe("newTrack999");
  });

  it("re-anchors progress only when drift exceeds tightened thresholds (0.18s early, 0.30s steady)", () => {
    const engine = new SyncRoomEngine("juntada", undefined, 1000);
    // With useBarrier: false, anchorServerMs starts at nowMs + 80ms = 10_080ms
    engine.applyPlaybackCommand("play_now", { track: SAMPLE_TRACK }, 10_000, { useBarrier: false });

    // At 11_500ms, computed track time = 1.42s. 1.54s is within 0.18s -> revision stays unchanged
    const minorEarly = engine.applyProgressReport(
      { currentTime: 1.54, isPaused: false, track: SAMPLE_TRACK },
      11_500,
    );
    expect(minorEarly.type).toBe("sync:anchor");
    const revBefore = engine.getSnapshot(11_500).revision;

    // At 11_500ms, 1.70s differs by 0.28s >= 0.18s -> bumps revision
    engine.applyProgressReport(
      { currentTime: 1.7, isPaused: false, track: SAMPLE_TRACK },
      11_500,
    );
    expect(engine.getSnapshot(11_500).revision).toBeGreaterThan(revBefore);
  });
});

