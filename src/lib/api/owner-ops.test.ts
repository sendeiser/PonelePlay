import { describe, expect, it } from "vitest";
import { validateStaffPin, venueQrUrl } from "./owner-ops";

describe("Owner Ops", () => {
  it("builds the public client URL", () => {
    expect(venueQrUrl("https://poneleplay.app", "billar-aurora")).toBe(
      "https://poneleplay.app/p/billar-aurora",
    );
    expect(venueQrUrl("http://localhost:3000/", "pool-club")).toBe(
      "http://localhost:3000/p/pool-club",
    );
  });

  it("validates 6-digit staff PIN", () => {
    expect(validateStaffPin("123456")).toBe(true);
    expect(validateStaffPin("000000")).toBe(true);
    expect(validateStaffPin("12345")).toBe(false);
    expect(validateStaffPin("1234567")).toBe(false);
    expect(validateStaffPin("12345a")).toBe(false);
    expect(validateStaffPin("")).toBe(false);
  });
});

