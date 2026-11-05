import { describe, expect, it } from "vitest";
import { getVisiblePanelNavItems } from "@/components/panel/panel-shell";

describe("PanelShell navigation items by venueType", () => {
  it("returns all 5 sections for bar mode", () => {
    const items = getVisiblePanelNavItems("bar", "owner", "billar-aurora");
    expect(items.map((i) => i.href)).toEqual([
      "/panel/billar-aurora",
      "/panel/billar-aurora/catalogo",
      "/panel/billar-aurora/codigos",
      "/panel/billar-aurora/personal",
      "/panel/billar-aurora/ajustes",
    ]);
  });

  it("hides /codigos and /personal in party mode leaving minimalist 3-item navigation", () => {
    const items = getVisiblePanelNavItems("party", "owner", "cumple-tincho");
    expect(items.map((i) => i.href)).toEqual([
      "/panel/cumple-tincho",
      "/panel/cumple-tincho/catalogo",
      "/panel/cumple-tincho/ajustes",
    ]);
  });
});

