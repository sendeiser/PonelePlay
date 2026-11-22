import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/lyrics/route";
import {
  cleanTrackQuery,
  parseLrcLyrics,
  parsePlainLyrics,
  parseYoutubeJson3Captions,
  parseYoutubeXmlCaptions,
  resolveActiveLyricIndex,
} from "@/lib/domain/lyrics";

describe("karaoke lyrics domain helpers", () => {
  it("cleans messy YouTube & Karaoke titles and extracts embedded artist - song pairs", () => {
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
      cleanTrackQuery("Bad Bunny - Tití Me Preguntó (Pista Karaoke con Letra)", "Karaoke Hits"),
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

  it("parses YouTube JSON3 and XML timedtext captions while filtering [Música] noise", () => {
    const json3 = {
      events: [
        { tStartMs: 1200, segs: [{ utf8: "[Música]" }] },
        { tStartMs: 5400, segs: [{ utf8: "Ella " }, { utf8: "durmió" }] },
        { tStartMs: 9800, segs: [{ utf8: "al calor\nde las masas" }] },
      ],
    };
    expect(parseYoutubeJson3Captions(json3)).toEqual([
      { timeSec: 5.4, text: "Ella durmió" },
      { timeSec: 9.8, text: "al calor de las masas" },
    ]);

    const xml = `<transcript><text start="2.0" dur="1.5">[Music]</text><text start="6.25" dur="3.0">De m&uacute;sica &amp; luz</text><text start="11.5" dur="2.0">Nada m&#39;as</text></transcript>`;
    expect(parseYoutubeXmlCaptions(xml)).toEqual([
      { timeSec: 6.25, text: "De m&uacute;sica & luz" },
      { timeSec: 11.5, text: "Nada m'as" },
    ]);
  });

  it("resolves active lyric line index with manual offsetSec calibration (positive & negative)", () => {
    const synced = [
      { timeSec: 5, text: "Intro" },
      { timeSec: 12, text: "Verso 1" },
      { timeSec: 25, text: "Coro" },
    ];
    expect(resolveActiveLyricIndex(synced, [], 0, 180, 0)).toBe(0);
    expect(resolveActiveLyricIndex(synced, [], 11.8, 180, 0)).toBe(1);
    // Negative offset (-3s) delays lyrics when YouTube video has a 3s extra intro
    expect(resolveActiveLyricIndex(synced, [], 14.0, 180, -3.0)).toBe(0);
    // Positive offset (+4s) advances lyrics when lyrics lag behind
    expect(resolveActiveLyricIndex(synced, [], 21.5, 180, 4.0)).toBe(2);

    const plain = parsePlainLyrics("Linea 1\n\nLinea 2\nLinea 3\nLinea 4");
    expect(plain).toEqual(["Linea 1", "Linea 2", "Linea 3", "Linea 4"]);
    expect(resolveActiveLyricIndex([], plain, 10, 200, 0)).toBe(0);
    expect(resolveActiveLyricIndex([], plain, 100, 200, 0)).toBeGreaterThanOrEqual(1);
    expect(resolveActiveLyricIndex([], plain, 190, 200, 0)).toBe(3);
  });
});

describe("GET /api/lyrics CDN cache headers and distinct song responses", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns no-store CDN headers and serves distinct lyrics per track query", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("lrclib.net/api/get") && url.includes("Persiana")) {
        return new Response(
          JSON.stringify({
            trackName: "Persiana Americana",
            artistName: "Soda Stereo",
            syncedLyrics: "[00:10.00] Yo te prefiero fuera de foco",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("lrclib.net/api/get") && url.includes("Flaca")) {
        return new Response(
          JSON.stringify({
            trackName: "Flaca",
            artistName: "Andrés Calamaro",
            syncedLyrics: "[00:12.00] Flaca no me claves tus puñales",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify([]), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    });

    const resA = await GET(
      new NextRequest("http://localhost/api/lyrics?title=Persiana%20Americana&artist=Soda%20Stereo"),
    );
    const jsonA = await resA.json();
    expect(resA.headers.get("Cache-Control")).toContain("no-store");
    expect(resA.headers.get("Netlify-CDN-Cache-Control")).toBe("no-store");
    expect(jsonA.found).toBe(true);
    expect(jsonA.trackName).toBe("Persiana Americana");

    const resB = await GET(
      new NextRequest("http://localhost/api/lyrics?title=Flaca&artist=Andres%20Calamaro"),
    );
    const jsonB = await resB.json();
    expect(resB.headers.get("Cache-Control")).toContain("no-store");
    expect(jsonB.found).toBe(true);
    expect(jsonB.trackName).toBe("Flaca");
    expect(jsonB.lines[0].text).toContain("puñales");
  });
});
