"use client";

import { useState } from "react";
import { Check, Copy, Maximize2, Printer, Sparkles, X } from "lucide-react";
import { TicketCode } from "@/components/ticket-code";
import { generateVoteCode, incrementCodePrints } from "@/lib/api/codes";
import type { CodeRow } from "@/lib/api/contracts";

interface CodeGeneratorProps {
  venueName: string;
  defaultCredits?: number;
  staffToken?: string;
  onCodeGenerated?: (code: CodeRow) => void;
}

export function CodeGenerator({
  venueName,
  defaultCredits = 5,
  staffToken,
  onCodeGenerated,
}: CodeGeneratorProps) {
  const [credits, setCredits] = useState(defaultCredits);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestCode, setLatestCode] = useState<CodeRow | null>(null);
  const [copied, setCopied] = useState(false);
  const [bigScreenOpen, setBigScreenOpen] = useState(false);

  const presets = [1, 2, 5, 10, 20];

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const code = await generateVoteCode(credits, staffToken);
      setLatestCode(code);
      onCodeGenerated?.(code);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al generar código");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!latestCode) return;
    void navigator.clipboard.writeText(latestCode.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handlePrint() {
    if (!latestCode) return;
    void incrementCodePrints(latestCode.id).catch(() => {});
    window.print();
  }

  return (
    <div className="rounded-2xl border border-cream/10 bg-[#07211b] p-6 space-y-6">
      <div>
        <h2 className="text-xl font-display font-bold text-cream">
          Emitir código de consumición
        </h2>
        <p className="mt-1 text-xs text-cream/50">
          Elegí la cantidad de créditos para la consumición vendida.
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-coral/30 bg-coral/10 p-3 text-xs text-coral"
        >
          {error}
        </div>
      ) : null}

      <div className="space-y-3">
        <label className="font-mono text-[10px] uppercase tracking-wider text-cream/40">
          Créditos / Votos
        </label>
        <div className="flex flex-wrap gap-2">
          {presets.map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => setCredits(amount)}
              className={`rounded-xl px-4 py-2 font-mono text-sm font-bold transition-all ${
                credits === amount
                  ? "bg-amber text-[#041611] scale-105 shadow-md"
                  : "border border-cream/15 bg-white/[0.03] text-cream/70 hover:bg-white/[0.06]"
              }`}
            >
              {amount} {amount === 1 ? "voto" : "votos"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <input
            type="number"
            min={1}
            max={50}
            value={credits}
            onChange={(e) => setCredits(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
            className="w-24 rounded-xl border border-cream/15 bg-white/[0.03] px-3 py-2 font-mono text-sm text-cream outline-none focus:border-amber/60"
          />
          <span className="text-xs text-cream/40">Manual (1 a 50)</span>
        </div>
      </div>

      <button
        type="button"
        disabled={loading}
        onClick={() => void handleGenerate()}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber px-5 py-3 font-display text-sm font-bold text-[#041611] hover:bg-amber/90 transition-transform active:scale-[0.99] disabled:opacity-50"
      >
        <Sparkles className="size-4" />
        {loading ? "Generando..." : "Generar ticket de consumición"}
      </button>

      {latestCode ? (
        <div className="pt-4 border-t border-cream/10 space-y-4">
          <p className="font-mono text-[10px] uppercase tracking-wider text-amber font-bold">
            Código emitido
          </p>

          <TicketCode
            code={latestCode.code}
            credits={latestCode.credits}
            venueName={venueName}
            notchColor="#07211b"
            printable
          />

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-cream/15 bg-white/[0.03] py-2 text-xs font-semibold text-cream hover:bg-white/[0.08] transition-colors"
            >
              {copied ? <Check className="size-3.5 text-mint" /> : <Copy className="size-3.5" />}
              {copied ? "Copiado" : "Copiar"}
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-cream/15 bg-white/[0.03] py-2 text-xs font-semibold text-cream hover:bg-white/[0.08] transition-colors"
            >
              <Printer className="size-3.5" />
              Imprimir
            </button>

            <button
              type="button"
              onClick={() => setBigScreenOpen(true)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-cream/15 bg-white/[0.03] py-2 text-xs font-semibold text-cream hover:bg-white/[0.08] transition-colors"
            >
              <Maximize2 className="size-3.5" />
              Dictar
            </button>
          </div>
        </div>
      ) : null}

      {/* Big Screen Dictation Modal */}
      {bigScreenOpen && latestCode ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6 backdrop-blur-md"
        >
          <div className="relative w-full max-w-lg rounded-3xl border border-amber/30 bg-[#07211b] p-8 text-center shadow-2xl">
            <button
              type="button"
              onClick={() => setBigScreenOpen(false)}
              className="absolute right-4 top-4 grid size-10 place-items-center rounded-full border border-cream/15 bg-cream/5 text-cream/60 hover:text-cream"
              aria-label="Cerrar"
            >
              <X className="size-5" />
            </button>

            <p className="font-mono text-xs uppercase tracking-[0.3em] text-amber">
              Código de votos · {venueName}
            </p>

            <h1 className="mt-6 font-mono text-5xl sm:text-6xl font-black tracking-[0.25em] text-cream select-all">
              {latestCode.code}
            </h1>

            <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-amber/15 border border-amber/30 px-4 py-1.5 font-mono text-sm text-amber font-bold">
              <span>{latestCode.credits} votos</span>
            </div>

            <p className="mt-6 text-xs text-cream/40">
              Dictale este código de 8 caracteres al cliente para que canjee en su teléfono.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
