export type ApiErrorCode =
  | "duplicate_active"
  | "explicit"
  | "queue_full"
  | "proposal_limit"
  | "proposals_disabled"
  | "night_closed"
  | "rate_limited"
  | "unknown"
  | string;

export function messageForApiError(code: ApiErrorCode): string {
  switch (code) {
    case "duplicate_active":
      return "Ese tema ya está en la cola. Votalo para que suene antes.";
    case "explicit":
      return "Ese tema está bloqueado por el filtro de contenido.";
    case "queue_full":
      return "La cola está llena. Podés votar los temas que ya están.";
    case "proposal_limit":
      return "Alcanzaste el límite de propuestas de esta noche.";
    case "proposals_disabled":
      return "Las propuestas están temporalmente pausadas por el bar.";
    case "night_closed":
      return "La noche está cerrada. No se pueden proponer temas.";
    case "rate_limited":
      return "Esperá 30 segundos antes de proponer otro tema.";
    default:
      return "Ocurrió un error inesperado. Probá de nuevo.";
  }
}

