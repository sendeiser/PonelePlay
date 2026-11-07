import Link from "next/link";
import { BrandMark, Wordmark } from "@/components/brand";
import { LandingSubscriptionsSection } from "@/components/landing/landing-subscriptions-section";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#090D16] text-[#dfe2ef] flex flex-col justify-between relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 size-[36rem] bg-[radial-gradient(circle,rgba(99,102,241,0.12)_0%,transparent_70%)] rounded-full pointer-events-none" />
      <div className="absolute -bottom-32 right-10 size-[30rem] bg-[radial-gradient(circle,rgba(6,182,212,0.10)_0%,transparent_70%)] rounded-full pointer-events-none" />

      {/* Header */}
      <header className="w-full px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between border-b border-[#1E2333] bg-[#0A0E17]/95 backdrop-blur-md z-10">
        <div className="flex items-center gap-2 sm:gap-3">
          <BrandMark className="size-8 sm:size-9" />
          <Wordmark className="text-lg sm:text-xl" />
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="#planes"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono font-semibold text-amber-300 hover:text-amber-200 hover:bg-[#181b25] border border-transparent hover:border-amber-500/30 transition-colors"
          >
            <span className="material-symbols-outlined text-sm text-amber-400">workspace_premium</span>
            <span>Planes y Precios</span>
          </Link>
          <Link
            href="/como-funciona"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono font-semibold text-slate-300 hover:text-white hover:bg-[#181b25] border border-transparent hover:border-[#232b42] transition-colors"
          >
            <span className="material-symbols-outlined text-sm text-cyan-400">help</span>
            <span>¿Cómo funciona? & App TV</span>
          </Link>
          <Link
            href="/login"
            prefetch={true}
            className="px-3 sm:px-4 py-2 min-h-[40px] inline-flex items-center rounded-xl bg-[#181b25] hover:bg-[#202534] border border-[#232b42] text-xs font-mono font-bold text-white transition-colors"
          >
            <span className="hidden xs:inline">Acceso </span>Staff
          </Link>
          <Link
            href="/signup"
            prefetch={true}
            className="px-3 sm:px-4 py-2 min-h-[40px] inline-flex items-center rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-xs font-mono font-bold text-white shadow-md shadow-indigo-600/30 transition-all"
          >
            Registrar Bar
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center text-center px-4 sm:px-6 py-12 sm:py-16 z-10 max-w-5xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-[#c0c1ff] font-mono text-[11px] sm:text-xs mb-6 shadow-[0_0_15px_rgba(99,102,241,0.25)]">
          <span className="size-2 rounded-full bg-cyan-400 animate-pulse" />
          <span>JUKEBOX COLABORATIVO · DISEÑO FIELTRO Y NEÓN</span>
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-7xl font-extrabold text-white tracking-tight leading-[1.1]">
          La música del bar la elige <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">la gente</span>
        </h1>

        <p className="text-base md:text-lg text-slate-400 max-w-2xl mt-4 leading-relaxed">
          Escaneá el código QR desde tu mesa, canjeá los créditos de tu consumición y votá la próxima canción en pantalla gigante.
        </p>

        {/* Smart TV Downloader Callout Banner */}
        <div className="w-full max-w-4xl mt-8 p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-indigo-950/70 via-[#131726]/80 to-purple-950/60 border border-indigo-500/30 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-3.5 text-left w-full md:w-auto">
            <div className="size-11 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0">
              <span className="material-symbols-outlined text-2xl">tv</span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-white">App Oficial para Smart TV</span>
                <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-xs font-mono font-extrabold tracking-wider animate-pulse">
                  Código Downloader: 4062401
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Ingresá el código <strong className="text-cyan-300 font-mono font-bold">4062401</strong> en la app Downloader de tu Smart TV o TV Box para descargar e instalar directamente.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0 w-full md:w-auto justify-end">
            <Link
              href="https://poneleplay.netlify.app/tv.apk"
              download
              className="px-3.5 py-2 rounded-xl bg-[#1E2333] hover:bg-[#283046] border border-[#2A3147] text-white font-mono text-xs font-semibold flex items-center gap-1.5 transition-all"
            >
              <span className="material-symbols-outlined text-sm text-indigo-400">download</span>
              <span>Descargar APK</span>
            </Link>
            <Link
              href="/como-funciona#smart-tv"
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-mono text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-indigo-600/30 transition-all"
            >
              <span>Ver Guía TV</span>
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </Link>
          </div>
        </div>

        {/* 3 Entry Point Bento Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full mt-8 text-left">
          {/* Card 1: Crear Sala / Modo Fiesta o Bar */}
          <Link
            href="/signup"
            prefetch={true}
            className="group block bg-[#181b25] border border-[#232b42] hover:border-indigo-500/50 rounded-2xl p-6 transition-all shadow-xl hover:shadow-[0_0_24px_-4px_rgba(99,102,241,0.25)]"
          >
            <div className="size-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-4 group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-2xl">celebration</span>
            </div>
            <h2 className="text-lg font-bold text-white mb-1.5 flex items-center justify-between">
              <span>Crear Bar o Fiesta</span>
              <span className="material-symbols-outlined text-sm text-slate-500 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all">
                arrow_forward
              </span>
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed font-mono">
              Creá tu cabina para Bar Comercial (con vouchers) o Modo Fiesta / Cumpleaños (todo desbloqueado).
            </p>
          </Link>

          {/* Card 2: Panel de Control */}
          <Link
            href="/login"
            prefetch={true}
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
              Iniciá sesión en tu cabina para controlar la música, vincular pantallas TV y moderar la cola en vivo.
            </p>
          </Link>

          {/* Card 3: Pantalla TV */}
          <Link
            href="/tv"
            prefetch={true}
            className="group block bg-[#181b25] border border-[#232b42] hover:border-indigo-500/50 rounded-2xl p-6 transition-all shadow-xl hover:shadow-[0_0_24px_-4px_rgba(99,102,241,0.25)]"
          >
            <div className="size-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-4 group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-2xl">tv</span>
            </div>
            <h2 className="text-lg font-bold text-white mb-1.5 flex items-center justify-between">
              <span>Pantalla TV Salón</span>
              <span className="material-symbols-outlined text-sm text-slate-500 group-hover:text-purple-400 group-hover:translate-x-1 transition-all">
                arrow_forward
              </span>
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed font-mono">
              Vinculá cualquier Smart TV desde cero mediante código PIN de 6 dígitos con la cabina de tu cuenta.
            </p>
          </Link>
        </div>

        {/* Quick Link to How it works */}
        <div className="mt-8">
          <Link
            href="/como-funciona"
            className="inline-flex items-center gap-2 text-xs font-mono text-indigo-400 hover:text-indigo-300 underline underline-offset-4 transition-colors"
          >
            <span>¿Nuevo en PonelePlay? Leé la guía completa de cómo funciona el sistema →</span>
          </Link>
        </div>
      </section>

      {/* Subscriptions & Pricing Section (Bar & Party Plans) */}
      <LandingSubscriptionsSection />

      {/* Footer */}
      <footer className="w-full text-center text-slate-500 font-mono text-xs py-6 border-t border-[#1E2333] bg-[#0A0E17]/60 flex flex-col sm:flex-row items-center justify-between px-6 gap-3">
        <span>PonelePlay Precision System · Sistema Integral de Jukebox</span>
        <div className="flex items-center gap-4 text-[11px]">
          <Link href="#planes" className="hover:text-amber-300 transition-colors">
            Planes y Suscripciones
          </Link>
          <span className="text-slate-700">·</span>
          <Link href="/como-funciona" className="hover:text-slate-300 transition-colors">
            Cómo Funciona & App TV
          </Link>
          <span className="text-slate-700">·</span>
          <Link href="https://poneleplay.netlify.app/tv.apk" download className="hover:text-slate-300 transition-colors">
            Descargar APK (Downloader 4062401)
          </Link>
          <span className="text-slate-700">·</span>
          <Link href="/login" className="hover:text-slate-300 transition-colors">
            Staff
          </Link>
        </div>
      </footer>
    </main>
  );
}
