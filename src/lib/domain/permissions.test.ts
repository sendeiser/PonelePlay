import { describe, expect, it } from "vitest";
import { getPanelRole, panelNavFor } from "./permissions";

describe("permissions", () => {
  it("maps roles correctly", () => {
    expect(getPanelRole(true, null)).toBe("owner");
    expect(getPanelRole(false, { token: "t", expiresAt: "1", staff: { id: "s", name: "n" }, venue: { id: "v", slug: "s", name: "n" } })).toBe("staff");
    expect(getPanelRole(false, null)).toBe("guest");
  });

  it("staff sees only night and codes", () => {
    expect(panelNavFor("staff", "demo").map((i) => i.href)).toEqual([
      "/panel/demo",
      "/panel/demo/codigos",
    ]);
  });

  it("owner sees full navigation", () => {
    expect(panelNavFor("owner", "demo").map((i) => i.label)).toEqual([
      "Noche",
      "Catálogo",
      "Códigos",
      "Personal",
      "Ajustes",
    ]);
  });
});
