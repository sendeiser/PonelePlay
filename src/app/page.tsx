import Link from "next/link";
import { BrandMark, Wordmark } from "@/components/brand";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#090D16] text-[#dfe2ef] flex flex-col justify-between relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 size-[36rem] bg-indigo-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute -bottom-32 right-10 size-[30rem] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="w-full px-6 py-4 flex items-center justify-between border-b border-[#1E2333] bg-[#0A0E17]/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <BrandMark className="size-9" />
          <Wordmark className="text-xl" />
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="px-4 py-2 rounded-xl bg-[#181b25] hover:bg-[#202534] border border-[#232b42] text-xs font-mono font-bold text-white transition-colors"
          >
            Acceso Staff / Dueño
          </Link>
          <Link
            href="/signup"
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-xs font-mono font-bold text-white shadow-md shadow-indigo-600/30 transition-all"
          >
            Registrar Bar
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center text-center px-6 py-16 z-10 max-w-5xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-[#c0c1ff] font-mono text-xs mb-6 shadow-[0_0_15px_rgba(99,102,241,0.25)]">
          <span className="size-2 rounded-full bg-cyan-400 animate-pulse" />
          <span>JUKEBOX COLABORATIVO · DISEÑO FIELTRO Y NEÓN</span>
        </div>

        <h1 className="text-5xl md:text-7xl font-extrabold text-white tracking-tight leading-[1.05]">
          La música del bar la elige <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">la gente</span>
        </h1>

        <p className="text-base md:text-lg text-slate-400 max-w-2xl mt-4 leading-relaxed">
          Escaneá el código QR desde tu mesa, canjeá los créditos de tu consumición y votá la próxima canción en pantalla gigante.
        </p>

        {/* 3 Entry Point Bento Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full mt-12 text-left">
          {/* Card 1: Cliente Móvil */}
          <Link
            href="/p/billar-aurora"
            className="group block bg-[#181b25] border border-[#232b42] hover:border-indigo-500/50 rounded-2xl p-6 transition-all shadow-xl hover:shadow-[0_0_24px_-4px_rgba(99,102,241,0.25)]"
          >
            <div className="size-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-4 group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-2xl">smartphone</span>
            </div>
            <h2 className="text-lg font-bold text-white mb-1.5 flex items-center justify-between">
              <span>Cliente Móvil</span>
              <span className="material-symbols-outlined text-sm text-slate-500 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all">
                arrow_forward
              </span>
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed font-mono">
              Ver la cola en vivo, canjear vouchers de 8 caracteres y votar temas.
            </p>
          </Link>

          {/* Card 2: Panel de Noche */}
          <Link
            href="/panel/billar-aurora"
            className="group block bg-[#181b25] border border-[#232b42] hover:border-indigo-500/50 rounded-2xl p-6 transition-all shadow-xl hover:shadow-[0_0_24px_-4px_rgba(99,102,241,0.25)]"
          >
            <div className="size-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-4 group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-2xl">sports_bar</span>
            </div>
            <h2 className="text-lg font-bold text-white mb-1.5 flex items-center justify-between">
              <span>Panel de Control</span>
              <span className="material-symbols-outlined text-sm text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-1 transition-all">
                arrow_forward
              </span>
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed font-mono">
              Moderación en vivo, expedición de tickets térmicos y gestión de personal.
            </p>
          </Link>

          {/* Card 3: Reproductor TV */}
          <Link
            href="/player/billar-aurora"
            className="group block bg-[#181b25] border border-[#232b42] hover:border-indigo-500/50 rounded-2xl p-6 transition-all shadow-xl hover:shadow-[0_0_24px_-4px_rgba(99,102,241,0.25)]"
          >
            <div className="size-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-4 group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-2xl">tv</span>
            </div>
            <h2 className="text-lg font-bold text-white mb-1.5 flex items-center justify-between">
              <span>Reproductor TV</span>
              <span className="material-symbols-outlined text-sm text-slate-500 group-hover:text-purple-400 group-hover:translate-x-1 transition-all">
                arrow_forward
              </span>
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed font-mono">
              Pantalla dividida de alta fidelidad con vinilo rotatorio y QR dinámico.
            </p>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full text-center text-slate-500 font-mono text-xs py-6 border-t border-[#1E2333] bg-[#0A0E17]/60">
        PonelePlay Precision System · Sistema Integral de Jukebox
      </footer>
    </main>
  );
}
