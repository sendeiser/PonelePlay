import { createBrowserSupabase } from "./supabase/browser";
import { normalizeCode, isValidCode } from "@/lib/domain/codes";

export type RedeemError =
  | "invalid"
  | "used"
  | "expired"
  | "night_closed"
  | "rate_limited";

export type RedeemResult =
  | { ok: true; code: string; credits: number; balance: number }
  | { ok: false; error: RedeemError };

export function mapRedeemResult(
  result: RedeemResult,
): { tone: "ok" | "error"; message: string } {
  if (result.ok) {
    return {
      tone: "ok",
      message: `Se sumaron ${result.credits} votos. Tenés ${result.balance}.`,
    };
  }

  switch (result.error) {
    case "used":
      return { tone: "error", message: "Ese código ya fue usado." };
    case "expired":
      return { tone: "error", message: "El código venció al cerrar la noche." };
    case "night_closed":
      return {
        tone: "error",
        message: "La noche está cerrada. No se pueden canjear códigos.",
      };
    case "rate_limited":
      return {
        tone: "error",
        message: "Demasiados intentos fallidos. Esperá unos minutos.",
      };
    case "invalid":
    default:
      return { tone: "error", message: "Código inválido o inexistente." };
  }
}

export async function redeemCode(rawCode: string): Promise<RedeemResult> {
  const code = normalizeCode(rawCode);
  if (!isValidCode(code)) {
    return { ok: false, error: "invalid" };
  }

  const supabase = createBrowserSupabase();
  const { data, error } = await supabase.rpc("redeem_code" as never, {
    p_code: code,
  } as never);

  if (error) {
    return { ok: false, error: "invalid" };
  }

  return data as RedeemResult;
}
