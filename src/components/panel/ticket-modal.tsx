"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import Image from "next/image";
import { generateVoteCode, incrementCodePrints } from "@/lib/api/codes";
import type { CodeRow } from "@/lib/api/contracts";

interface TicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  venueName: string;
  defaultCredits?: number;
  staffToken?: string;
  onCodeGenerated?: (code: CodeRow) => void;
}

export function TicketModal({
  isOpen,
  onClose,
  venueName,
  defaultCredits = 3,
  staffToken,
  onCodeGenerated,
}: TicketModalProps) {
  const [credits, setCredits] = useState(defaultCredits);
  const [customCredits, setCustomCredits] = useState("");
  const [tableLabel, setTableLabel] = useState("Mesa General");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestCode, setLatestCode] = useState<CodeRow | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const presets = [1, 2, 3, 5, 10];

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Generate QR Code data URL when a code is emitted
  useEffect(() => {
    if (!latestCode) {
      setQrUrl(null);
      return;
    }
    const clientUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/p/${venueName}?code=${latestCode.code}`
        : `https://poneleplay.app/p/${venueName}?code=${latestCode.code}`;

    QRCode.toDataURL(clientUrl, {
      margin: 1,
      width: 220,
      errorCorrectionLevel: "M",
      color: { dark: "#1c1917", light: "#fafaf9" },
    })
      .then((url) => setQrUrl(url))
      .catch(() => setQrUrl(null));
  }, [latestCode, venueName]);

  if (!isOpen) return null;

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

  function handleReset() {
    setLatestCode(null);
    setQrUrl(null);
    setError(null);
    setCredits(defaultCredits);
    setCustomCredits("");
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      {/* Click outside backdrop */}
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      {/* Modal Dialog Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ticket-modal-title"
        className="relative z-10 w-full max-w-xl bg-[#0f1420] border border-[#232b42] rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6 text-white my-auto max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#1E2333]">
          <div>
            <div className="flex items-center gap-2 font-mono text-xs text-indigo-400 font-semibold mb-1">
              <span className="material-symbols-outlined text-base">confirmation_number</span>
              <span>TERMINAL DE TICKETS JUKEBOX</span>
            </div>
            <h2 id="ticket-modal-title" className="text-xl font-bold text-white tracking-tight">
              {latestCode ? "Ticket Emitido Exitosamente" : "Emitir Ticket de Consumición"}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {latestCode
                ? "Entregá el ticket al cliente para canjear votos en la rockola."
                : "Generá códigos de un solo uso para habilitar votos desde mesas o barra."}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="size-8 rounded-lg border border-[#232b42] text-slate-400 hover:text-white hover:bg-[#181b25] flex items-center justify-center transition-colors shrink-0"
            aria-label="Cerrar modal"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-950/60 p-3 text-xs text-red-200 flex items-center gap-2 font-mono">
            <span className="material-symbols-outlined text-base text-red-400">error</span>
            <span>{error}</span>
          </div>
        )}

        {/* ================= STAGE 1: FORM TO EMIT TICKET ================= */}
        {!latestCode ? (
          <div className="space-y-5">
            {/* Credit Pack Selector */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <span className="material-symbols-outlined text-indigo-400 text-base">toll</span>
                  Seleccionar Paquete de Créditos
                </label>
                <span className="font-mono text-[10px] text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/25">
                  1 Crédito = 1 Voto
                </span>
              </div>

              {/* Quick Presets Button Grid */}
              <div className="grid grid-cols-5 gap-2 sm:gap-3">
                {presets.map((amount) => {
                  const isSelected = credits === amount && !customCredits;
                  return (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => {
                        setCredits(amount);
                        setCustomCredits("");
                      }}
                      className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all active:scale-95 ${
                        isSelected
                          ? "bg-indigo-600 text-white border-indigo-400 shadow-lg shadow-indigo-600/40 font-bold scale-[1.02]"
                          : "bg-[#141824] text-slate-300 border-[#232b42] hover:border-slate-500 hover:text-white"
                      }`}
                    >
                      <span className="font-mono text-[10px] opacity-75">+{amount}</span>
                      <span className="text-2xl font-bold font-mono my-0.5">{amount}</span>
                      <span className="font-mono text-[9px] uppercase opacity-75">
                        {amount === 1 ? "voto" : "votos"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Amount & Table / Destination */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="font-mono text-[10px] text-slate-400 uppercase tracking-wider block mb-1.5 font-semibold">
                  Cantidad Manual
                </label>
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
                  className="w-full h-11 px-3.5 rounded-xl bg-[#0a0e17] border border-[#232b42] text-white font-mono text-xs focus:outline-none focus:border-indigo-400 transition-colors"
                />
              </div>

              <div>
                <label className="font-mono text-[10px] text-slate-400 uppercase tracking-wider block mb-1.5 font-semibold">
                  Mesa / Destino
                </label>
                <select
                  value={tableLabel}
                  onChange={(e) => setTableLabel(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-[#0a0e17] border border-[#232b42] text-white font-mono text-xs focus:outline-none focus:border-indigo-400 transition-colors"
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
            <div className="pt-2">
              <button
                type="button"
                disabled={loading || credits <= 0}
                onClick={handleGenerate}
                className="w-full py-4 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-mono font-bold text-sm tracking-tight shadow-lg shadow-indigo-600/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 disabled:opacity-50"
              >
                {loading ? (
                  <span className="inline-block size-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span className="material-symbols-outlined text-xl">confirmation_number</span>
                )}
                <span>{loading ? "Generando ticket..." : `EMITIR TICKET (${credits} CRÉDITOS)`}</span>
              </button>
            </div>
          </div>
        ) : (
          /* ================= STAGE 2: GENERATED THERMAL RECEIPT ================= */
          <div className="space-y-6">
            {/* Centered Thermal Ticket with comfortable padding */}
            <div className="flex justify-center">
              <div className="w-full max-w-sm thermal-receipt rounded-2xl p-6 sm:p-7 text-slate-900 border border-slate-300 shadow-2xl relative bg-white">
                {/* Header */}
                <div className="text-center pb-3 border-b border-dashed border-slate-400">
                  <h3 className="font-bold text-lg uppercase tracking-tight text-slate-900">
                    PonelePlay
                  </h3>
                  <p className="font-mono text-xs uppercase text-slate-600 font-semibold">
                    {venueName} · JUKEBOX TICKET
                  </p>
                  <p className="font-mono text-[10px] text-slate-500 mt-0.5">
                    {tableLabel} · {new Date().toLocaleTimeString("es-AR")}
                  </p>
                </div>

                {/* 8-Char Code */}
                <div className="py-5 text-center space-y-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500 block font-bold">
                    CÓDIGO DE CONSUMICIÓN
                  </span>
                  <div className="font-mono text-3xl sm:text-4xl font-black tracking-[0.25em] text-slate-900 bg-slate-100 py-3 px-4 rounded-xl border border-slate-300 select-all">
                    {latestCode.code}
                  </div>
                  <span className="font-mono text-xs font-bold text-indigo-700 block pt-1">
                    +{latestCode.credits} CRÉDITOS PARA VOTAR
                  </span>
                </div>

                {/* QR Code */}
                {qrUrl && (
                  <div className="py-2 flex flex-col items-center">
                    <div className="p-2 bg-white rounded-lg border border-slate-200 shadow-sm">
                      <Image
                        src={qrUrl}
                        alt="QR Ticket"
                        width={150}
                        height={150}
                        className="size-36 object-contain"
                        unoptimized
                      />
                    </div>
                    <span className="font-mono text-[10px] text-slate-500 mt-2 font-medium">
                      Escaneá con la cámara para canjear directo
                    </span>
                  </div>
                )}

                {/* Barcode graphic & footer */}
                <div className="pt-4 border-t border-dashed border-slate-400 text-center space-y-2">
                  <div className="font-mono text-[8px] text-slate-400 tracking-[0.5em] uppercase">
                    ||| | |||| | ||| || |||| | |||
                  </div>
                  <p className="font-mono text-[9px] text-slate-500">
                    Un solo uso · Válido para la noche actual
                  </p>
                </div>
              </div>
            </div>

            {/* Ticket Actions */}
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-mono font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-600/30 active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-base">print</span>
                  <span>Imprimir</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopy}
                  className="py-3 px-4 rounded-xl bg-[#141824] hover:bg-[#1c2233] border border-[#232b42] text-slate-200 font-mono font-bold text-xs flex items-center justify-center gap-2 active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-base text-cyan-400">
                    {copied ? "check" : "content_copy"}
                  </span>
                  <span>{copied ? "¡Copiado!" : "Copiar Código"}</span>
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs font-mono text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1.5 transition-colors py-2 px-1"
                >
                  <span className="material-symbols-outlined text-base">add_circle</span>
                  <span>Emitir otro ticket</span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="text-xs font-mono text-slate-400 hover:text-white transition-colors py-2 px-3 rounded-lg border border-[#232b42] hover:bg-[#181b25]"
                >
                  Listo / Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
