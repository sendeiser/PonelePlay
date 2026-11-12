"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import Image from "next/image";
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
  defaultCredits = 3,
  staffToken,
  onCodeGenerated,
}: CodeGeneratorProps) {
  const [credits, setCredits] = useState(defaultCredits);
  const [customCredits, setCustomCredits] = useState("");
  const [tableLabel, setTableLabel] = useState("Mesa General");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestCode, setLatestCode] = useState<CodeRow | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const presets = [1, 2, 3, 5, 10];

  useEffect(() => {
    if (!latestCode) return;
    const clientUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/p/${venueName}?code=${latestCode.code}`
        : `https://poneleplay.app/p/${venueName}?code=${latestCode.code}`;

    QRCode.toDataURL(clientUrl, {
      margin: 1,
      width: 200,
      errorCorrectionLevel: "M",
      color: { dark: "#1c1917", light: "#fafaf9" },
    })
      .then((url) => setQrUrl(url))
      .catch(() => setQrUrl(null));
  }, [latestCode, venueName]);

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
    <div className="space-y-6">
      {/* Top Operational Header Bar */}
      <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-th-border">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs text-th-teal mb-1 font-semibold">
            <span className="material-symbols-outlined text-sm">confirmation_number</span>
            <span>TERMINAL EXPEDIDORA DE TICKETS JUKEBOX</span>
          </div>
          <h1 className="font-display text-xl font-bold text-th-text tracking-tight">
            Emisión de Códigos & Tickets Térmicos
          </h1>
          <p className="text-xs text-th-muted mt-0.5">
            Generación ultra-rápida de recargas de créditos para mesas, barra y billar.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-th-recessed px-3 py-1.5 rounded-lg border border-th-border text-xs font-mono">
            <span className="material-symbols-outlined text-th-emerald text-base">print</span>
            <span className="text-th-secondary">Impresora Térmica 80mm</span>
            <span className="size-2 rounded-full bg-th-emerald" />
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-th-danger/35 bg-th-danger-soft p-3 text-xs font-mono text-th-danger flex items-center gap-2">
          <span className="material-symbols-outlined text-base">error</span>
          <span>{error}</span>
        </div>
      )}

      {/* 2-Column Bento Generator Zone */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT PANEL: CONTROLLER & PRESETS (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-5">
          {/* Card 1: Credit Pack Selector */}
          <div className="card-panel rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-sm font-display font-bold text-th-text flex items-center gap-2">
                <span className="material-symbols-outlined text-th-accent text-lg">toll</span>
                Seleccionar Paquete de Créditos
              </label>
              <span className="font-mono text-[10px] font-semibold text-th-teal bg-th-teal-soft px-2.5 py-0.5 rounded-full border border-th-teal/25">
                1 Crédito = 1 Voto
              </span>
            </div>

            {/* Quick Presets Button Grid */}
            <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
              {presets.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => {
                    setCredits(amount);
                    setCustomCredits("");
                  }}
                  className={`flex flex-col items-center justify-center p-2 sm:p-3 rounded-xl border transition-all active:scale-95 ${
                    credits === amount && !customCredits
                      ? "bg-th-accent text-th-on-accent border-th-accent shadow-sm font-bold"
                      : "bg-th-recessed text-th-secondary border-th-border hover:border-th-border-strong hover:text-th-text"
                  }`}
                >
                  <span className="font-mono text-[10px] opacity-75">+{amount}</span>
                  <span className="text-xl font-bold font-mono my-0.5">{amount}</span>
                  <span className="font-mono text-[9px] uppercase opacity-75">
                    {amount === 1 ? "voto" : "votos"}
                  </span>
                </button>
              ))}
            </div>

            {/* Custom Amount & Table inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div>
                <label className="ui-label mb-1">Cantidad Manual</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={customCredits}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustomCredits(val);
                    if (val && !isNaN(parseInt(val, 10))) {
                      setCredits(parseInt(val, 10));
                    }
                  }}
                  placeholder="Otro monto..."
                  className="ui-input !h-10"
                />
              </div>

              <div>
                <label className="ui-label mb-1">Mesa / Destino</label>
                <select
                  value={tableLabel}
                  onChange={(e) => setTableLabel(e.target.value)}
                  className="ui-input !h-10"
                >
                  <option value="Mesa General">Mesa General</option>
                  <option value="Barra Central">Barra Central</option>
                  <option value="Sector Billar #01">Sector Billar #01</option>
                  <option value="Sector Billar #02">Sector Billar #02</option>
                  <option value="Mesa #01">Mesa #01</option>
                  <option value="Mesa #02">Mesa #02</option>
                  <option value="Mesa #03">Mesa #03</option>
                  <option value="Mesa #04">Mesa #04</option>
                  <option value="Mesa #05">Mesa #05</option>
                  <option value="Mesa #08">Mesa #08</option>
                </select>
              </div>
            </div>

            {/* Emit CTA Button */}
            <button
              type="button"
              disabled={loading || credits <= 0}
              onClick={handleGenerate}
              className="w-full py-3.5 px-4 rounded-xl bg-th-accent hover:bg-th-accent-hover text-th-on-accent font-mono font-bold text-sm tracking-tight shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <span className="inline-block size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <span className="material-symbols-outlined text-lg">print</span>
              )}
              <span>{loading ? "Generando ticket..." : `EMITIR TICKET (${credits} CRÉDITOS)`}</span>
            </button>
          </div>
        </div>

        {/* RIGHT PANEL: THERMAL TICKET PREVIEW (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col items-center">
          {latestCode ? (
            <div className="w-full max-w-sm space-y-3">
              {/* Thermal ticket (Always white paper surface) */}
              <div className="thermal-receipt rounded-2xl p-6 bg-white text-slate-900 border border-slate-300 shadow-lg relative">
                {/* Top header */}
                <div className="text-center pb-3 border-b border-dashed border-slate-400">
                  <h3 className="font-bold text-base uppercase tracking-tight text-slate-900">
                    PonelePlay
                  </h3>
                  <p className="font-mono text-[10px] uppercase text-slate-600">
                    {venueName} · JUKEBOX TICKET
                  </p>
                  <p className="font-mono text-[9px] text-slate-500 mt-0.5">
                    {tableLabel} · {new Date().toLocaleTimeString("es-AR")}
                  </p>
                </div>

                {/* Code display */}
                <div className="py-4 text-center space-y-1">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500 block">
                    CÓDIGO DE CONSUMICIÓN
                  </span>
                  <div className="font-mono text-3xl font-extrabold tracking-[0.25em] text-slate-900 bg-slate-100 py-2 px-3 rounded-lg border border-slate-300">
                    {latestCode.code}
                  </div>
                  <span className="font-mono text-xs font-bold text-blue-700 block pt-1">
                    +{latestCode.credits} CRÉDITOS PARA VOTAR
                  </span>
                </div>

                {/* QR code */}
                {qrUrl && (
                  <div className="py-2 flex flex-col items-center">
                    <Image
                      src={qrUrl}
                      alt="QR Ticket"
                      width={140}
                      height={140}
                      className="size-32 object-contain"
                      unoptimized
                    />
                    <span className="font-mono text-[9px] text-slate-500 mt-1">
                      Escaneá para canjear directo
                    </span>
                  </div>
                )}

                {/* Perforation line */}
                <div className="relative my-3">
                  <div className="border-t border-dashed border-slate-400" />
                </div>

                {/* Barcode & Footer */}
                <div className="space-y-1.5 pt-1 text-center font-mono text-[9px] text-slate-500">
                  <div className="w-full h-8 barcode-lines rounded opacity-85" />
                  <p>Un solo uso · Válido para la noche actual</p>
                </div>
              </div>

              {/* Action buttons under ticket */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-th-card hover:bg-th-card-hover text-th-text border border-th-border font-mono text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">print</span>
                  <span>Imprimir</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-th-card hover:bg-th-card-hover text-th-text border border-th-border font-mono text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">content_copy</span>
                  <span>{copied ? "¡Copiado!" : "Copiar"}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-sm rounded-2xl border border-dashed border-th-border p-10 text-center text-th-muted font-mono text-xs space-y-2 bg-th-recessed/50">
              <span className="material-symbols-outlined text-th-muted/70 text-3xl">receipt</span>
              <p>El ticket generado aparecerá aquí listo para imprimir o copiar.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
