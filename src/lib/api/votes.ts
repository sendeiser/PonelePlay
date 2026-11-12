import { createBrowserSupabase } from "./supabase/browser";
import { triggerRoomSyncRefresh } from "@/lib/sync/client";

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

export async function castVote(queueItemId: string, slug?: string): Promise<VoteResult> {
  try {
    const supabase = createBrowserSupabase();
    const { data, error } = await supabase.rpc("cast_vote" as never, {
      p_queue_item_id: queueItemId,
    } as never);

    if (!error && data && typeof data === "object" && (data as VoteResult).ok) {
      if (slug) triggerRoomSyncRefresh(slug);
      return data as VoteResult;
    }

    // If RPC returned a non-duplicate/non-auth error like no_credits, respect it if not fallback-eligible
    const rpcErr = data && typeof data === "object" ? (data as { error?: VoteError }).error : undefined;
    if (rpcErr === "no_credits") {
      return { ok: false, error: "no_credits" };
    }
  } catch {
    // Continue to server API fallback
  }

  // Fallback / Queue Boost via /api/party/vote (allows boosting songs that already entered the queue)
  try {
    const res = await fetch("/api/party/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queueItemId, slug }),
    });
    if (res.ok) {
      const payload = await res.json();
      if (payload?.ok) {
        return {
          ok: true,
          voteCount: Number(payload.voteCount ?? 1),
          balance: Number(payload.creditsBalance ?? 1),
        };
      }
    }
  } catch {
    // Ignore
  }

  return { ok: false, error: "item_closed" };
}
