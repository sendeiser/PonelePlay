"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import { Copy, Check, Download, Printer, X, Sparkles, Smartphone, Music2, Tv } from "lucide-react";

interface PrintQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  slug: string;
  venueName?: string;
}

export function PrintQrModal({
  isOpen,
  onClose,
  slug,
  venueName = "Billar Aurora",
}: PrintQrModalProps) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [generatingPng, setGeneratingPng] = useState(false);
  const printAreaRef = useRef<HTMLDivElement>(null);

  const clientUrl = typeof window !== "undefined"
    ? `${window.location.origin}/p/${slug}`
    : `https://poneleplay.netlify.app/p/${slug}`;

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    QRCode.toDataURL(clientUrl, {
      margin: 1,
      width: 480,
      color: { dark: "#000000", light: "#ffffff" },
      errorCorrectionLevel: "H",
    })
      .then((url) => {
        if (active) setQrUrl(url);
      })
      .catch(console.error);

    return () => {
      active = false;
    };
  }, [isOpen, clientUrl]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(clientUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }, [clientUrl]);

  const handleDownloadPng = useCallback(async () => {
    setGeneratingPng(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 1500;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Outer Border
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 14;
      ctx.strokeRect(30, 30, canvas.width - 60, canvas.height - 60);

      // Inner Border
      ctx.strokeStyle = "#4f46e5";
      ctx.lineWidth = 4;
      ctx.strokeRect(45, 45, canvas.width - 90, canvas.height - 90);

      // Header: PONELEPLAY
      ctx.fillStyle = "#4f46e5";
      ctx.font = "bold 32px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("PONELEPLAY · JUKEBOX EN VIVO", canvas.width / 2, 110);

      // Venue Title
      ctx.fillStyle = "#000000";
      ctx.font = "900 68px sans-serif";
      ctx.fillText(venueName.toUpperCase(), canvas.width / 2, 200);

      // Subtitle
      ctx.fillStyle = "#4338ca";
      ctx.font = "bold 36px sans-serif";
      ctx.fillText("¡Elegí la música desde tu mesa!", canvas.width / 2, 260);

      // Line Divider
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(150, 300);
      ctx.lineTo(canvas.width - 150, 300);
      ctx.stroke();

      // Draw QR Code
      const qrImg = new window.Image();
      qrImg.crossOrigin = "anonymous";
      qrImg.src = qrUrl || "";
      await new Promise((resolve) => {
        qrImg.onload = resolve;
      });
      const qrSize = 640;
      ctx.drawImage(qrImg, (canvas.width - qrSize) / 2, 340, qrSize, qrSize);

      // Line Divider below QR
      ctx.beginPath();
      ctx.moveTo(150, 1030);
      ctx.lineTo(canvas.width - 150, 1030);
      ctx.stroke();

      // 3 Steps
      ctx.font = "bold 28px sans-serif";
      ctx.fillStyle = "#1e293b";
      ctx.fillText("1. Escaneá el código QR con tu celular", canvas.width / 2, 1100);
      ctx.fillText("2. Proponé tus temas y votalos para subir en la lista", canvas.width / 2, 1160);
      ctx.fillText("3. ¡Escuchá tu canción sonar en vivo en el salón!", canvas.width / 2, 1220);

      // URL Footer
      ctx.fillStyle = "#64748b";
      ctx.font = "24px monospace";
      ctx.fillText(clientUrl, canvas.width / 2, 1340);

      ctx.fillStyle = "#0284c7";
      ctx.font = "bold 24px sans-serif";
      ctx.fillText("Pedí tu ticket al mozo para sumar votos adicionales", canvas.width / 2, 1400);

      // Download Trigger
      const pngUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = pngUrl;
      a.download = `cartel-qr-${slug}.png`;
      a.click();
    } catch (err) {
      console.error("Error generating PNG:", err);
    } finally {
      setGeneratingPng(false);
    }
  }, [clientUrl, qrUrl, slug, venueName]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl card-panel rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-th-border flex items-center justify-between bg-th-recessed">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-th-accent flex items-center justify-center text-th-on-accent shadow-sm">
              <Printer className="size-5" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-th-text tracking-tight">
                Imprimir Código QR para Mesas
              </h3>
              <p className="text-xs text-th-muted">
                Cartel listo para imprimir en PDF o descargar en alta resolución
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="size-8 rounded-lg bg-th-card border border-th-border text-th-muted hover:text-th-text flex items-center justify-center transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 min-h-0 ui-scroll-container p-6 space-y-6">
          {/* Printable Preview Sheet (White paper poster always) */}
          <div className="flex justify-center">
            <div
              ref={printAreaRef}
              className="print-qr-sheet w-full max-w-sm bg-white text-slate-900 rounded-2xl p-6 shadow-lg border-2 border-slate-900 text-center flex flex-col items-center select-none"
            >
              {/* Badge */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 font-mono text-[10px] font-bold tracking-wider mb-2 border border-blue-200">
                <Sparkles className="size-3 text-blue-600" />
                <span>PONELEPLAY · MÚSICA EN VIVO</span>
              </div>

              {/* Venue Name */}
              <h2 className="text-2xl font-black text-slate-950 tracking-tight uppercase leading-tight">
                {venueName}
              </h2>
              <p className="text-xs font-bold text-blue-600 mt-0.5 tracking-tight">
                ¡Elegí la música desde tu mesa!
              </p>

              {/* QR Image */}
              <div className="my-4 p-2 bg-white rounded-xl border-2 border-slate-200 shadow-inner">
                {qrUrl ? (
                  <Image
                    src={qrUrl}
                    alt={`QR ${venueName}`}
                    width={220}
                    height={220}
                    className="size-52 object-contain"
                    unoptimized
                  />
                ) : (
                  <div className="size-52 bg-slate-100 flex items-center justify-center font-mono text-xs text-slate-400">
                    Generando QR...
                  </div>
                )}
              </div>

              {/* 3 Steps */}
              <div className="w-full space-y-2 text-left bg-slate-50 p-3 rounded-xl border border-slate-200 font-sans text-xs">
                <div className="flex items-center gap-2 text-slate-800">
                  <Smartphone className="size-4 text-blue-600 shrink-0" />
                  <span><strong>1. Escaneá el QR</strong> con tu celular</span>
                </div>
                <div className="flex items-center gap-2 text-slate-800">
                  <Music2 className="size-4 text-blue-600 shrink-0" />
                  <span><strong>2. Proponé y votá</strong> canciones de la lista</span>
                </div>
                <div className="flex items-center gap-2 text-slate-800">
                  <Tv className="size-4 text-blue-600 shrink-0" />
                  <span><strong>3. ¡Escuchalas sonar</strong> en la TV del bar!</span>
                </div>
              </div>

              {/* URL Footer */}
              <p className="font-mono text-[10px] text-slate-600 mt-3 truncate max-w-[280px]">
                {clientUrl}
              </p>
            </div>
          </div>

          {/* Quick Notice */}
          <div className="p-3.5 rounded-xl bg-th-recessed border border-th-border flex items-center gap-3 text-xs text-th-secondary">
            <span className="material-symbols-outlined text-th-teal text-lg">info</span>
            <p>
              Al hacer clic en <strong>Imprimir / Guardar en PDF</strong>, seleccioná la opción <em>&ldquo;Guardar como PDF&rdquo;</em> en tu navegador para generar el archivo listo para imprimir en hoja A4 o soporte de mesa.
            </p>
          </div>
        </div>

        {/* Action Footer */}
        <div className="p-4 border-t border-th-border bg-th-recessed flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleCopyLink}
            className="px-3.5 py-2 rounded-xl bg-th-card hover:bg-th-card-hover text-th-secondary hover:text-th-text border border-th-border font-mono text-xs font-semibold flex items-center gap-1.5 transition-all"
          >
            {copied ? <Check className="size-4 text-th-emerald" /> : <Copy className="size-4" />}
            <span>{copied ? "¡Enlace Copiado!" : "Copiar Enlace"}</span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={generatingPng}
              onClick={handleDownloadPng}
              className="px-3.5 py-2 rounded-xl bg-th-teal-soft hover:bg-th-teal text-th-teal hover:text-white border border-th-teal/30 font-mono text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
            >
              <Download className="size-4" />
              <span>{generatingPng ? "Generando..." : "Descargar PNG"}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-th-accent hover:bg-th-accent-hover text-th-on-accent font-mono text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-all active:scale-95"
            >
              <Printer className="size-4" />
              <span>Imprimir / PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

