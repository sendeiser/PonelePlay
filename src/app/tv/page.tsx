"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Monitor, ArrowRight, Sparkles, Tv, ShieldCheck } from "lucide-react";

export default function TvEntryPage() {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [lastSlug, setLastSlug] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("poneleplay.last_tv_venue");
      if (saved) {
        setLastSlug(saved);
        setSlug(saved);
      }
    } catch {
      // Ignore
    }
  }, []);

  function handleConnect(targetSlug: string) {
    const cleanSlug = targetSlug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!cleanSlug) return;
    try {
      localStorage.setItem("poneleplay.last_tv_venue", cleanSlug);
    } catch {
      // Ignore
    }
    router.push(`/player/${cleanSlug}`);
  }

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
              Reproductor interactivo para Smart TV y pantallas del bar
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 font-mono text-xs text-slate-400 bg-[#101420] px-3.5 py-1.5 rounded-xl border border-[#1e2333]">
          <ShieldCheck className="size-4 text-emerald-400" />
          <span>Multi-Pantalla Ready</span>
        </div>
      </header>

      {/* Central Card */}
      <main className="z-10 w-full max-w-xl mx-auto my-auto py-8">
        <div className="bg-[#0f1320] border border-[#232b42] rounded-3xl p-6 sm:p-10 shadow-2xl backdrop-blur-md">
          <div className="text-center mb-8 space-y-2">
            <div className="inline-flex size-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 items-center justify-center text-indigo-400 mb-2">
              <Monitor className="size-7 text-cyan-400" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Conectar esta Pantalla
            </h2>
            <p className="text-sm font-mono text-slate-400 max-w-md mx-auto">
              Ingresá el código o identificador de tu local para sincronizar la música y la cola de espera en vivo.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleConnect(slug);
            }}
            className="space-y-5"
          >
            <div>
              <label className="block text-xs font-mono font-bold text-slate-300 uppercase tracking-wider mb-2">
                Código del Bar / Local
              </label>
              <div className="relative">
                <input
                  type="text"
                  autoFocus
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="ej: billar-aurora"
                  className="w-full bg-[#080b12] border-2 border-[#2b354f] focus:border-cyan-400 rounded-2xl px-5 py-4 text-lg sm:text-xl font-mono text-white placeholder:text-slate-600 outline-none transition-all tracking-wide"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={!slug.trim()}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-500 via-indigo-600 to-indigo-700 hover:brightness-110 active:scale-[0.99] text-white font-mono font-bold text-base sm:text-lg shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-3 transition-all disabled:opacity-40"
            >
              <span>Iniciar Pantalla TV</span>
              <ArrowRight className="size-5" />
            </button>
          </form>

          {/* Quick Shortcuts */}
          <div className="mt-8 pt-6 border-t border-[#1e2333] space-y-3">
            <span className="text-xs font-mono text-slate-400 block text-center">
              Acceso rápido con 1 click:
            </span>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => handleConnect("billar-aurora")}
                className="px-4 py-2 rounded-xl bg-[#141824] hover:bg-[#1a2133] border border-[#232b42] text-xs font-mono text-cyan-300 hover:text-white flex items-center gap-2 transition-all"
              >
                <Sparkles className="size-3.5 text-amber-400" />
                <span>billar-aurora (Demo Oficial)</span>
              </button>
              {lastSlug && lastSlug !== "billar-aurora" && (
                <button
                  type="button"
                  onClick={() => handleConnect(lastSlug)}
                  className="px-4 py-2 rounded-xl bg-[#141824] hover:bg-[#1a2133] border border-[#232b42] text-xs font-mono text-indigo-300 hover:text-white flex items-center gap-2 transition-all"
                >
                  <Monitor className="size-3.5" />
                  <span>Último usado: {lastSlug}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="z-10 flex flex-col sm:flex-row items-center justify-between text-xs font-mono text-slate-500 gap-2">
        <div className="flex items-center gap-2">
          <span>PonelePlay Smart TV System</span>
          <span>•</span>
          <span>Soporta vinculación remota mediante PIN de 6 dígitos</span>
        </div>
        <div className="text-slate-400">
          Tip: En el panel de control podés vincular tantas TVs como desees.
        </div>
      </footer>
    </div>
  );
}
