import { describe, expect, it } from "vitest";
import { reducePlayback } from "./player";

describe("playback reducer", () => {
  const idle = { status: "idle" as const, currentId: null, failures: 0 };

  it("moves through playing, ended, failed, and skip", () => {
    const playing = reducePlayback(idle, { type: "start", id: "a" });
    expect(playing).toEqual({ status: "playing", currentId: "a", failures: 0 });
    expect(reducePlayback(playing, { type: "ended" })).toEqual({
      status: "ended",
      currentId: null,
      failures: 0,
    });
    expect(reducePlayback(playing, { type: "failed" })).toEqual({
      status: "failed",
      currentId: null,
      failures: 1,
    });
    expect(reducePlayback(playing, { type: "skip", nextId: "b" })).toEqual({
      status: "playing",
      currentId: "b",
      failures: 0,
    });
    expect(reducePlayback(playing, { type: "skip", nextId: null })).toEqual({
      status: "idle",
      currentId: null,
      failures: 0,
    });
  });

  it("increments failures on failed and clears currentId", () => {
    const playing = reducePlayback(idle, { type: "start", id: "a" });
    const once = reducePlayback(playing, { type: "failed" });
    const twice = reducePlayback(once, { type: "failed" });

    expect(twice).toEqual({ status: "failed", currentId: null, failures: 2 });
  });

  it("resets failures on start and skip", () => {
    const playing = reducePlayback(idle, { type: "start", id: "a" });
    const failed = reducePlayback(playing, { type: "failed" });

    expect(reducePlayback(failed, { type: "start", id: "b" })).toEqual({
      status: "playing",
      currentId: "b",
      failures: 0,
    });
    expect(reducePlayback(failed, { type: "skip", nextId: "c" })).toEqual({
      status: "playing",
      currentId: "c",
      failures: 0,
    });
    expect(reducePlayback(failed, { type: "skip", nextId: null })).toEqual({
      status: "idle",
      currentId: null,
      failures: 0,
    });
  });

  it("resets to idle", () => {
    expect(reducePlayback({ status: "failed", currentId: null, failures: 3 }, { type: "reset" })).toEqual({
      status: "idle",
      currentId: null,
      failures: 0,
    });
  });
});
