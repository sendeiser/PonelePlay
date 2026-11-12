"use client";

import { useEffect, useRef, useState } from "react";
import { mapRedeemResult, redeemCode } from "@/lib/api/redeem";

interface RedeemTabProps {
  venueName: string;
  credits: number;
  onSuccess: (credits: number, balance: number, code: string) => void;
  onNotify: (message: string, tone?: "ok" | "error" | "info") => void;
}

interface RedemptionRecord {
  code: string;
  credits: number;
  time: string;
}

export function RedeemTab({
  venueName,
  credits,
  onSuccess,
  onNotify,
}: RedeemTabProps) {
  const [chars, setChars] = useState<string[]>(["", "", "", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RedemptionRecord[]>([]);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Load history from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`poneleplay_history_${venueName}`);
      if (stored) {
        setHistory(JSON.parse(stored));
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [venueName]);

  const fullCode = chars.join("").trim().toUpperCase();

  const handleInputChange = (index: number, val: string) => {
    // Sanitize
    const cleaned = val.toUpperCase().replace(/[^A-Z2-9]/g, "");

    // If pasted multi-character string
    if (cleaned.length > 1) {
      const newChars = [...chars];
      for (let i = 0; i < 8 && i < cleaned.length; i++) {
        newChars[i] = cleaned[i];
      }
      setChars(newChars);
      setError(null);
      const nextIdx = Math.min(7, cleaned.length);
      inputRefs.current[nextIdx]?.focus();
      return;
    }

    const single = cleaned.slice(-1);
    const newChars = [...chars];
    newChars[index] = single;
    setChars(newChars);
    setError(null);

    // Auto-advance
    if (single && index < 7) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (!chars[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 7) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const paste = e.clipboardData.getData("text").trim().toUpperCase().replace(/[^A-Z2-9]/g, "");
    if (!paste) return;

    const newChars = [...chars];
    for (let i = 0; i < 8 && i < paste.length; i++) {
      newChars[i] = paste[i];
    }
    setChars(newChars);
    setError(null);
    const nextIdx = Math.min(7, paste.length);
    inputRefs.current[nextIdx]?.focus();
  };

  const handleRedeem = async () => {
    if (fullCode.length !== 8) {
      setError("Completá los 8 caracteres del código de tu ticket.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await redeemCode(fullCode);
      const mapped = mapRedeemResult(res);

      if (res.ok) {
        onNotify(`¡Código canjeado con éxito! +${res.credits} créditos acreditados.`, "ok");
        onSuccess(res.credits, res.balance, res.code);

        const newRecord: RedemptionRecord = {
          code: res.code,
          credits: res.credits,
          time: new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
        };

        const updatedHistory = [newRecord, ...history.slice(0, 9)];
        setHistory(updatedHistory);
        try {
          localStorage.setItem(`poneleplay_history_${venueName}`, JSON.stringify(updatedHistory));
        } catch {}

        setChars(["", "", "", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
      } else {
        setError(mapped.message);
        onNotify(mapped.message, "error");
      }
    } catch {
      setError("Error de red al canjear. Verificá tu conexión.");
      onNotify("Error de conexión al canjear el código.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5 pb-6">
      {/* Title & Instruction */}
      <div className="flex flex-col gap-1.5 pt-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-th-teal font-semibold">
          Canjeá tus votos
        </p>
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-th-accent-soft border border-th-accent/30 text-th-accent shadow-xs">
            <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>
              loyalty
            </span>
          </span>
          <h1 className="font-display text-xl font-bold text-th-text tracking-tight">
            Cargar Fichas / Créditos
          </h1>
        </div>
        <p className="text-xs text-th-muted leading-relaxed">
          Ingresá el código de 8 caracteres emitido con tu consumición para seleccionar y votar temas musicales en el salón.
        </p>
      </div>

      {/* Hero Digital Receipt Voucher Card */}
      <section className="card-panel relative rounded-2xl overflow-hidden">
        {/* Ticket Top Ribbon Details */}
        <div className="px-5 pt-4 pb-3.5 border-b border-th-border flex justify-between items-center bg-th-shell/60">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-th-teal text-sm">receipt_long</span>
            <span className="font-mono text-[11px] uppercase tracking-wider text-th-muted">
              Comprobante de Caja
            </span>
          </div>
          <div className="flex items-center gap-1.5 bg-th-recessed px-2.5 py-0.5 rounded-full border border-th-border">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-th-teal animate-pulse" />
            <span className="font-mono text-[11px] text-th-teal font-semibold">Canje Instantáneo</span>
          </div>
        </div>

        {/* Voucher Body */}
        <div className="p-5 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="ui-label flex items-center justify-between">
              <span>Código alfanumérico del ticket</span>
              <span className="text-th-teal font-semibold">8 Caracteres</span>
            </label>

            {/* Monospace Segmented 8-character Box Input */}
            <div className="grid grid-cols-8 gap-1.5 sm:gap-2 pt-1" id="voucher-input-container">
              {chars.map((char, index) => (
                <input
                  key={index}
                  ref={(el) => { inputRefs.current[index] = el; }}
                  type="text"
                  maxLength={1}
                  value={char}
                  onChange={(e) => handleInputChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={handlePaste}
                  disabled={loading}
                  aria-label={`Carácter ${index + 1}`}
                  className="ui-input min-w-0 h-11 sm:h-12 px-0 text-center font-mono text-base sm:text-lg font-bold uppercase"
                />
              ))}
            </div>

            {/* Unambiguous Alphabet Explanatory Subtext */}
            <div className="flex items-start gap-1.5 mt-1.5">
              <span className="material-symbols-outlined text-th-muted text-[15px] shrink-0 mt-0.5">
                info
              </span>
              <p className="font-mono text-[11px] text-th-muted leading-tight">
                Caracteres unívocos (alfabeto sin 0, O, 1, I para evitar confusiones)
              </p>
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-th-danger-soft border border-th-danger/35 p-3 text-xs text-th-danger flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-th-danger">error</span>
              <span>{error}</span>
            </div>
          )}

          {/* Primary Action CTA Button */}
          <button
            type="button"
            onClick={handleRedeem}
            disabled={loading || fullCode.length !== 8}
            className="w-full py-3.5 px-4 rounded-xl bg-th-accent hover:bg-th-accent-hover text-th-on-accent font-bold text-sm tracking-tight shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            {loading ? (
              <span className="inline-block size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <span className="material-symbols-outlined text-lg transition-transform group-hover:rotate-12" style={{ fontVariationSettings: "'FILL' 1" }}>
                bolt
              </span>
            )}
            <span>{loading ? "Validando..." : "Validar y Acreditar Créditos"}</span>
          </button>

          {/* Help box / Venue instruction */}
          <div className="bg-th-recessed border border-th-border rounded-xl p-3 flex items-start gap-2.5">
            <span className="material-symbols-outlined text-th-teal text-lg shrink-0 mt-0.5">
              local_bar
            </span>
            <p className="text-xs text-th-secondary leading-snug">
              <strong className="text-th-text font-semibold">¿Cómo obtener códigos?</strong> Pedí tu ticket al mozo en la mesa o con tu consumición en la barra.
            </p>
          </div>
        </div>

        {/* Perforation Divider Line */}
        <div className="relative w-full h-4 flex items-center justify-center my-0">
          <div className="absolute left-0 -ml-2.5 size-5 bg-th-canvas rounded-full border-r border-th-border" />
          <div className="w-full border-b border-dashed border-th-border-strong mx-4" />
          <div className="absolute right-0 -mr-2.5 size-5 bg-th-canvas rounded-full border-l border-th-border" />
        </div>

        {/* Card Bottom: Barcode Graphics & Meta */}
        <div className="p-5 pt-3 bg-th-recessed flex flex-col items-center gap-2">
          <div className="w-full h-10 barcode-lines rounded opacity-60" />
          <div className="flex justify-between items-center w-full font-mono text-[10px] text-th-muted">
            <span>AUT-SEC // 992-PX</span>
            <span className="tracking-widest text-th-secondary font-bold">
              {fullCode ? `#PP-${fullCode}` : `#${venueName.toUpperCase()}`}
            </span>
          </div>
        </div>
      </section>

      {/* Historial de canjes */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-bold text-th-text tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-th-accent text-base">history</span>
            Historial de Canjes de esta noche
          </h2>
          <span className="font-mono text-[11px] font-semibold text-th-accent bg-th-recessed px-2.5 py-0.5 rounded-full border border-th-border tabular-nums">
            {credits} créditos actuales
          </span>
        </div>

        {history.length === 0 ? (
          <div className="rounded-xl border border-dashed border-th-border bg-th-card/50 p-6 text-center text-xs text-th-muted">
            Todavía no canjeaste ningún código en esta sesión.
          </div>
        ) : (
          <div className="space-y-2 max-h-[300px] pr-1 ui-scroll-container">
            {history.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 rounded-xl bg-th-card border border-th-border shadow-xs"
              >
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-th-emerald text-lg">check_circle</span>
                  <div>
                    <p className="font-mono text-xs font-bold text-th-text tracking-wider">
                      {item.code}
                    </p>
                    <p className="font-mono text-[10px] text-th-muted">
                      Canjeado hoy {item.time}
                    </p>
                  </div>
                </div>
                <span className="font-mono text-xs font-bold text-th-emerald bg-th-emerald-soft border border-th-emerald/25 px-2 py-0.5 rounded-md tabular-nums">
                  +{item.credits} votos
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
