import { createBrowserSupabase } from "./supabase/browser";
import { codeRowSchema, type CodeRow } from "./contracts";
import { z } from "zod";

export async function generateVoteCode(
  credits: number,
  token?: string,
): Promise<CodeRow> {
  if (token) {
    const res = await fetch("/api/staff/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-staff-token": token,
      },
      body: JSON.stringify({ action: "generate_code", credits }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error || "Error al generar código");
    }
    const data = await res.json();
    return codeRowSchema.parse(data);
  }

  const supabase = createBrowserSupabase();
  const { data, error } = await supabase.rpc("owner_generate_code" as never, {
    p_credits: credits,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  return codeRowSchema.parse(data);
}

export async function incrementCodePrints(codeId: string): Promise<void> {
  const supabase = createBrowserSupabase();
  const { error } = await supabase.rpc("increment_code_prints" as never, {
    p_code_id: codeId,
  } as never);

  if (error) {
    throw new Error(error.message);
  }
}

export async function getCodeHistory(token?: string): Promise<CodeRow[]> {
  if (token) {
    const res = await fetch("/api/staff/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-staff-token": token,
      },
      body: JSON.stringify({ action: "code_history" }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error || "Error al obtener historial de códigos");
    }
    const data = await res.json();
    return z.array(codeRowSchema).parse(data);
  }

  const supabase = createBrowserSupabase();
  const { data, error } = await supabase.rpc("get_code_history" as never);

  if (error) {
    throw new Error(error.message);
  }

  return z.array(codeRowSchema).parse(data);
}
