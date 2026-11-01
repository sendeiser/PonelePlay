import { describe, expect, it } from "vitest";
import { messageForApiError } from "./error-messages";

describe("error messages mapping", () => {
  it("maps proposal errors to Spanish copy", () => {
    expect(messageForApiError("duplicate_active")).toBe(
      "Ese tema ya está en la cola. Votalo para que suene antes.",
    );
    expect(messageForApiError("explicit")).toBe(
      "Ese tema está bloqueado por el filtro de contenido.",
    );
    expect(messageForApiError("queue_full")).toBe(
      "La cola está llena. Podés votar los temas que ya están.",
    );
    expect(messageForApiError("rate_limited")).toBe(
      "Esperá 30 segundos antes de proponer otro tema.",
    );
  });

  it("handles night closed, proposals disabled, and default error", () => {
    expect(messageForApiError("night_closed")).toBe(
      "La noche está cerrada. No se pueden proponer temas.",
    );
    expect(messageForApiError("proposals_disabled")).toBe(
      "Las propuestas están temporalmente pausadas por el bar.",
    );
    expect(messageForApiError("proposal_limit")).toBe(
      "Alcanzaste el límite de propuestas de esta noche.",
    );
    expect(messageForApiError("unknown")).toBe(
      "Ocurrió un error inesperado. Probá de nuevo.",
    );
  });
});

