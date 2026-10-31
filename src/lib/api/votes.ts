import { createBrowserSupabase } from "./supabase/browser";

export type VoteError =
  | "no_credits"
  | "duplicate"
  | "item_closed"
  | "night_closed"
  | "rate_limited";

export type VoteResult =
  | { ok: true; voteCount: number; balance: number }
  | { ok: false; error: VoteError };

export function voteErrorMessage(error: VoteError): string {
  switch (error) {
    case "no_credits":
      return "Te quedaste sin votos. Canjeá un código.";
    case "duplicate":
      return "Ya votaste este tema esta noche.";
    case "item_closed":
      return "Ese tema ya no está en la cola. Actualizamos la lista.";
    case "night_closed":
      return "La noche está cerrada. No se puede votar.";
    case "rate_limited":
      return "Demasiados votos seguidos. Aguardá unos segundos.";
    default:
      return "No pudimos registrar tu voto. Probá de nuevo.";
  }
}

export async function castVote(queueItemId: string): Promise<VoteResult> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase.rpc("cast_vote" as never, {
    p_queue_item_id: queueItemId,
  } as never);

  if (error) {
    return { ok: false, error: "item_closed" };
  }

  return data as VoteResult;
}
