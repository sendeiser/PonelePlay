import { describe, expect, it } from "vitest";
import { validateUpload, uploadTrackPath } from "./upload";

describe("validateUpload", () => {
  it("accepts audio under 25 MB and rejects spoofable inputs", () => {
    expect(
      validateUpload({
        name: "song.mp3",
        size: 25 * 1024 * 1024,
        type: "audio/mpeg",
      }),
    ).toBeNull();

    expect(
      validateUpload({
        name: "song.mp3",
        size: 25 * 1024 * 1024 + 1,
        type: "audio/mpeg",
      }),
    ).toBe("too_large");

    expect(
      validateUpload({
        name: "song.mp3",
        size: 10,
        type: "application/octet-stream",
      }),
    ).toBe("invalid_type");

    expect(
      validateUpload({
        name: "song.exe",
        size: 10,
        type: "audio/mpeg",
      }),
    ).toBe("invalid_type");
  });

  it("builds the storage path correctly", () => {
    expect(uploadTrackPath("venue-123", "abc123sha")).toBe(
      "venue-123/abc123sha.mp3",
    );
  });
});

