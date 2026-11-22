import { createRef } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerTrack } from "@/lib/api/player";
import type { PlaybackAnchor } from "@/lib/sync/protocol";
import {
  TvAudioEngine,
  resolveUploadAudioUrl,
  type TvAudioEngineRef,
} from "@/components/player/tv-audio-engine";

vi.mock("@/lib/api/supabase/browser", () => ({
  createBrowserSupabase: () => ({
    storage: {
      from: (bucket: string) => ({
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://cdn.example.com/${bucket}/${path}` },
        }),
      }),
    },
  }),
}));

const UPLOAD_TRACK: PlayerTrack = {
  itemId: "u-1",
  trackId: "u-1",
  title: "Cumbia Local",
  artist: "DJ Test",
  source: "upload",
  storagePath: "venues/bar-1/cumbia.mp3",
  youtubeVideoId: null,
  durationSeconds: 200,
  voteCount: 3,
};

const YT_TRACK: PlayerTrack = {
  itemId: "yt-1",
  trackId: "yt-1",
  title: "De Música Ligera",
  artist: "Soda Stereo",
  source: "youtube",
  youtubeVideoId: "T_FkEw27XJ0",
  storagePath: null,
  durationSeconds: 215,
  voteCount: 5,
};

function makeAnchor(track: PlayerTrack, posSec: number, serverMs: number): PlaybackAnchor {
  return {
    seq: 1,
    seekSeq: 1,
    track: {
      itemId: track.itemId,
      trackId: track.trackId,
      title: track.title,
      artist: track.artist,
      source: track.source,
      durationSeconds: track.durationSeconds,
      youtubeVideoId: track.youtubeVideoId ?? null,
      storagePath: track.storagePath ?? null,
    },
    isPaused: false,
    anchorPositionSec: posSec,
    anchorServerMs: serverMs,
    volume: 80,
    cabinaMuted: false,
    tvMuted: false,
    karaokeMode: false,
    lastCommand: "play_now",
    displayConfig: null,
  };
}

describe("TvAudioEngine (Audio-Only 3-Way Routing)", () => {
  let playSpy: ReturnType<typeof vi.fn>;
  let pauseSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    playSpy = vi.fn(() => Promise.resolve());
    pauseSpy = vi.fn();
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      writable: true,
      value: playSpy,
    });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", {
      configurable: true,
      writable: true,
      value: pauseSpy,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("resolves uploaded audio URL via /api/audio signed proxy or direct HTTP URL", () => {
    expect(resolveUploadAudioUrl(UPLOAD_TRACK)).toBe(
      "/api/audio?path=venues%2Fbar-1%2Fcumbia.mp3",
    );
    expect(
      resolveUploadAudioUrl({ storagePath: null, youtubeVideoId: "https://audio.test/song.mp3" }),
    ).toBe("https://audio.test/song.mp3");
    expect(resolveUploadAudioUrl(YT_TRACK)).toBe("");
  });

  it("does not play audio or mount a YouTube iframe when audioActive is false (CABINA_ONLY)", () => {
    const { container } = render(
      <TvAudioEngine
        track={YT_TRACK}
        audioActive={false}
        syncBothMode={false}
        isPaused={false}
        volume={80}
        anchor={makeAnchor(YT_TRACK, 10, 10_000)}
        estimatedServerMs={() => 10_000}
      />,
    );

    expect(container.querySelector("iframe")).toBeNull();
    expect(playSpy).not.toHaveBeenCalled();
  });

  it("plays uploaded MP3 track via HTML5 <audio> using /api/audio proxy in TV_ONLY without mounting YouTube iframe", () => {
    const { container } = render(
      <TvAudioEngine
        track={UPLOAD_TRACK}
        audioActive={true}
        syncBothMode={false}
        isPaused={false}
        volume={75}
        anchor={makeAnchor(UPLOAD_TRACK, 0, 10_000)}
        estimatedServerMs={() => 10_000}
      />,
    );

    expect(container.querySelector("iframe")).toBeNull();
    const audio = container.querySelector("audio") as HTMLAudioElement | null;
    expect(audio).not.toBeNull();
    expect(audio?.getAttribute("src")).toBe(
      "/api/audio?path=venues%2Fbar-1%2Fcumbia.mp3",
    );
    expect(playSpy).toHaveBeenCalled();
  });

  it("does not re-seek or re-trigger play on volume drag or cloned track identity", () => {
    const anchor = makeAnchor(UPLOAD_TRACK, 40, 10_000);
    const { container, rerender } = render(
      <TvAudioEngine
        track={UPLOAD_TRACK}
        audioActive={true}
        syncBothMode={false}
        isPaused={false}
        volume={75}
        anchor={anchor}
        estimatedServerMs={() => 10_000}
      />,
    );

    const audio = container.querySelector("audio") as HTMLAudioElement;
    expect(playSpy).toHaveBeenCalledTimes(1);
    audio.currentTime = 43;

    rerender(
      <TvAudioEngine
        track={{ ...UPLOAD_TRACK }}
        audioActive={true}
        syncBothMode={false}
        isPaused={false}
        volume={50}
        anchor={anchor}
        estimatedServerMs={() => 13_000}
      />,
    );

    expect(audio.volume).toBeCloseTo(0.5, 2);
    expect(audio.currentTime).toBe(43);
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it("clears loadedUploadSrc on CABINA_ONLY so returning to TV_ONLY re-seeks to current anchor", () => {
    const { container, rerender } = render(
      <TvAudioEngine
        track={UPLOAD_TRACK}
        audioActive={true}
        syncBothMode={false}
        isPaused={false}
        volume={80}
        anchor={makeAnchor(UPLOAD_TRACK, 10, 10_000)}
        estimatedServerMs={() => 10_000}
      />,
    );

    const audio = container.querySelector("audio") as HTMLAudioElement;
    audio.currentTime = 12;

    rerender(
      <TvAudioEngine
        track={UPLOAD_TRACK}
        audioActive={false}
        syncBothMode={false}
        isPaused={false}
        volume={80}
        anchor={makeAnchor(UPLOAD_TRACK, 30, 30_000)}
        estimatedServerMs={() => 30_000}
      />,
    );

    rerender(
      <TvAudioEngine
        track={UPLOAD_TRACK}
        audioActive={true}
        syncBothMode={false}
        isPaused={false}
        volume={80}
        anchor={makeAnchor(UPLOAD_TRACK, 65, 65_000)}
        estimatedServerMs={() => 65_000}
      />,
    );

    expect(audio.currentTime).toBeCloseTo(65, 1);
  });

  it("pauses and mutes immediately when switching to CABINA_ONLY mid-song", () => {
    const anchor = makeAnchor(UPLOAD_TRACK, 20, 10_000);
    const { container, rerender } = render(
      <TvAudioEngine
        track={UPLOAD_TRACK}
        audioActive={true}
        syncBothMode={true}
        isPaused={false}
        volume={80}
        anchor={anchor}
        estimatedServerMs={() => 10_000}
      />,
    );

    const audio = container.querySelector("audio") as HTMLAudioElement;
    pauseSpy.mockClear();

    rerender(
      <TvAudioEngine
        track={UPLOAD_TRACK}
        audioActive={false}
        syncBothMode={false}
        isPaused={false}
        volume={80}
        anchor={{ ...anchor, tvMuted: true }}
        estimatedServerMs={() => 11_000}
      />,
    );

    expect(pauseSpy).toHaveBeenCalled();
    expect(audio.muted).toBe(true);
    expect(audio.playbackRate).toBe(1);
  });

  it("applies continuous elastic playbackRate (1.01..1.05) in BOTH mode when HTML5 <audio> lags anchor", () => {
    vi.useFakeTimers();
    const anchor = makeAnchor(UPLOAD_TRACK, 25, 10_000);
    let serverNow = 10_000;

    const { container } = render(
      <TvAudioEngine
        track={UPLOAD_TRACK}
        audioActive={true}
        syncBothMode={true}
        isPaused={false}
        volume={80}
        anchor={anchor}
        estimatedServerMs={() => serverNow}
      />,
    );

    const audio = container.querySelector("audio") as HTMLAudioElement;
    Object.defineProperty(audio, "readyState", { configurable: true, value: 4 });
    // Anchor expects 25.5s at serverNow=10_500; audio lags at 25.15s (-0.35s drift)
    serverNow = 10_500;
    audio.currentTime = 25.15;

    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(audio.playbackRate).toBeGreaterThan(1);
    expect(audio.playbackRate).toBeLessThanOrEqual(1.05);
  });

  it("reports autoplay rejection via onBlockedChange(true) and recovers on unlockAudio()", async () => {
    const onBlockedChange = vi.fn();
    const ref = createRef<TvAudioEngineRef>();
    playSpy.mockImplementationOnce(() => Promise.reject(new Error("NotAllowedError")));

    render(
      <TvAudioEngine
        ref={ref}
        track={UPLOAD_TRACK}
        audioActive={true}
        syncBothMode={false}
        isPaused={false}
        volume={80}
        anchor={makeAnchor(UPLOAD_TRACK, 0, 10_000)}
        estimatedServerMs={() => 10_000}
        onBlockedChange={onBlockedChange}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(onBlockedChange).toHaveBeenCalledWith(true);

    playSpy.mockImplementationOnce(() => Promise.resolve());
    await act(async () => {
      ref.current?.unlockAudio();
      await Promise.resolve();
    });
    expect(onBlockedChange).toHaveBeenCalledWith(false);
  });

  it("promotes single YouTube iframe to fullscreen muted in CABINA_ONLY when videoVisible is true", () => {
    const onBlockedChange = vi.fn();
    const { container, rerender } = render(
      <TvAudioEngine
        track={YT_TRACK}
        audioActive={false}
        syncBothMode={false}
        videoVisible={true}
        isPaused={false}
        volume={80}
        anchor={makeAnchor(YT_TRACK, 12, 10_000)}
        estimatedServerMs={() => 10_000}
        onBlockedChange={onBlockedChange}
      />,
    );

    const wrapper = container.querySelector("#poneleplay-tv-audio-engine");
    const iframe = container.querySelector("#poneleplay-tv-audio-iframe") as HTMLIFrameElement | null;
    expect(wrapper?.className).toContain("fixed inset-0");
    expect(wrapper?.getAttribute("aria-hidden")).toBe("false");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("src")).toContain("mute=1");
    expect(onBlockedChange).not.toHaveBeenCalledWith(true);

    // Switching from CABINA_ONLY to TV_ONLY mid-karaoke keeps the SAME iframe mounted without reload
    rerender(
      <TvAudioEngine
        track={YT_TRACK}
        audioActive={true}
        syncBothMode={false}
        videoVisible={true}
        isPaused={false}
        volume={85}
        anchor={makeAnchor(YT_TRACK, 14, 12_000)}
        estimatedServerMs={() => 12_000}
        onBlockedChange={onBlockedChange}
      />,
    );
    const sameIframe = container.querySelector("#poneleplay-tv-audio-iframe");
    expect(sameIframe).toBe(iframe);
  });
});
