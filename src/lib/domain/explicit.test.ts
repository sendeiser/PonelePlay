import { describe, expect, it } from "vitest";
import { DEFAULT_EXPLICIT_KEYWORDS, findExplicitKeyword, normalizeForMatch } from "./explicit";

describe("normalizeForMatch", () => {
  it("normalizes accents and case", () => {
    expect(normalizeForMatch("  PÚTA  Madre ")).toBe("puta madre");
  });
});

describe("findExplicitKeyword", () => {
  it("matches whole words only", () => {
    expect(findExplicitKeyword("La Puta Madre", ["puta"])).toBe("puta");
    expect(findExplicitKeyword("FUCK this", ["fuck"])).toBe("fuck");
    expect(findExplicitKeyword("Sexto sentido", ["sex"])).toBeNull();
  });

  it("preserves the matched keyword exactly as supplied", () => {
    expect(findExplicitKeyword("La PÚTA Madre", ["PÚTA"])).toBe("PÚTA");
  });

  it("supports multi-word keywords", () => {
    expect(findExplicitKeyword("sos un Hijo de Puta", ["hijo de puta"])).toBe("hijo de puta");
  });

  it("escapes regex metacharacters in keywords", () => {
    expect(findExplicitKeyword("a.b", ["a.b"])).toBe("a.b");
    expect(findExplicitKeyword("axb", ["a.b"])).toBeNull();
  });

  it("returns null when nothing matches", () => {
    expect(findExplicitKeyword("una propuesta tranquila", ["fuck", "mierda"])).toBeNull();
  });
});

describe("DEFAULT_EXPLICIT_KEYWORDS", () => {
  it("flags common Spanish and English strong profanity", () => {
    expect(findExplicitKeyword("what the FUCK", DEFAULT_EXPLICIT_KEYWORDS)).toBe("fuck");
    expect(findExplicitKeyword("esto es una mierda", DEFAULT_EXPLICIT_KEYWORDS)).toBe("mierda");
  });

  it("does not match substrings of ordinary words", () => {
    expect(findExplicitKeyword("Sexto sentido", DEFAULT_EXPLICIT_KEYWORDS)).toBeNull();
  });
});
