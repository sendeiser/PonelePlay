import { describe, expect, it } from "vitest";
import { mapRedeemResult } from "./redeem";

describe("redeem domain and mapping", () => {
  it("maps duplicate and successful redeems", () => {
    expect(mapRedeemResult({ ok: false, error: "used" })).toEqual({
      tone: "error",
      message: "Ese código ya fue usado.",
    });
    expect(
      mapRedeemResult({ ok: true, code: "MESAPLAY", credits: 5, balance: 8 }),
    ).toEqual({
      tone: "ok",
      message: "Se sumaron 5 votos. Tenés 8.",
    });
  });

  it("maps invalid, expired, and closed errors correctly", () => {
    expect(mapRedeemResult({ ok: false, error: "invalid" })).toEqual({
      tone: "error",
      message: "Código inválido o inexistente.",
    });
    expect(mapRedeemResult({ ok: false, error: "expired" })).toEqual({
      tone: "error",
      message: "El código venció al cerrar la noche.",
    });
    expect(mapRedeemResult({ ok: false, error: "night_closed" })).toEqual({
      tone: "error",
      message: "La noche está cerrada. No se pueden canjear códigos.",
    });
  });
});
