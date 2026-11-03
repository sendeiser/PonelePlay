import { describe, expect, it } from "vitest";
import {
  parseYoutubeVideoId,
  parseYoutubePlaylistId,
  validateYoutubeMeta,
  youtubeDedupeKey,
} from "./youtube";

describe("YouTube URL parsing", () => {
  it("normalizes every supported YouTube URL shape", () => {
    expect(parseYoutubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYoutubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=10")).toBe("dQw4w9WgXcQ");
    expect(parseYoutubeVideoId("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYoutubeVideoId("https://music.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYoutubeVideoId("https://vimeo.com/123")).toBeNull();
    expect(youtubeDedupeKey("dQw4w9WgXcQ")).toBe("yt:dQw4w9WgXcQ");
  });

  it("accepts mobile, bare, and timestamped watch URLs", () => {
    expect(parseYoutubeVideoId("https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=42s")).toBe(
      "dQw4w9WgXcQ",
    );
    expect(parseYoutubeVideoId("https://youtube.com/watch?feature=share&v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
    expect(parseYoutubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ#t=10")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("rejects other hosts and malformed IDs", () => {
    expect(parseYoutubeVideoId("https://notyoutube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseYoutubeVideoId("https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseYoutubeVideoId("ftp://youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseYoutubeVideoId("https://www.youtube.com/watch?v=short")).toBeNull();
    expect(parseYoutubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQextra")).toBeNull();
    expect(parseYoutubeVideoId("https://www.youtube.com/watch")).toBeNull();
    expect(parseYoutubeVideoId("https://youtu.be/")).toBeNull();
    expect(parseYoutubeVideoId("https://youtu.be/dQw4w9WgXcQ/extra")).toBeNull();
    expect(parseYoutubeVideoId("https://youtube.com/shorts/dQw4w9WgXcQ/extra")).toBeNull();
    expect(parseYoutubeVideoId("not a url")).toBeNull();
  });
});

describe("YouTube Playlist URL parsing", () => {
  it("extracts playlist IDs from various valid YouTube playlist URLs", () => {
    expect(
      parseYoutubePlaylistId(
        "https://www.youtube.com/playlist?list=PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj",
      ),
    ).toBe("PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj");
    expect(
      parseYoutubePlaylistId(
        "https://music.youtube.com/playlist?list=OLAK5uy_k1234567890abcdef",
      ),
    ).toBe("OLAK5uy_k1234567890abcdef");
    expect(
      parseYoutubePlaylistId(
        "https://m.youtube.com/playlist?list=PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj",
      ),
    ).toBe("PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj");
    expect(
      parseYoutubePlaylistId(
        "https://www.youtube.com/watch?v=kPa7bsKwL-c&list=PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj&index=1",
      ),
    ).toBe("PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj");
    expect(
      parseYoutubePlaylistId(
        "https://youtu.be/kPa7bsKwL-c?list=PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj",
      ),
    ).toBe("PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj");
    expect(parseYoutubePlaylistId("PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj")).toBe(
      "PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj",
    );
    expect(parseYoutubePlaylistId("OLAK5uy_k1234567890abcdef")).toBe(
      "OLAK5uy_k1234567890abcdef",
    );
    expect(
      parseYoutubePlaylistId(
        "youtube.com/playlist?list=PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj",
      ),
    ).toBe("PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj");
  });

  it("returns null for non-playlist inputs", () => {
    expect(parseYoutubePlaylistId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseYoutubePlaylistId("https://spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")).toBeNull();
    expect(parseYoutubePlaylistId("random search query")).toBeNull();
    expect(parseYoutubePlaylistId("")).toBeNull();
  });
});

describe("YouTube metadata validation", () => {
  it("rejects live, non-embeddable, and overlong videos", () => {
    const meta = {
      videoId: "x",
      title: "t",
      channelTitle: "c",
      durationSeconds: 300,
      thumbnailUrl: "",
      embeddable: true,
      isLive: false,
    };
    expect(validateYoutubeMeta(meta, 480)).toBeNull();
    expect(validateYoutubeMeta({ ...meta, isLive: true }, 480)).toBe("live");
    expect(validateYoutubeMeta({ ...meta, embeddable: false }, 480)).toBe("not_embeddable");
    expect(validateYoutubeMeta({ ...meta, durationSeconds: 481 }, 480)).toBe("too_long");
  });

  it("checks live before embeddable before duration", () => {
    const meta = {
      videoId: "x",
      title: "t",
      channelTitle: "c",
      durationSeconds: 481,
      thumbnailUrl: "",
      embeddable: false,
      isLive: true,
    };
    expect(validateYoutubeMeta(meta, 480)).toBe("live");
    expect(validateYoutubeMeta({ ...meta, isLive: false }, 480)).toBe("not_embeddable");
  });

  it("allows a duration exactly at the limit", () => {
    const meta = {
      videoId: "x",
      title: "t",
      channelTitle: "c",
      durationSeconds: 480,
      thumbnailUrl: "",
      embeddable: true,
      isLive: false,
    };
    expect(validateYoutubeMeta(meta, 480)).toBeNull();
  });
});
