import { describe, expect, it } from "vitest";
import { parseYoutubePlaylistId } from "@/lib/domain/youtube";
import { parseDurationString } from "@/lib/server/youtube-playlist";

describe("YouTube Playlist Features", () => {
  it("parses diverse YouTube playlist URL formats accurately", () => {
    // 1. Standard playlist link
    expect(
      parseYoutubePlaylistId(
        "https://www.youtube.com/playlist?list=PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj",
      ),
    ).toBe("PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj");

    // 2. YouTube Music album / playlist
    expect(
      parseYoutubePlaylistId(
        "https://music.youtube.com/playlist?list=OLAK5uy_k1234567890abcdef",
      ),
    ).toBe("OLAK5uy_k1234567890abcdef");

    // 3. Watch URL with list param
    expect(
      parseYoutubePlaylistId(
        "https://www.youtube.com/watch?v=kPa7bsKwL-c&list=PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj&index=2",
      ),
    ).toBe("PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj");

    // 4. Shortened youtu.be with list param
    expect(
      parseYoutubePlaylistId(
        "https://youtu.be/kPa7bsKwL-c?list=PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj",
      ),
    ).toBe("PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj");

    // 5. Bare playlist ID
    expect(parseYoutubePlaylistId("PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj")).toBe(
      "PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj",
    );
  });

  it("parses duration strings cleanly to seconds", () => {
    expect(parseDurationString("3:45")).toBe(225);
    expect(parseDurationString("1:02:15")).toBe(3735);
    expect(parseDurationString("0:30")).toBe(30);
    expect(parseDurationString(undefined)).toBe(210);
  });
});

