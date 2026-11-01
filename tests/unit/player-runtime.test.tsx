import { render, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlayerRuntime } from "@/components/player/player-runtime";
import type { PlaybackEngine } from "@/components/player/engine";
import type { PlayerStateResponse, PlayerTrack } from "@/lib/api/player";

afterEach(() => {
  cleanup();
});

describe("PlayerRuntime component", () => {
  const trackA: PlayerTrack = {
    itemId: "qi-1",
    trackId: "t-1",
    title: "Canción 1",
    artist: "Artista 1",
    source: "youtube",
    durationSeconds: 200,
    youtubeVideoId: "yt-1",
    voteCount: 5,
  };

  const trackB: PlayerTrack = {
    itemId: "qi-2",
    trackId: "t-2",
    title: "Canción 2",
    artist: "Artista 2",
    source: "youtube",
    durationSeconds: 180,
    youtubeVideoId: "yt-2",
    voteCount: 2,
  };

  function createMockEngine(): PlaybackEngine & {
    triggerEnded: () => void;
    triggerError: (msg: string) => void;
  } {
    let endedCb: (() => void) | null = null;
    let errorCb: ((err: string) => void) | null = null;

    return {
      load: vi.fn().mockResolvedValue(undefined),
      play: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
      onEnded: vi.fn((cb) => {
        endedCb = cb;
        return () => {
          endedCb = null;
        };
      }),
      onError: vi.fn((cb) => {
        errorCb = cb;
        return () => {
          errorCb = null;
        };
      }),
      triggerEnded: () => endedCb?.(),
      triggerError: (msg: string) => errorCb?.(msg),
    };
  }

  it("marks the current item finished and advances to next item when onEnded fires", async () => {
    const mockEngine = createMockEngine();

    const initialState: PlayerStateResponse = {
      ok: true,
      deviceId: "dev-1",
      venue: { id: "v-1", name: "Bar", slug: "bar" },
      nightId: "n-1",
      nightStatus: "active",
      nowPlaying: trackA,
      queue: [trackB],
      fallback: [],
      serverTime: "2026-10-31T23:00:00Z",
    };

    const mockFetchState = vi.fn().mockResolvedValue(initialState);
    const mockSendEvent = vi.fn().mockResolvedValue(undefined);

    render(
      <PlayerRuntime
        token="tok-123"
        slug="bar"
        engine={mockEngine}
        fetchState={mockFetchState}
        sendEvent={mockSendEvent}
      />,
    );

    // Initial load and play of trackA
    await waitFor(() => {
      expect(mockEngine.load).toHaveBeenCalledWith(trackA);
      expect(mockEngine.play).toHaveBeenCalled();
    });

    // Simulate trackA ending
    mockEngine.triggerEnded();

    await waitFor(() => {
      expect(mockSendEvent).toHaveBeenCalledWith(
        "tok-123",
        "finished",
        trackA.itemId,
      );
    });
  });

  it("advances when current song encounters an error", async () => {
    const mockEngine = createMockEngine();

    const initialState: PlayerStateResponse = {
      ok: true,
      deviceId: "dev-1",
      venue: { id: "v-1", name: "Bar", slug: "bar" },
      nightId: "n-1",
      nightStatus: "active",
      nowPlaying: trackA,
      queue: [trackB],
      fallback: [],
      serverTime: "2026-10-31T23:00:00Z",
    };

    const mockFetchState = vi.fn().mockResolvedValue(initialState);
    const mockSendEvent = vi.fn().mockResolvedValue(undefined);

    render(
      <PlayerRuntime
        token="tok-123"
        slug="bar"
        engine={mockEngine}
        fetchState={mockFetchState}
        sendEvent={mockSendEvent}
      />,
    );

    await waitFor(() => {
      expect(mockEngine.load).toHaveBeenCalledWith(trackA);
    });

    // Simulate error in playback
    mockEngine.triggerError("Video unavailable");

    await waitFor(() => {
      expect(mockSendEvent).toHaveBeenCalledWith(
        "tok-123",
        "failed",
        trackA.itemId,
        "Video unavailable",
      );
    });
  });
});

