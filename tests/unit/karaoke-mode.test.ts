import { describe, expect, it } from "vitest";
import {
  isTrackKaraokeCandidate,
  normalizeKaraokeOverrideMode,
  resolveKaraokePresentation,
} from "@/lib/domain/karaoke";

describe("karaoke presentation domain logic", () => {
  it("detects explicit isKaraoke flag and clear karaoke keywords in title/artist", () => {
    expect(
      isTrackKaraokeCandidate({ title: "De Música Ligera", artist: "Soda Stereo", isKaraoke: true }),
    ).toBe(true);
    expect(
      isTrackKaraokeCandidate({ title: "La Bikina (Karaoke)", artist: "Luis Miguel" }),
    ).toBe(true);
    expect(
      isTrackKaraokeCandidate({ title: "Despacito Pista Karaoke", artist: "Canal Musical" }),
    ).toBe(true);
    expect(
      isTrackKaraokeCandidate({ title: "Flowers", artist: "Sing King" }),
    ).toBe(true);
    expect(
      isTrackKaraokeCandidate({ title: "Persiana Americana (Con Letra)", artist: "Soda" }),
    ).toBe(true);
  });

  it("avoids false positives on plain instrumental tracks without karaoke signal", () => {
    expect(
      isTrackKaraokeCandidate({
        title: "Bohemian Rhapsody (Instrumental)",
        artist: "Queen",
        isKaraoke: false,
      }),
    ).toBe(false);
    expect(
      isTrackKaraokeCandidate({ title: "De Música Ligera", artist: "Soda Stereo" }),
    ).toBe(false);
    expect(isTrackKaraokeCandidate(null)).toBe(false);
  });

  it("resolves hybrid presentation cleanly across auto, overrides, uploads, and embed errors", () => {
    const ytKaraoke = {
      title: "Lamento Boliviano Karaoke",
      artist: "KaraFun",
      source: "youtube",
      youtubeVideoId: "abc12345678",
      isKaraoke: false,
    };
    const ytNormal = {
      title: "Lamento Boliviano",
      artist: "Enanitos Verdes",
      source: "youtube",
      youtubeVideoId: "xyz12345678",
      isKaraoke: false,
    };
    const mp3Karaoke = {
      title: "Lamento Boliviano Karaoke",
      artist: "DJ",
      source: "upload",
      youtubeVideoId: null,
      isKaraoke: true,
    };

    expect(resolveKaraokePresentation({ track: ytKaraoke, boothKaraokeMode: false })).toBe("video");
    expect(resolveKaraokePresentation({ track: ytNormal, boothKaraokeMode: false })).toBe("none");
    expect(resolveKaraokePresentation({ track: ytNormal, boothKaraokeMode: true })).toBe("lyrics");
    expect(resolveKaraokePresentation({ track: mp3Karaoke, boothKaraokeMode: false })).toBe("lyrics");
    expect(
      resolveKaraokePresentation({
        track: ytKaraoke,
        boothKaraokeMode: true,
        videoEmbedFailed: true,
      }),
    ).toBe("lyrics");
    expect(
      resolveKaraokePresentation({
        track: ytKaraoke,
        boothKaraokeMode: true,
        overrideMode: "off",
      }),
    ).toBe("none");
    expect(
      resolveKaraokePresentation({
        track: ytKaraoke,
        boothKaraokeMode: true,
        overrideMode: "force_lyrics",
      }),
    ).toBe("lyrics");
    expect(
      resolveKaraokePresentation({
        track: ytNormal,
        boothKaraokeMode: false,
        overrideMode: "force_video",
      }),
    ).toBe("video");
    expect(
      resolveKaraokePresentation({
        track: mp3Karaoke,
        boothKaraokeMode: false,
        overrideMode: "force_video",
      }),
    ).toBe("lyrics");
    expect(normalizeKaraokeOverrideMode("force_video")).toBe("force_video");
    expect(normalizeKaraokeOverrideMode("invalid")).toBe("auto");
  });
});
