import { createBrowserSupabase } from "./supabase/browser";
import { nightActionResponseSchema } from "./contracts";

export async function openNight(token?: string): Promise<{ nightId: string }> {
  if (token) {
    const res = await fetch("/api/staff/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-staff-token": token,
      },
      body: JSON.stringify({ action: "open_night" }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error || "Error al abrir la noche");
    }
    return (await res.json()) as { nightId: string };
  }

  const supabase = createBrowserSupabase();
  const { data, error } = await supabase.rpc("owner_open_night" as never);
  if (error) {
    throw new Error(error.message);
  }
  const parsed = nightActionResponseSchema.parse(data);
  return { nightId: parsed.nightId };
}

export async function closeNight(token?: string): Promise<{ nightId: string }> {
  if (token) {
    const res = await fetch("/api/staff/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-staff-token": token,
      },
      body: JSON.stringify({ action: "close_night" }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error || "Error al cerrar la noche");
    }
    return (await res.json()) as { nightId: string };
  }

  const supabase = createBrowserSupabase();
  const { data, error } = await supabase.rpc("owner_close_night" as never);
  if (error) {
    throw new Error(error.message);
  }
  const parsed = nightActionResponseSchema.parse(data);
  return { nightId: parsed.nightId };
}

export async function setProposalsEnabled(
  enabled: boolean,
  venueId: string,
  token?: string,
): Promise<void> {
  if (token) {
    const res = await fetch("/api/staff/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-staff-token": token,
      },
      body: JSON.stringify({ action: "set_proposals_enabled", enabled }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error || "Error al cambiar propuestas");
    }
    return;
  }

  const supabase = createBrowserSupabase();
  const { error } = await supabase
    .from("venue_settings")
    .update({ proposals_enabled: enabled, updated_at: new Date().toISOString() })
    .eq("venue_id", venueId);

  if (error) {
    throw new Error(error.message);
  }
}

function mapModerationError(code: string): string {
  switch (code) {
    case "night_closed":
      return "La noche está cerrada";
    case "not_found":
      return "No se encontró la canción en la cola";
    case "not_queued":
      return "Solo se pueden vetar temas que estén en cola de espera";
    case "invalid_status":
      return "El tema ya fue reproducido o salteado";
    case "forbidden":
      return "No tenés permisos para realizar esta acción";
    default:
      return "Error al moderar la cola de reproducción";
  }
}

export async function skipCurrent(
  queueItemId: string,
  token?: string,
): Promise<void> {
  if (
    !queueItemId ||
    queueItemId.startsWith("fb-") ||
    queueItemId.startsWith("demo-") ||
    queueItemId.startsWith("manual-")
  ) {
    return;
  }

  if (token) {
    const res = await fetch("/api/staff/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-staff-token": token,
      },
      body: JSON.stringify({ action: "skip", queueItemId }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error || "Error al saltear canción");
    }
    return;
  }

  const supabase = createBrowserSupabase();
  const { data, error } = await supabase.rpc("owner_queue_action" as never, {
    p_item_id: queueItemId,
    p_action: "skip",
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  const res = data as { ok?: boolean; error?: string } | null;
  if (!res || res.ok || res.error === "invalid_status") {
    return;
  }

  if (res.error) {
    throw new Error(mapModerationError(res.error));
  }
}

export async function vetoItem(
  queueItemId: string,
  token?: string,
): Promise<void> {
  if (
    !queueItemId ||
    queueItemId.startsWith("fb-") ||
    queueItemId.startsWith("demo-") ||
    queueItemId.startsWith("manual-")
  ) {
    return;
  }

  if (token) {
    const res = await fetch("/api/staff/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-staff-token": token,
      },
      body: JSON.stringify({ action: "veto", queueItemId }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error || "Error al vetar canción");
    }
    return;
  }

  const supabase = createBrowserSupabase();
  const { data, error } = await supabase.rpc("owner_queue_action" as never, {
    p_item_id: queueItemId,
    p_action: "veto",
  } as never);

  const res = data as { ok?: boolean; error?: string } | null;
  if (!error && res && res.ok) {
    return;
  }

  // Fallback for proposed items or direct owner veto: update status directly in queue_items if table query is available
  if (typeof supabase.from === "function") {
    const { error: directErr } = await supabase
      .from("queue_items")
      .update({ status: "vetoed" as never, ended_at: new Date().toISOString() })
      .eq("id", queueItemId);

    if (!directErr) {
      return;
    }
  }

  if (res && !res.ok && res.error) {
    throw new Error(mapModerationError(res.error));
  }

  if (error) {
    throw new Error(error.message);
  }
}

export interface ResolveRoundResult {
  ok: boolean;
  resolved: boolean;
  promoted?: boolean;
  promotedItem?: {
    id: string;
    title: string;
    artist: string;
    voteCount: number;
  };
  roundNumber?: number;
  nextRoundNumber?: number;
  durationSeconds?: number;
  remainingSeconds?: number;
  reason?: string;
  error?: string;
}

export async function resolveVotingRound(
  slug: string,
  force: boolean = false,
): Promise<ResolveRoundResult> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase.rpc("resolve_voting_round" as never, {
    p_venue_slug: slug,
    p_force: force,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  return data as ResolveRoundResult;
}
