"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import {
  Check,
  Copy,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  Tv,
} from "lucide-react";
import { requestTvPairingCode, checkTvPairingStatus } from "@/lib/api/tv-pairing";

interface TvStandbyScreenProps {
  slug: string;
  venueName?: string;
  clock: string;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  onPaired: (token: string) => void;
}

export function TvStandbyScreen({
  slug,
  venueName = "Salón Principal",
  clock,
  isFullscreen,
  toggleFullscreen,
  onPaired,
}: TvStandbyScreenProps) {
  const [code, setCode] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const isPairedRef = useRef(false);

  // Fetch or refresh pairing PIN code
  const fetchCode = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await requestTvPairingCode(slug, "TV Salón Principal");
      setCode(res.code);

      const origin =
        typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
      const pairUrl = `${origin}/panel/${slug}?pair_code=${res.code}`;
      const qrData = await QRCode.toDataURL(pairUrl, {
        margin: 1,
        width: 380,
        color: { dark: "#070a13", light: "#ffffff" },
      });
      setQrUrl(qrData);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Error al solicitar código de vinculación",
      );
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void fetchCode();
  }, [fetchCode]);

  // Realtime broadcast listener for instant pairing
  useEffect(() => {
    if (!code || isPairedRef.current) return;
    let active = true;
    let channel: import("@supabase/supabase-js").RealtimeChannel | null = null;

    void import("@/lib/api/supabase/browser").then(({ createBrowserSupabase }) => {
      if (!active) return;
      const supabase = createBrowserSupabase();

      const existing = supabase.getChannels().find(
        (c) =>
          c.topic === `playback-control:${slug}` ||
          c.topic === `realtime:playback-control:${slug}`,
      );
      if (existing) {
        void supabase.removeChannel(existing);
      }

      channel = supabase
        .channel(`playback-control:${slug}`)
        .on(
          "broadcast",
          { event: "tv_paired" },
          (msg: { payload?: { code?: string; token?: string } }) => {
            if (!active || isPairedRef.current) return;
            const p = msg.payload;
            if (p?.token && (!p.code || p.code === code)) {
              isPairedRef.current = true;
              onPaired(p.token);
            }
          },
        )
        .subscribe();
    });

    // Fallback polling every 6s (Supabase Realtime broadcast triggers instant pairing)
    const timer = setInterval(async () => {
      if (!active || isPairedRef.current || !code) return;
      try {
        const res = await checkTvPairingStatus(slug, code);
        if (res.paired && res.token && !isPairedRef.current) {
          isPairedRef.current = true;
          onPaired(res.token);
        }
      } catch {
        // Non-blocking polling
      }
    }, 6000);

    return () => {
      active = false;
      clearInterval(timer);
      if (channel) {
        void import("@/lib/api/supabase/browser").then(({ createBrowserSupabase }) => {
          const supabase = createBrowserSupabase();
          void supabase.removeChannel(channel!);
        });
      }
    };
  }, [code, slug, onPaired]);

  const handleCopyCode = () => {
    if (!code) return;
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleManualTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualToken.trim()) return;
    if (manualToken.trim().length < 8) {
      setManualError("El token ingresado no es válido");
      return;
    }
    isPairedRef.current = true;
    onPaired(manualToken.trim());
  };

  const digits = code ? code.split("") : ["-", "-", "-", "-", "-", "-"];

  return (
    <div className="w-screen h-screen bg-[#07090e] text-[#dfe2ef] flex flex-col justify-between p-4 sm:p-8 select-none overflow-hidden relative font-sans">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/4 size-96 bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 size-96 bg-cyan-600/10 rounded-full blur-[120px] pointer-events-none" />

      {/* ==================== STANDBY HEADER ==================== */}
      <header className="w-full flex items-center justify-between z-10 py-2 border-b border-[#1E2333]">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
            <span className="material-symbols-outlined text-xl">tv</span>
          </div>
          <div className="flex flex-col">
            <h1 className="text-base font-bold text-white tracking-tight leading-none">
              Ponele<span className="text-cyan-400">Play</span> TV
            </h1>
            <span className="text-[11px] font-mono text-slate-400 mt-1 uppercase tracking-wider">
              {venueName}
            </span>
          </div>
        </div>

        {/* Pairing Status Banner */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-xs font-semibold">
            <span className="size-2 rounded-full bg-amber-400 animate-pulse" />
            <span>Pantalla en Espera · Requiere Vinculación</span>
          </div>

          <div className="flex items-center gap-1.5 bg-[#121622] px-3 py-1.5 rounded-lg border border-[#1e2333] font-mono text-xs text-white font-bold">
            <span className="material-symbols-outlined text-indigo-400 text-sm">schedule</span>
            <span suppressHydrationWarning>{clock}</span>
          </div>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="size-8 rounded-lg bg-[#121622] border border-[#1e2333] text-slate-400 hover:text-white flex items-center justify-center transition-colors"
            title="Pantalla Completa (F)"
          >
            {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
        </div>
      </header>

      {/* ==================== CENTRAL HERO CONTENT ==================== */}
      <main className="flex-1 flex items-center justify-center z-10 py-6 my-auto">
        <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-12 gap-8 items-center bg-[#0d101a]/90 backdrop-blur-xl border border-[#232b42] rounded-3xl p-6 sm:p-10 shadow-2xl">
          {/* LEFT: PIN CODE & INSTRUCTIONS (7 cols) */}
          <div className="md:col-span-7 flex flex-col justify-between space-y-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-mono text-xs font-bold mb-3">
                <Tv className="size-3.5 text-cyan-400" />
                <span>VINCULAR ESTE TELEVISOR</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Ingresá el PIN en el Panel
              </h2>
              <p className="text-sm text-slate-300 mt-2 leading-relaxed">
                Esta pantalla no reproducirá audio ni videos hasta estar sincronizada con el local. Ingresá este código de 6 dígitos desde el panel de control:
              </p>
            </div>

            {/* PIN DIGIT CARDS */}
            <div className="space-y-3">
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
                CÓDIGO PIN ÚNICO DE ESTA PANTALLA:
              </span>

              {loading ? (
                <div className="py-6 flex items-center gap-3 font-mono text-sm text-indigo-300">
                  <Loader2 className="size-6 animate-spin text-cyan-400" />
                  <span>Generando código de seguridad...</span>
                </div>
              ) : error ? (
                <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/40 text-red-200 text-xs font-mono">
                  <span>{error}</span>
                  <button
                    type="button"
                    onClick={() => void fetchCode()}
                    className="mt-2 block text-cyan-400 underline font-bold"
                  >
                    Reintentar
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 sm:gap-3">
                  {digits.map((digit, i) => (
                    <div
                      key={i}
                      className={`size-12 sm:size-14 rounded-2xl flex items-center justify-center text-2xl sm:text-3xl font-mono font-black border transition-all ${
                        i === 3
                          ? "ml-2 sm:ml-3 bg-[#181f33] border-indigo-400/50 text-cyan-400 shadow-md shadow-indigo-500/20"
                          : "bg-[#141824] border-[#2c3755] text-white"
                      }`}
                    >
                      {digit}
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="size-11 sm:size-12 rounded-xl bg-[#181f33] hover:bg-[#202842] border border-[#2c3755] text-slate-300 hover:text-white flex items-center justify-center transition-all active:scale-95 ml-2"
                    title="Copiar código PIN"
                  >
                    {copied ? <Check className="size-5 text-emerald-400" /> : <Copy className="size-5" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => void fetchCode()}
                    className="size-11 sm:size-12 rounded-xl bg-[#181f33] hover:bg-[#202842] border border-[#2c3755] text-slate-300 hover:text-white flex items-center justify-center transition-all active:scale-95"
                    title="Generar nuevo código"
                  >
                    <RefreshCw className="size-5" />
                  </button>
                </div>
              )}
            </div>

            {/* Step-by-step Quick Guide */}
            <div className="p-4 rounded-2xl bg-[#090c14] border border-[#1e2333] space-y-2 text-xs font-mono">
              <div className="flex items-start gap-2.5 text-slate-300">
                <span className="size-5 rounded-full bg-indigo-600/30 text-indigo-300 font-bold flex items-center justify-center shrink-0 text-[11px]">
                  1
                </span>
                <span>
                  Abrí el Panel del bar: <strong className="text-white">/panel/{slug}</strong>
                </span>
              </div>
              <div className="flex items-start gap-2.5 text-slate-300">
                <span className="size-5 rounded-full bg-indigo-600/30 text-indigo-300 font-bold flex items-center justify-center shrink-0 text-[11px]">
                  2
                </span>
                <span>
                  Tocá el botón <strong className="text-cyan-400">«Pantallas TV (PIN / QR)»</strong>
                </span>
              </div>
              <div className="flex items-start gap-2.5 text-slate-300">
                <span className="size-5 rounded-full bg-indigo-600/30 text-indigo-300 font-bold flex items-center justify-center shrink-0 text-[11px]">
                  3
                </span>
                <span>
                  Ingresá el PIN y la música comenzará a sonar al instante.
                </span>
              </div>
            </div>
          </div>

          {/* RIGHT: QR CODE CARD (5 cols) */}
          <div className="md:col-span-5 flex flex-col items-center justify-center p-6 bg-[#090c14] border border-[#232b42] rounded-2xl text-center space-y-4">
            <span className="text-[11px] font-mono text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">qr_code_scanner</span>
              <span>O ESCANEÁ CON TU CELULAR</span>
            </span>

            {qrUrl ? (
              <div className="p-3 bg-white rounded-2xl shadow-xl border-4 border-indigo-600/30 inline-block">
                <Image
                  src={qrUrl}
                  alt={`QR Vinculación PIN ${code}`}
                  width={220}
                  height={220}
                  className="rounded-lg object-contain"
                  unoptimized
                />
              </div>
            ) : (
              <div className="size-52 bg-slate-900 rounded-2xl flex items-center justify-center">
                <Loader2 className="size-8 animate-spin text-indigo-400" />
              </div>
            )}

            <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
              El QR abrirá el panel de administración con el PIN cargado para autorizar esta pantalla con un toque.
            </p>

            <button
              type="button"
              onClick={() => setShowManualInput((prev) => !prev)}
              className="text-xs font-mono text-indigo-400 hover:text-indigo-300 underline pt-2"
            >
              {showManualInput ? "Ocultar ingreso manual" : "¿Tenés un token guardado? Ingresar manual"}
            </button>

            {showManualInput && (
              <form onSubmit={handleManualTokenSubmit} className="w-full space-y-2 pt-2">
                <input
                  type="text"
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  placeholder="Pegar token de pantalla..."
                  className="w-full px-3 py-2 bg-[#121622] border border-[#283250] rounded-lg text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                {manualError && (
                  <span className="text-[10px] text-red-400 block">{manualError}</span>
                )}
                <button
                  type="submit"
                  className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-mono text-xs font-bold transition-all"
                >
                  Confirmar Token
                </button>
              </form>
            )}
          </div>
        </div>
      </main>

      {/* ==================== STANDBY FOOTER ==================== */}
      <footer className="w-full flex flex-wrap items-center justify-between text-xs font-mono text-slate-500 border-t border-[#1E2333] pt-3 z-10">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-cyan-400 animate-pulse" />
          <span>Sincronización en tiempo real activa (Esperando autorización)</span>
        </div>
        <div className="text-slate-400">
          Modo Kiosco TV · <span className="text-slate-300">PonelePlay</span> v2.0
        </div>
      </footer>
    </div>
  );
}

