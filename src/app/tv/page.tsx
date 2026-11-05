"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Monitor, ArrowRight, Tv, ShieldCheck, RefreshCw, Loader2 } from "lucide-react";
import { requestTvPairingCode, checkTvPairingStatus } from "@/lib/api/tv-pairing";

export default function TvEntryPage() {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [pinCode, setPinCode] = useState<string | null>(null);
  const [loadingPin, setLoadingPin] = useState(true);
  const [pinError, setPinError] = useState<string | null>(null);

  const generateZeroPin = useCallback(async () => {
    setLoadingPin(true);
    setPinError(null);
    try {
      const res = await requestTvPairingCode("", "Smart TV Web");
      setPinCode(res.code);
    } catch (err) {
      setPinError(err instanceof Error ? err.message : "Error al generar código PIN");
    } finally {
      setLoadingPin(false);
    }
  }, []);

  useEffect(() => {
    void generateZeroPin();
  }, [generateZeroPin]);

  // Poll for PIN confirmation from any Cabina
  useEffect(() => {
    if (!pinCode) return;
    let active = true;

    const timer = setInterval(async () => {
      if (!active) return;
      try {
        const res = await checkTvPairingStatus("", pinCode);
        if (active && res.paired && res.slug) {
          const tokenParam = res.token ? `?token=${encodeURIComponent(res.token)}` : "";
          router.push(`/player/${res.slug}${tokenParam}`);
        }
      } catch {
        // Ignore transient polling errors
      }
    }, 2500);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [pinCode, router]);

  function handleConnect(targetSlug: string) {
    const cleanSlug = targetSlug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!cleanSlug) return;
    router.push(`/player/${cleanSlug}`);
  }

  const digits = pinCode ? pinCode.split("") : ["-", "-", "-", "-", "-", "-"];

  return (
    <div className="min-h-screen w-full bg-[#07090e] text-[#dfe2ef] flex flex-col justify-between p-6 sm:p-12 relative overflow-hidden select-none">
      {/* Background neon ambient glows */}
      <div className="absolute -top-40 -left-40 size-96 rounded-full bg-indigo-600/15 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 size-96 rounded-full bg-cyan-600/15 blur-3xl pointer-events-none" />

      {/* Top Header */}
      <header className="flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="size-10 sm:size-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white shadow-xl shadow-indigo-500/25">
            <Tv className="size-6 sm:size-7" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              Ponele<span className="text-cyan-400">Play</span>
              <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                TV PLAYER
              </span>
            </h1>
            <p className="text-xs sm:text-sm font-mono text-slate-400">
              Pantalla en cero lista para vincularse con tu cuenta / cabina
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 font-mono text-xs text-slate-400 bg-[#101420] px-3.5 py-1.5 rounded-xl border border-[#1e2333]">
          <ShieldCheck className="size-4 text-emerald-400" />
          <span>Vinculación Automática por PIN</span>
        </div>
      </header>

      {/* Central Card */}
      <main className="z-10 w-full max-w-xl mx-auto my-auto py-8">
        <div className="bg-[#0f1320] border border-[#232b42] rounded-3xl p-6 sm:p-10 shadow-2xl backdrop-blur-md space-y-7">
          <div className="text-center space-y-2">
            <div className="inline-flex size-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 items-center justify-center text-indigo-400 mb-1">
              <Monitor className="size-7 text-cyan-400" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Vincular con tu Cabina
            </h2>
            <p className="text-xs sm:text-sm font-mono text-slate-400 max-w-md mx-auto">
              En tu Panel de Control abrí <strong>«Pantallas TV (PIN)»</strong> e ingresá este código de 6 dígitos para configurar esta pantalla automáticamente.
            </p>
          </div>

          {/* 6-Digit PIN Display */}
          <div className="bg-[#080b12] border border-[#232b42] rounded-2xl p-5 flex flex-col items-center gap-4">
            <span className="text-[11px] font-mono font-bold text-cyan-400 uppercase tracking-widest">
              Código PIN de esta TV
            </span>

            {loadingPin ? (
              <div className="flex items-center gap-2 py-4 text-slate-400 font-mono text-xs">
                <Loader2 className="size-5 animate-spin text-cyan-400" />
                <span>Generando código PIN...</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 sm:gap-3">
                {digits.map((d, idx) => (
                  <div
                    key={idx}
                    className="w-11 h-14 sm:w-13 sm:h-16 rounded-xl bg-[#131b2e] border-2 border-cyan-500/60 flex items-center justify-center text-2xl sm:text-3xl font-mono font-black text-white shadow-lg"
                  >
                    {d}
                  </div>
                ))}
              </div>
            )}

            {pinError && (
              <p className="text-xs font-mono text-rose-400">{pinError}</p>
            )}

            <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-cyan-400 animate-pulse" />
                Esperando vinculación desde la cabina...
              </span>
              <button
                type="button"
                onClick={() => void generateZeroPin()}
                className="text-indigo-400 hover:text-white inline-flex items-center gap-1 underline underline-offset-4"
              >
                <RefreshCw className="size-3" />
                <span>Nuevo PIN</span>
              </button>
            </div>
          </div>

          {/* Optional manual slug entry (starts completely empty) */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleConnect(slug);
            }}
            className="pt-4 border-t border-[#1e2333] space-y-3"
          >
            <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
              O ingresá el identificador de tu cuenta / cabina manualmente
            </label>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="Identificador de tu cabina"
                className="flex-1 bg-[#080b12] border border-[#2b354f] focus:border-cyan-400 rounded-xl px-4 py-3 text-sm font-mono text-white placeholder:text-slate-600 outline-none transition-all"
              />
              <button
                type="submit"
                disabled={!slug.trim()}
                className="px-5 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:brightness-110 text-white font-mono font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-40 shrink-0"
              >
                <span>Conectar</span>
                <ArrowRight className="size-4" />
              </button>
            </div>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="z-10 flex flex-col sm:flex-row items-center justify-between text-xs font-mono text-slate-500 gap-2">
        <div className="flex items-center gap-2">
          <span>PonelePlay Smart TV System</span>
          <span>•</span>
          <span>Sin configuración previa · Se configura automáticamente con la cabina vinculada</span>
        </div>
      </footer>
    </div>
  );
}
