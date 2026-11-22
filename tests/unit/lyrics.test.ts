import { describe, expect, it } from "vitest";
import {
  cleanTrackQuery,
  parseLrcLyrics,
  parsePlainLyrics,
  resolveActiveLyricIndex,
} from "@/lib/domain/lyrics";

describe("karaoke lyrics domain helpers", () => {
  it("cleans messy YouTube titles and extracts embedded artist - song pairs", () => {
    expect(
      cleanTrackQuery(
        "Soda Stereo - De Música Ligera (Video Oficial) [Karaoke HD]",
        "SodaStereoVEVO",
      ),
    ).toEqual({
      title: "De Música Ligera",
      artist: "Soda Stereo",
    });

    expect(
      cleanTrackQuery("La Bachata (Official Video) | Karaoke", "Manuel Turizo - Topic"),
    ).toEqual({
      title: "La Bachata",
      artist: "Manuel Turizo",
    });

    expect(
      cleanTrackQuery("Bad Bunny - Tití Me Preguntó (Letra)", "YouTube"),
    ).toEqual({
      title: "Tití Me Preguntó",
      artist: "Bad Bunny",
    });
  });

  it("parses LRC timestamps including multi-timestamp chorus lines and sorts chronologically", () => {
    const lrc = `
[ti:Test Song]
[00:10.50] Primera línea
[00:15.20][01:05.00] Estribillo repetido
[00:20.000] Tercera línea
`;
    const parsed = parseLrcLyrics(lrc);
    expect(parsed).toEqual([
      { timeSec: 10.5, text: "Primera línea" },
      { timeSec: 15.2, text: "Estribillo repetido" },
      { timeSec: 20, text: "Tercera línea" },
      { timeSec: 65, text: "Estribillo repetido" },
    ]);
  });

  it("resolves active lyric line index for synced LRC and proportional plain fallback", () => {
    const synced = [
      { timeSec: 5, text: "Intro" },
      { timeSec: 12, text: "Verso 1" },
      { timeSec: 25, text: "Coro" },
    ];
    expect(resolveActiveLyricIndex(synced, [], 0, 180)).toBe(0);
    expect(resolveActiveLyricIndex(synced, [], 11.8, 180)).toBe(1);
    expect(resolveActiveLyricIndex(synced, [], 30, 180)).toBe(2);

    const plain = parsePlainLyrics("Linea 1\n\nLinea 2\nLinea 3\nLinea 4");
    expect(plain).toEqual(["Linea 1", "Linea 2", "Linea 3", "Linea 4"]);
    expect(resolveActiveLyricIndex([], plain, 10, 200)).toBe(0);
    expect(resolveActiveLyricIndex([], plain, 100, 200)).toBeGreaterThanOrEqual(1);
    expect(resolveActiveLyricIndex([], plain, 190, 200)).toBe(3);
  });
});
