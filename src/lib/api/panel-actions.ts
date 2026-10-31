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

export async function skipCurrent(
  queueItemId: string,
  token?: string,
): Promise<void> {
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
  const { error } = await supabase
    .from("queue_items")
    .update({ status: "skipped" as const, ended_at: new Date().toISOString() })
    .eq("id", queueItemId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function vetoItem(
  queueItemId: string,
  token?: string,
): Promise<void> {
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
  const { error } = await supabase
    .from("queue_items")
    .update({ status: "vetoed" as const, ended_at: new Date().toISOString() })
    .eq("id", queueItemId);

  if (error) {
    throw new Error(error.message);
  }
}
