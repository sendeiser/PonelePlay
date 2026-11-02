"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import { Check, Copy, KeyRound, Loader2, Monitor, RefreshCw, X } from "lucide-react";
import { requestTvPairingCode, checkTvPairingStatus } from "@/lib/api/tv-pairing";

interface TvPairingModalProps {
  isOpen: boolean;
  slug: string;
  onClose: () => void;
  onPaired: (token: string) => void;
}

export function TvPairingModal({
  isOpen,
  slug,
  onClose,
  onPaired,
}: TvPairingModalProps) {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [activeTab, setActiveTab] = useState<"code" | "token">("code");
  const [copiedLink, setCopiedLink] = useState(false);

  // Generate pairing code
  const fetchCode = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await requestTvPairingCode(slug, "TV Salón Principal");
      setCode(res.code);

      // QR link points directly to admin panel with the code prepopulated
      const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
      const pairUrl = `${origin}/panel/${slug}?pair_code=${res.code}`;
      const qrData = await QRCode.toDataURL(pairUrl, {
        margin: 1,
        width: 320,
        color: { dark: "#0a0e17", light: "#ffffff" },
      });
      setQrUrl(qrData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al generar código de vinculación");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (isOpen) {
      void fetchCode();
    } else {
      setCode(null);
      setQrUrl(null);
      setIsSuccess(false);
    }
  }, [isOpen, fetchCode]);

  // Polling & Realtime check for code confirmation
  useEffect(() => {
    if (!isOpen || !code || isSuccess) return;

    let active = true;

    // 1. Polling check every 2 seconds
    const interval = setInterval(async () => {
      try {
        const res = await checkTvPairingStatus(slug, code);
        if (active && res.ok && res.paired && res.token) {
          setIsSuccess(true);
          onPaired(res.token);
          setTimeout(() => {
            onClose();
          }, 2500);
        }
      } catch {
        // Continue polling
      }
    }, 2000);

    // 2. Realtime broadcast check
    let channel: import("@supabase/supabase-js").RealtimeChannel | null = null;
    void import("@/lib/api/supabase/browser").then(({ createBrowserSupabase }) => {
      if (!active) return;
      const supabase = createBrowserSupabase();
      const existingModal = supabase.getChannels().find(
        (c) => c.topic === `playback-control:${slug}` || c.topic === `realtime:playback-control:${slug}`
      );
      if (existingModal) {
        void supabase.removeChannel(existingModal);
      }

      channel = supabase
        .channel(`playback-control:${slug}`)
        .on(
          "broadcast",
          { event: "tv_paired" },
          (msg: { payload?: { code?: string; token?: string } }) => {
            if (!active) return;
            if (msg.payload?.code === code && msg.payload?.token) {
              setIsSuccess(true);
              onPaired(msg.payload.token);
              setTimeout(() => {
                onClose();
              }, 2500);
            }
          },
        )
        .subscribe();
    });

    return () => {
      active = false;
      clearInterval(interval);
      if (channel) {
        void import("@/lib/api/supabase/browser").then(({ createBrowserSupabase }) => {
          const supabase = createBrowserSupabase();
          void supabase.removeChannel(channel!);
        });
      }
    };
  }, [isOpen, code, isSuccess, slug, onPaired, onClose]);

  if (!isOpen) return null;

  function handleManualTokenSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manualToken.trim()) return;
    setIsSuccess(true);
    onPaired(manualToken.trim());
    setTimeout(() => {
      onClose();
    }, 1200);
  }

  function handleCopyDirectUrl() {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div className="relative w-full max-w-xl bg-[#0e121e] border border-[#232b42] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#1E2333] bg-[#0A0E17]/90">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25">
              <Monitor className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Vincular Pantalla TV
              </h2>
              <p className="font-mono text-xs text-slate-400">
                Sincronizá esta pantalla con el panel de control del bar
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1.5 bg-[#121624] border-b border-[#1E2333]">
          <button
            type="button"
            onClick={() => setActiveTab("code")}
            className={`flex-1 py-2 px-3 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === "code"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/25"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <span className="material-symbols-outlined text-base">pin</span>
            <span>Código de 6 Dígitos (Recomendado)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("token")}
            className={`flex-1 py-2 px-3 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === "token"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/25"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <KeyRound className="size-4" />
            <span>Token Manual</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6">
          {isSuccess ? (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-3 animate-fade-in">
              <div className="size-16 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-emerald-400 shadow-xl shadow-emerald-500/20">
                <Check className="size-8" />
              </div>
              <h3 className="text-lg font-bold text-white">¡TV Vinculada con Éxito!</h3>
              <p className="text-xs text-slate-300 font-mono max-w-sm">
                Esta pantalla ahora está conectada al canal host en vivo del bar.
              </p>
            </div>
          ) : activeTab === "code" ? (
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-xs font-mono text-indigo-300">
                <span>Local / Bar:</span>
                <span className="font-bold text-cyan-300 uppercase tracking-wide">{slug}</span>
              </div>

              <p className="text-xs text-slate-300 font-mono max-w-sm">
                En el panel de control del bar, abrí «Pantallas TV» e ingresá este código PIN para autorizar esta pantalla:
              </p>

              {loading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="size-8 animate-spin text-indigo-400" />
                  <span className="text-xs font-mono text-slate-400">Generando código seguro...</span>
                </div>
              ) : code ? (
                <div className="w-full flex flex-col items-center gap-6">
                  {/* Big Digits Box */}
                  <div className="flex items-center justify-center gap-2.5">
                    {code.split("").map((digit, i) => (
                      <div
                        key={i}
                        className="size-14 sm:size-16 rounded-2xl bg-[#0a0e17] border-2 border-indigo-500/50 flex items-center justify-center text-2xl sm:text-3xl font-mono font-extrabold text-cyan-300 shadow-xl shadow-indigo-500/10"
                      >
                        {digit}
                      </div>
                    ))}
                  </div>

                  {/* QR Scan Area */}
                  {qrUrl && (
                    <div className="flex items-center gap-4 p-3 rounded-2xl bg-[#141824] border border-[#232b42]">
                      <div className="size-24 rounded-xl bg-white p-1.5 shrink-0 shadow-md">
                        <Image
                          src={qrUrl}
                          alt="QR para vincular TV"
                          width={96}
                          height={96}
                          className="w-full h-full object-contain"
                          unoptimized
                        />
                      </div>
                      <div className="text-left font-mono text-xs space-y-1">
                        <span className="text-cyan-400 font-bold block">Escanear para vincular</span>
                        <p className="text-[11px] text-slate-400 leading-snug">
                          Abrí la cámara de tu celular para vincular esta TV sin tener que tipear el código.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                    <span className="size-2 rounded-full bg-cyan-400 animate-ping inline-block" />
                    <span>Esperando confirmación del administrador...</span>
                    <button
                      type="button"
                      onClick={() => void fetchCode()}
                      className="ml-2 text-indigo-400 hover:text-indigo-300 underline flex items-center gap-1"
                    >
                      <RefreshCw className="size-3" />
                      <span>Renovar</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-rose-400 font-mono text-xs">{error}</div>
              )}
            </div>
          ) : (
            <form onSubmit={handleManualTokenSubmit} className="space-y-4">
              <p className="text-xs text-slate-300 font-mono">
                Si generaste un token de acceso permanente desde el panel del bar, pegalo a continuación:
              </p>
              <input
                type="text"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="Pegá el token de dispositivo..."
                className="w-full rounded-xl border border-[#232b42] bg-[#0a0e17] px-4 py-3 font-mono text-xs text-white placeholder:text-slate-600 focus:border-indigo-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!manualToken.trim()}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-mono text-xs font-bold text-white transition-all disabled:opacity-50 shadow-md shadow-indigo-600/25"
              >
                Guardar y Activar
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#1E2333] bg-[#0A0E17]/90 flex items-center justify-between">
          <button
            type="button"
            onClick={handleCopyDirectUrl}
            className="flex items-center gap-1.5 text-xs font-mono text-slate-400 hover:text-white transition-colors"
          >
            {copiedLink ? (
              <>
                <Check className="size-3.5 text-emerald-400" />
                <span className="text-emerald-300">Enlace copiado</span>
              </>
            ) : (
              <>
                <Copy className="size-3.5" />
                <span>Copiar URL de esta TV</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#181b25] hover:bg-[#202534] text-slate-300 hover:text-white font-mono text-xs font-bold border border-[#232b42]"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

