import { describe, expect, it } from "vitest";
import { slugifyVenueName } from "./venue";

describe("venue slug", () => {
  it("creates a URL-safe venue slug", () => {
    expect(slugifyVenueName("Billar Aurora!")).toBe("billar-aurora");
    expect(slugifyVenueName("  Café  y  Billar  ")).toBe("cafe-y-billar");
    expect(slugifyVenueName("###")).toBe("");
  });
});
