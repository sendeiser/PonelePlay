"use client";

import { useEffect, useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { BadgeCheck, Info, Ticket, X } from "lucide-react";
import { TicketCode } from "@/components/ticket-code";
import { mapRedeemResult, redeemCode } from "@/lib/api/redeem";

interface RedeemSheetProps {
  venueName: string;
  onClose: () => void;
  onSuccess: (credits: number, balance: number, code: string) => void;
}

export function RedeemSheet({
  venueName,
  onClose,
  onSuccess,
}: RedeemSheetProps) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<{
    code: string;
    credits: number;
    balance: number;
  } | null>(null);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = original;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setError(null);
    setLoading(true);

    try {
      const res = await redeemCode(input);
      const mapped = mapRedeemResult(res);

      if (res.ok) {
        setSuccess({
          code: res.code,
          credits: res.credits,
          balance: res.balance,
        });
        setInput("");
        onSuccess(res.credits, res.balance, res.code);
      } else {
        setError(mapped.message);
      }
    } catch {
      setError("Error de conexión al canjear. Probá de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="redeem-title"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-felt-950/80 backdrop-blur-sm"
      />

      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 360, damping: 32 }}
        className="relative w-full max-w-lg rounded-t-[2rem] border border-cream/10 bg-felt-800 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-[2rem]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-amber">
              Canjeá tus votos
            </p>
            <h2
              id="redeem-title"
              className="mt-1 font-display text-2xl font-extrabold tracking-tight text-cream"
            >
              {success ? "Listo, tenés más votos" : "Ingresá tu código"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-full border border-cream/10 bg-cream/5 text-cream/60 hover:text-cream"
            aria-label="Cerrar"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        {success ? (
          <div className="mt-5 space-y-4">
            <div className="flex items-center gap-2 rounded-xl border border-mint/25 bg-mint/10 px-3 py-2 text-sm text-mint">
              <BadgeCheck className="size-4" aria-hidden="true" />
              Código aceptado. Se sumaron {success.credits} votos.
            </div>

            <TicketCode
              code={success.code}
              credits={success.credits}
              venueName={venueName}
              notchColor="#0b2c24"
            />

            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-full bg-amber px-5 py-3 font-display text-sm font-bold text-ink transition-transform active:scale-[0.99]"
            >
              Empezar a votar
            </button>

            <button
              type="button"
              onClick={() => {
                setSuccess(null);
                setError(null);
              }}
              className="w-full rounded-full py-2 text-xs font-semibold text-cream/50 hover:text-cream"
            >
              Canjear otro código
            </button>
          </div>
        ) : (
          <>
            <p className="mt-3 text-sm leading-relaxed text-cream/50">
              Con cada consumición te damos un código de un uso. Los votos vencen cuando cierra la noche.
            </p>

            <form onSubmit={handleSubmit} className="mt-5">
              <label
                htmlFor="vote-code"
                className="font-mono text-[10px] uppercase tracking-[0.2em] text-cream/40"
              >
                Código de 8 caracteres
              </label>
              <input
                id="vote-code"
                value={input}
                onChange={(event) => {
                  setInput(
                    event.target.value
                      .toUpperCase()
                      .replace(/[^A-Z2-9]/g, "")
                      .slice(0, 8),
                  );
                  setError(null);
                }}
                placeholder="ABCDEFGH"
                className="mt-2 w-full rounded-xl border border-cream/15 bg-felt-950/60 px-4 py-3 font-mono text-xl font-bold tracking-[0.3em] text-cream outline-none placeholder:text-cream/15 focus:border-amber/60"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                autoFocus
              />

              {error ? (
                <p
                  role="alert"
                  className="mt-2 flex items-center gap-1.5 text-xs text-coral"
                >
                  <Info className="size-3.5" aria-hidden="true" />
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={loading || input.length !== 8}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-amber px-5 py-3 font-display text-sm font-bold text-ink transition-transform active:scale-[0.99] disabled:opacity-50"
              >
                <Ticket className="size-4" aria-hidden="true" />
                {loading ? "Validando..." : "Canjear código"}
              </button>
            </form>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
