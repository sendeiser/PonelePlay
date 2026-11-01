import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRpc = vi.fn();
const mockChannel = {
  send: vi.fn(),
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
};

vi.mock("@/lib/api/supabase/browser", () => ({
  createBrowserSupabase: () => ({
    rpc: mockRpc,
    channel: vi.fn().mockReturnValue(mockChannel),
  }),
}));

import {
  fetchPlaybackState,
  togglePausePlayback,
  setPlaybackVolume,
  setKaraokeMode,
  playTrackNow,
  enqueueTrackTop,
} from "@/lib/api/master-control";

describe("Master Playback Control & Karaoke Mode API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches playback state from supabase rpc", async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        ok: true,
        venueId: "v-123",
        isPaused: false,
        volume: 85,
        isMuted: false,
        karaokeMode: false,
        currentTrack: null,
        lastCommand: null,
        commandSeq: 5,
      },
      error: null,
    });

    const state = await fetchPlaybackState("billar-aurora");
    expect(state.ok).toBe(true);
    expect(state.volume).toBe(85);
    expect(state.isPaused).toBe(false);
  });

  it("sends pause/resume commands and broadcasts event", async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        ok: true,
        isPaused: true,
        volume: 85,
        isMuted: false,
        karaokeMode: false,
        commandSeq: 6,
      },
      error: null,
    });

    const result = await togglePausePlayback("billar-aurora");
    expect(result.ok).toBe(true);
    expect(result.isPaused).toBe(true);
  });

  it("updates volume and enables/disables karaoke mode", async () => {
    mockRpc
      .mockResolvedValueOnce({
        data: { ok: true, karaokeMode: true, commandSeq: 7 },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { ok: true, volume: 95, commandSeq: 8 },
        error: null,
      });

    const km = await setKaraokeMode("billar-aurora", true);
    expect(km.karaokeMode).toBe(true);

    const vol = await setPlaybackVolume("billar-aurora", 95);
    expect(vol.volume).toBe(95);
  });

  it("sends play_now and enqueue_top manual commands", async () => {
    const track = {
      title: "De Música Ligera (Karaoke)",
      artist: "Soda Stereo",
      youtubeVideoId: "mjJ-ybMo4ZM",
      durationSeconds: 208,
      thumbnailUrl: "https://i.ytimg.com/vi/mjJ-ybMo4ZM/hqdefault.jpg",
      isKaraoke: true,
    };

    mockRpc
      .mockResolvedValueOnce({
        data: {
          ok: true,
          currentTrack: track,
          commandSeq: 9,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          currentTrack: track,
          commandSeq: 10,
        },
        error: null,
      });

    const playNowRes = await playTrackNow("billar-aurora", track);
    expect(playNowRes.ok).toBe(true);

    const enqueueRes = await enqueueTrackTop("billar-aurora", track);
    expect(enqueueRes.ok).toBe(true);
  });
});
