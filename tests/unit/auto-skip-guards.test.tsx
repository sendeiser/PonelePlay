import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createIframeEngine } from "@/components/player/iframe-engine";
import { PanelAudioEngine } from "@/components/panel/panel-audio-engine";
import type { PlayerTrack } from "@/lib/api/player";

const TRACK_A: PlayerTrack = {
  itemId: "qi-1",
  trackId: "t-1",
  title: "Track One",
  artist: "Artist A",
  source: "youtube",
  durationSeconds: 210,
  youtubeVideoId: "vidAlpha111",
  voteCount: 3,
};

const TRACK_B: PlayerTrack = {
  itemId: "qi-2",
  trackId: "t-2",
  title: "Track Two",
  artist: "Artist B",
  source: "youtube",
  durationSeconds: 195,
  youtubeVideoId: "vidBeta2222",
  voteCount: 4,
};

describe("Auto-skip loop guards (iframe-engine & PanelAudioEngine)", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    delete (window as unknown as { YT?: unknown }).YT;
    vi.restoreAllMocks();
  });

  it("suppresses spurious post-load ENDED in createIframeEngine and cancels pending error timer on track change", async () => {
    vi.useFakeTimers();
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);

    const engine = createIframeEngine(() => iframe);
    const onEnded = vi.fn();
    engine.onEnded(onEnded);
    const detach = engine.attach();

    await engine.load(TRACK_A);

    // Spurious ENDED within 4.5s of load (e.g. previous video teardown) must be ignored
    vi.advanceTimersByTime(1500);
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://www.youtube.com",
        data: JSON.stringify({ event: "onStateChange", info: 0 }),
      }),
    );
    expect(onEnded).not.toHaveBeenCalled();

    // Advance past post-load grace window and emit real PLAYING -> ENDED
    vi.advanceTimersByTime(4000);
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://www.youtube.com",
        data: JSON.stringify({ event: "onStateChange", info: 1 }),
      }),
    );
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://www.youtube.com",
        data: JSON.stringify({ event: "onStateChange", info: 0 }),
      }),
    );
    expect(onEnded).toHaveBeenCalledTimes(1);

    // Cancel pending onError auto-skip timer if track switches before 1200ms elapses
    let ytErrorCb: ((ev: { data: number }) => void) | undefined;
    (window as unknown as { YT: unknown }).YT = {
      Player: vi.fn((_el: unknown, cfg: { events: { onError?: (ev: { data: number }) => void } }) => {
        ytErrorCb = cfg.events.onError;
        return {
          loadVideoById: vi.fn(),
          playVideo: vi.fn(),
          mute: vi.fn(),
          unMute: vi.fn(),
          setVolume: vi.fn(),
        };
      }),
    };
    engine.handshake();
    await act(async () => {
      await Promise.resolve();
    });
    vi.advanceTimersByTime(4000);
    ytErrorCb?.({ data: 150 });
    vi.advanceTimersByTime(500);
    await engine.load(TRACK_B);
    vi.advanceTimersByTime(1000);
    expect(onEnded).toHaveBeenCalledTimes(1);

    // Cleanup
    detach();
    iframe.remove();
  });

  it("sets trackLoadedAt on initial PanelAudioEngine YT mount and ignores unstable onAudioBlockedChange callbacks", async () => {
    vi.useFakeTimers();
    let capturedEvents: {
      onReady?: (ev: { target: Record<string, unknown> }) => void;
      onStateChange?: (ev: { data: number }) => void;
    } = {};

    const playerMock = {
      setVolume: vi.fn(),
      mute: vi.fn(),
      unMute: vi.fn(),
      playVideo: vi.fn(),
      pauseVideo: vi.fn(),
      stopVideo: vi.fn(),
      loadVideoById: vi.fn(),
      getCurrentTime: vi.fn(() => 0),
      getDuration: vi.fn(() => 210),
      getVideoData: vi.fn(() => ({ video_id: TRACK_A.youtubeVideoId })),
    };

    const ytCtor = vi.fn(function (
      this: Record<string, unknown>,
      _host: unknown,
      config: { events: typeof capturedEvents },
    ) {
      capturedEvents = config.events;
      return playerMock;
    });

    (window as unknown as { YT: unknown }).YT = { Player: ytCtor };

    const onTrackEnded = vi.fn();
    const { rerender } = render(
      <PanelAudioEngine
        slug="billar-aurora"
        currentTrack={TRACK_A}
        isPaused={false}
        volume={80}
        isMuted={false}
        onTrackEnded={onTrackEnded}
        onAudioBlockedChange={() => {}}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(ytCtor).toHaveBeenCalledTimes(1);
    act(() => {
      capturedEvents.onReady?.({ target: playerMock });
    });

    // Immediate ENDED right after initial mount (< 6s) must NOT skip
    vi.advanceTimersByTime(1000);
    act(() => {
      capturedEvents.onStateChange?.({ data: 0 });
    });
    expect(onTrackEnded).not.toHaveBeenCalled();

    // Parent re-renders with new inline onAudioBlockedChange -> must NOT re-trigger YT playVideo or constructor
    playerMock.playVideo.mockClear();
    rerender(
      <PanelAudioEngine
        slug="billar-aurora"
        currentTrack={TRACK_A}
        isPaused={false}
        volume={80}
        isMuted={false}
        onTrackEnded={onTrackEnded}
        onAudioBlockedChange={() => {}}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(ytCtor).toHaveBeenCalledTimes(1);
    expect(playerMock.playVideo).not.toHaveBeenCalled();
    expect(playerMock.loadVideoById).not.toHaveBeenCalled();

    // Switching to TRACK_B cleanly loads new video once
    rerender(
      <PanelAudioEngine
        slug="billar-aurora"
        currentTrack={TRACK_B}
        isPaused={false}
        volume={80}
        isMuted={false}
        onTrackEnded={onTrackEnded}
        onAudioBlockedChange={() => {}}
      />,
    );
    expect(playerMock.loadVideoById).toHaveBeenCalledWith({
      videoId: TRACK_B.youtubeVideoId,
      startSeconds: 0,
    });
  });
});
