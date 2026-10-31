import { describe, expect, it } from "vitest";
import { voteErrorMessage } from "./votes";

describe("votes domain and mapping", () => {
  it("explains no credits, duplicates, and closed items", () => {
    expect(voteErrorMessage("no_credits")).toBe(
      "Te quedaste sin votos. Canjeá un código.",
    );
    expect(voteErrorMessage("duplicate")).toBe(
      "Ya votaste este tema esta noche.",
    );
    expect(voteErrorMessage("item_closed")).toBe(
      "Ese tema ya no está en la cola. Actualizamos la lista.",
    );
  });

  it("handles night closed and rate limits", () => {
    expect(voteErrorMessage("night_closed")).toBe(
      "La noche está cerrada. No se puede votar.",
    );
    expect(voteErrorMessage("rate_limited")).toBe(
      "Demasiados votos seguidos. Aguardá unos segundos.",
    );
  });
});
