import { describe, expect, it } from "vitest";
import { CODE_ALPHABET, CODE_LENGTH, generateCode, isValidCode, normalizeCode } from "./codes";

describe("vote codes", () => {
  it("generates eight characters from the unambiguous alphabet", () => {
    const sequence = [0, 1, 2, 3, 4, 5, 6, 7];
    let cursor = 0;
    const code = generateCode(() => sequence[cursor++] / 32);
    expect(code).toBe("ABCDEFGH");
    expect(code).toHaveLength(CODE_LENGTH);
    expect(CODE_ALPHABET).not.toMatch(/[IO01]/);
  });

  it("normalizes dictation and strips separators", () => {
    expect(normalizeCode(" ab-cd efgh ")).toBe("ABCDEFGH");
  });

  it("rejects ambiguous or wrong-length codes", () => {
    expect(isValidCode("ABCDEFG0")).toBe(false);
    expect(isValidCode("IIIIIIII")).toBe(false);
    expect(isValidCode("ABCDEFG")).toBe(false);
    expect(isValidCode("ABCDEFGH")).toBe(true);
  });
});
