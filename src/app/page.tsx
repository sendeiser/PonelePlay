import Link from "next/link";
import { BrandMark, Wordmark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { LandingSubscriptionsSection } from "@/components/landing/landing-subscriptions-section";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-th-canvas text-th-text flex flex-col justify-between relative overflow-hidden">
      {/* Header */}
      <header className="w-full px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between border-b border-th-border bg-th-shell/95 backdrop-blur-md z-10 sticky top-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <BrandMark className="size-8 sm:size-9" />
          <Wordmark className="text-lg sm:text-xl" />
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle variant="compact" />
          <Link
            href="#planes"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono font-semibold text-th-amber hover:bg-th-recessed border border-transparent hover:border-th-amber/30 transition-colors"
          >
            <span className="material-symbols-outlined text-sm text-th-amber">workspace_premium</span>
            <span>Planes y Precios</span>
          </Link>
          <Link
            href="/como-funciona"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono font-semibold text-th-secondary hover:text-th-text hover:bg-th-recessed border border-transparent hover:border-th-border transition-colors"
          >
            <span className="material-symbols-outlined text-sm text-th-teal">help</span>
            <span>¿Cómo funciona? & App TV</span>
          </Link>
          <Link
            href="/login"
            prefetch={true}
            className="px-3 sm:px-4 py-2 min-h-[40px] inline-flex items-center rounded-xl bg-th-card hover:bg-th-recessed border border-th-border text-xs font-mono font-bold text-th-text transition-colors"
          >
            <span className="hidden xs:inline">Acceso </span>Staff
          </Link>
          <Link
            href="/signup"
            prefetch={true}
            className="px-3 sm:px-4 py-2 min-h-[40px] inline-flex items-center rounded-xl bg-th-accent hover:bg-th-accent-hover text-xs font-mono font-bold text-th-on-accent shadow-sm transition-all"
          >
            Registrar Bar
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center text-center px-4 sm:px-6 py-12 sm:py-16 z-10 max-w-5xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-th-accent-soft border border-th-accent/30 text-th-accent font-mono text-[11px] sm:text-xs font-semibold mb-6">
          <span className="size-2 rounded-full bg-th-teal animate-pulse" />
          <span>JUKEBOX COLABORATIVO · SALÓN EN VIVO</span>
        </div>

        <h1 className="font-display text-4xl sm:text-5xl md:text-7xl font-extrabold text-th-text tracking-tight leading-[1.08]">
          La música del bar la elige <span className="text-th-accent">la gente</span>
        </h1>

        <p className="text-base md:text-lg text-th-secondary max-w-2xl mt-4 leading-relaxed">
          Escaneá el código QR desde tu mesa, canjeá los créditos de tu consumición y votá la próxima canción en pantalla gigante.
        </p>

        {/* Smart TV Downloader Callout Banner */}
        <div className="card-panel w-full max-w-4xl mt-8 p-4 sm:p-5 rounded-2xl border-th-accent/30 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 text-left w-full md:w-auto">
            <div className="size-11 rounded-xl bg-th-accent-soft border border-th-accent/30 flex items-center justify-center text-th-accent shrink-0">
              <span className="material-symbols-outlined text-2xl">tv</span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-display text-sm font-bold text-th-text">App Oficial para Smart TV</span>
                <span className="px-2.5 py-0.5 rounded-full bg-th-teal-soft text-th-teal border border-th-teal/35 text-xs font-mono font-extrabold tracking-wider">
                  Código Downloader: 4062401
                </span>
              </div>
              <p className="text-xs text-th-muted mt-0.5">
                Ingresá el código <strong className="text-th-teal font-mono font-bold">4062401</strong> en la app Downloader de tu Smart TV o TV Box para descargar e instalar directamente.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0 w-full md:w-auto justify-end">
            <Link
              href="https://poneleplay.netlify.app/tv.apk"
              download
              className="px-3.5 py-2 rounded-xl bg-th-recessed hover:bg-th-card border border-th-border text-th-text font-mono text-xs font-semibold flex items-center gap-1.5 transition-all"
            >
              <span className="material-symbols-outlined text-sm text-th-accent">download</span>
              <span>Descargar APK</span>
            </Link>
            <Link
              href="/como-funciona#smart-tv"
              className="px-4 py-2 rounded-xl bg-th-accent hover:bg-th-accent-hover text-th-on-accent font-mono text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
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
            className="group block card-panel hover:border-th-accent/50 rounded-2xl p-6 transition-all"
          >
            <div className="size-10 rounded-xl bg-th-accent-soft border border-th-accent/30 flex items-center justify-center text-th-accent mb-4 group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-2xl">celebration</span>
            </div>
            <h2 className="font-display text-lg font-bold text-th-text mb-1.5 flex items-center justify-between">
              <span>Crear Bar o Fiesta</span>
              <span className="material-symbols-outlined text-sm text-th-muted group-hover:text-th-accent group-hover:translate-x-1 transition-all">
                arrow_forward
              </span>
            </h2>
            <p className="text-xs text-th-muted leading-relaxed font-mono">
              Creá tu cabina para Bar Comercial (con vouchers) o Modo Fiesta / Cumpleaños (todo desbloqueado).
            </p>
          </Link>

          {/* Card 2: Panel de Control */}
          <Link
            href="/login"
            prefetch={true}
            className="group block card-panel hover:border-th-teal/50 rounded-2xl p-6 transition-all"
          >
            <div className="size-10 rounded-xl bg-th-teal-soft border border-th-teal/30 flex items-center justify-center text-th-teal mb-4 group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-2xl">sports_bar</span>
            </div>
            <h2 className="font-display text-lg font-bold text-th-text mb-1.5 flex items-center justify-between">
              <span>Panel de Control</span>
              <span className="material-symbols-outlined text-sm text-th-muted group-hover:text-th-teal group-hover:translate-x-1 transition-all">
                arrow_forward
              </span>
            </h2>
            <p className="text-xs text-th-muted leading-relaxed font-mono">
              Iniciá sesión en tu cabina para controlar la música, vincular pantallas TV y moderar la cola en vivo.
            </p>
          </Link>

          {/* Card 3: Pantalla TV */}
          <Link
            href="/tv"
            prefetch={true}
            className="group block card-panel hover:border-th-amber/50 rounded-2xl p-6 transition-all"
          >
            <div className="size-10 rounded-xl bg-th-amber-soft border border-th-amber/30 flex items-center justify-center text-th-amber mb-4 group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-2xl">tv</span>
            </div>
            <h2 className="font-display text-lg font-bold text-th-text mb-1.5 flex items-center justify-between">
              <span>Pantalla TV Salón</span>
              <span className="material-symbols-outlined text-sm text-th-muted group-hover:text-th-amber group-hover:translate-x-1 transition-all">
                arrow_forward
              </span>
            </h2>
            <p className="text-xs text-th-muted leading-relaxed font-mono">
              Vinculá cualquier Smart TV desde cero mediante código PIN de 6 dígitos con la cabina de tu cuenta.
            </p>
          </Link>
        </div>

        {/* Quick Link to How it works */}
        <div className="mt-8">
          <Link
            href="/como-funciona"
            className="inline-flex items-center gap-2 text-xs font-mono font-semibold text-th-accent hover:underline underline-offset-4 transition-colors"
          >
            <span>¿Nuevo en PonelePlay? Leé la guía completa de cómo funciona el sistema →</span>
          </Link>
        </div>
      </section>

      {/* Subscriptions & Pricing Section (Bar & Party Plans) */}
      <LandingSubscriptionsSection />

      {/* Footer */}
      <footer className="w-full text-center text-th-muted font-mono text-xs py-6 border-t border-th-border bg-th-shell flex flex-col sm:flex-row items-center justify-between px-6 gap-3">
        <span>PonelePlay Precision System · Sistema Integral de Jukebox</span>
        <div className="flex flex-wrap items-center justify-center gap-4 text-[11px]">
          <Link href="#planes" className="hover:text-th-amber transition-colors">
            Planes y Suscripciones
          </Link>
          <span className="text-th-border-strong">·</span>
          <Link href="/como-funciona" className="hover:text-th-text transition-colors">
            Cómo Funciona & App TV
          </Link>
          <span className="text-th-border-strong">·</span>
          <Link href="https://poneleplay.netlify.app/tv.apk" download className="hover:text-th-text transition-colors">
            Descargar APK (Downloader 4062401)
          </Link>
          <span className="text-th-border-strong">·</span>
          <Link href="/login" className="hover:text-th-text transition-colors">
            Staff
          </Link>
        </div>
      </footer>
    </main>
  );
}
