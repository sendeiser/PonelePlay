import { z } from "zod";
import { createBrowserSupabase } from "./supabase/browser";

export function venueQrUrl(appUrl: string, slug: string): string {
  const base = appUrl.replace(/\/+$/, "");
  return `${base}/p/${slug}`;
}

export function validateStaffPin(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}

export const staffMemberRowSchema = z.object({
  id: z.string(),
  venueId: z.string(),
  name: z.string(),
  active: z.boolean(),
  failedAttempts: z.number().default(0),
  lockedUntil: z.string().nullable().optional(),
  lastLoginAt: z.string().nullable().optional(),
  createdAt: z.string(),
});

export type StaffMemberRow = z.infer<typeof staffMemberRowSchema>;

export async function listStaff(venueId: string): Promise<StaffMemberRow[]> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase.rpc("owner_list_staff" as never, {
    p_venue_id: venueId,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  const list = (data || []) as Record<string, unknown>[];
  return list.map((item) => ({
    id: String(item.id),
    venueId: String(item.venue_id || venueId),
    name: String(item.name),
    active: Boolean(item.active),
    failedAttempts: Number(item.failed_attempts || 0),
    lockedUntil:
      item.locked_until !== null ? String(item.locked_until) : undefined,
    lastLoginAt:
      item.last_login_at !== null ? String(item.last_login_at) : undefined,
    createdAt: String(item.created_at),
  }));
}

export async function createStaff(
  venueId: string,
  name: string,
  pin: string,
): Promise<{ staffId: string }> {
  if (!validateStaffPin(pin)) {
    throw new Error("El PIN debe tener exactamente 6 dígitos numéricos.");
  }

  const supabase = createBrowserSupabase();
  const { data, error } = await supabase.rpc("owner_create_staff" as never, {
    p_venue_id: venueId,
    p_name: name.trim(),
    p_pin: pin,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  const res = data as { ok?: boolean; staffId?: string; error?: string };
  if (!res.ok || !res.staffId) {
    throw new Error(res.error || "Error al crear miembro del personal");
  }

  return { staffId: res.staffId };
}

export async function resetStaffPin(
  staffId: string,
  pin: string,
): Promise<void> {
  if (!validateStaffPin(pin)) {
    throw new Error("El PIN debe tener exactamente 6 dígitos numéricos.");
  }

  const supabase = createBrowserSupabase();
  const { data, error } = await supabase.rpc("owner_reset_staff_pin" as never, {
    p_staff_id: staffId,
    p_pin: pin,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  const res = data as { ok?: boolean; error?: string };
  if (!res.ok) {
    throw new Error(res.error || "Error al restablecer el PIN");
  }
}

export async function toggleStaffActive(
  staffId: string,
  active: boolean,
): Promise<void> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase.rpc(
    "owner_toggle_staff_active" as never,
    {
      p_staff_id: staffId,
      p_active: active,
    } as never,
  );

  if (error) {
    throw new Error(error.message);
  }

  const res = data as { ok?: boolean; error?: string };
  if (!res.ok) {
    throw new Error(res.error || "Error al actualizar estado del personal");
  }
}

export interface NightSummary {
  votesCount: number;
  creditsIssued: number;
  creditsSpent: number;
  codesGenerated: number;
  codesRedeemed: number;
  topTracks: Array<{
    title: string;
    artist: string;
    votes: number;
  }>;
}

export async function fetchNightSummary(
  venueId: string,
): Promise<NightSummary> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase.rpc("owner_night_summary" as never, {
    p_venue_id: venueId,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  const res = data as NightSummary & { error?: string };
  return {
    votesCount: res.votesCount ?? 0,
    creditsIssued: res.creditsIssued ?? 0,
    creditsSpent: res.creditsSpent ?? 0,
    codesGenerated: res.codesGenerated ?? 0,
    codesRedeemed: res.codesRedeemed ?? 0,
    topTracks: res.topTracks ?? [],
  };
}

