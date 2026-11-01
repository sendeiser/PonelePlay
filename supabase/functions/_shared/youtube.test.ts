import { describe, expect, it } from "vitest";
import {
  buildYoutubeCacheKey,
  filterYoutubeResults,
  type YoutubeSearchItem,
} from "./youtube";

describe("youtube search and cache helpers", () => {
  it("normalizes the cache key", () => {
    expect(buildYoutubeCacheKey("  Soda   Stereo ", "AR", 10)).toBe(
      "soda stereo|ar|10",
    );
  });

  it("filters live, long, and non-embeddable results", () => {
    const base: YoutubeSearchItem = {
      videoId: "x",
      title: "t",
      channelTitle: "c",
      durationSeconds: 200,
      thumbnailUrl: "",
      embeddable: true,
      isLive: false,
    };

    expect(
      filterYoutubeResults(
        [
          base,
          { ...base, videoId: "live", isLive: true },
          { ...base, videoId: "long", durationSeconds: 481 },
          { ...base, videoId: "no-embed", embeddable: false },
        ],
        480,
      ).map((item) => item.videoId),
    ).toEqual(["x"]);
  });
});

