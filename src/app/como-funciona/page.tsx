import Link from "next/link";
import { BrandMark, Wordmark } from "@/components/brand";
import {
  Tv,
  Smartphone,
  Laptop,
  Download,
  QrCode,
  CheckCircle2,
  Clock,
  Flame,
  ArrowRight,
  ShieldCheck,
  HelpCircle,
  Sparkles,
  Printer,
  Receipt,
  Radio,
} from "lucide-react";
import { CopyCodeButton } from "./copy-code-button";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata = {
  title: "Cómo Funciona & App TV | PonelePlay Jukebox",
  description:
    "Guía completa de funcionamiento de PonelePlay para bares y restaurantes. Cómo instalar la app en Android TV con el código de Downloader 4062401 y reglas de votación.",
};

export default function ComoFuncionaPage() {
  const DOWNLOADER_CODE = "4062401";

  return (
    <main className="min-h-screen bg-th-canvas tech-bg text-th-text flex flex-col justify-between relative overflow-hidden">
      {/* Header */}
      <header className="w-full px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between border-b border-th-border bg-th-shell/95 backdrop-blur-md z-20 sticky top-0">
        <Link href="/" className="flex items-center gap-2 sm:gap-3 hover:opacity-90 transition-opacity">
          <BrandMark className="size-8 sm:size-9" />
          <Wordmark className="text-lg sm:text-xl" />
        </Link>
        <div className="flex items-center gap-2 sm:gap-3 text-xs">
          <ThemeToggle variant="compact" />
          <Link
            href="/"
            className="px-3 sm:px-4 min-h-[40px] inline-flex items-center rounded-xl bg-th-recessed hover:bg-th-hover border border-th-border text-th-text-2 hover:text-th-text font-medium transition-colors"
          >
            Inicio
          </Link>
          <Link
            href="/signup"
            prefetch={true}
            className="px-3 sm:px-4 min-h-[40px] inline-flex items-center rounded-xl bg-th-accent hover:bg-th-accent-hover font-semibold text-white shadow-sm transition-colors"
          >
            Registrar Bar
          </Link>
        </div>
      </header>

      {/* Hero Intro */}
      <section className="flex flex-col items-center justify-center text-center px-4 sm:px-6 pt-12 pb-8 sm:pt-16 sm:pb-12 z-10 max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-th-accent-soft border border-th-accent/30 text-th-accent font-mono text-[11px] sm:text-xs font-semibold mb-6">
          <span className="size-2 rounded-full bg-th-teal animate-pulse" />
          <span>GUÍA OFICIAL DEL SISTEMA · BARES &amp; RESTAURANTES</span>
        </div>

        <h1 className="font-display text-3xl sm:text-5xl md:text-6xl font-extrabold text-th-text tracking-tight leading-[1.1]">
          ¿Cómo funciona <span className="text-th-accent">PonelePlay</span> en tu local?
        </h1>

        <p className="text-sm sm:text-base md:text-lg text-th-text-2 max-w-2xl mt-4 leading-relaxed font-sans">
          PonelePlay conecta la computadora del bar, los televisores del salón y los celulares de las mesas en una sola experiencia interactiva musical.
        </p>
      </section>

      <div className="max-w-5xl w-full mx-auto px-4 sm:px-6 pb-20 space-y-16 z-10">
        {/* ================= SECCIÓN 1: LAS 3 PANTALLAS DEL SISTEMA ================= */}
        <section className="space-y-6">
          <div className="border-b border-th-border pb-3">
            <span className="font-mono text-xs text-th-teal uppercase tracking-widest font-bold">Arquitectura</span>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-th-text mt-1">1. Las 3 Pantallas del Local</h2>
            <p className="text-xs sm:text-sm text-th-text-2 mt-1">
              Cada dispositivo tiene una función clara y complementaria para que el bar funcione de forma armónica.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Pantalla 1: PC / Cabina Admin */}
            <div className="card-panel rounded-2xl p-6 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="size-12 rounded-xl bg-th-accent-soft text-th-accent flex items-center justify-center border border-th-accent/30">
                  <Laptop className="size-6" />
                </div>
                <div>
                  <span className="font-mono text-[10px] text-th-accent uppercase font-bold tracking-wider">
                    Cabina / Mostrador
                  </span>
                  <h3 className="font-display text-lg font-bold text-th-text">Panel de Control Admin</h3>
                </div>
                <p className="text-xs text-th-text-2 leading-relaxed">
                  Es la computadora del bar donde <strong className="text-th-text">se conecta el equipo de sonido</strong>. Todo el control de reproducción se maneja aquí.
                </p>
                <ul className="space-y-2 text-xs text-th-text-2 pt-3 border-t border-th-border">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-th-emerald shrink-0" />
                    <span>Control de audio (Play, Pausa, Salteo, Volumen).</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-th-emerald shrink-0" />
                    <span>Emisión de tickets de créditos para los mozos.</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-th-emerald shrink-0" />
                    <span>Moderación de canciones (vetar o adelantar temas).</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-th-emerald shrink-0" />
                    <span>Configuración de tiempos y catálogo musical.</span>
                  </li>
                </ul>
              </div>
              <div className="pt-3 border-t border-th-border text-[11px] font-mono text-th-accent font-semibold">
                URL: /panel/[slug-del-bar]
              </div>
            </div>

            {/* Pantalla 2: TV del Salón */}
            <div className="card-panel rounded-2xl p-6 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="size-12 rounded-xl bg-th-teal-soft text-th-teal flex items-center justify-center border border-th-teal/30">
                  <Tv className="size-6" />
                </div>
                <div>
                  <span className="font-mono text-[10px] text-th-teal uppercase font-bold tracking-wider">
                    Pared del Salón / Smart TV
                  </span>
                  <h3 className="font-display text-lg font-bold text-th-text">Pantalla TV (Cartelera)</h3>
                </div>
                <p className="text-xs text-th-text-2 leading-relaxed">
                  Es una <strong className="text-th-text">cartelera visual para los clientes</strong>. No tiene botones de play ni interrupciones para que nadie en el salón pueda apagar la música.
                </p>
                <ul className="space-y-2 text-xs text-th-text-2 pt-3 border-t border-th-border">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-th-teal shrink-0" />
                    <span>Muestra el tema sonando con vinilo o video HD.</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-th-teal shrink-0" />
                    <span>Cola de espera y temas en votación popular.</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-th-teal shrink-0" />
                    <span>Código QR gigante de alta visibilidad (tecla Q).</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-th-teal shrink-0" />
                    <span>Reloj en cuenta regresiva de la ronda actual.</span>
                  </li>
                </ul>
              </div>
              <div className="pt-3 border-t border-th-border text-[11px] font-mono text-th-teal font-semibold">
                App Nativa APK o /player/[slug]
              </div>
            </div>

            {/* Pantalla 3: Celular de las Mesas */}
            <div className="card-panel rounded-2xl p-6 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="size-12 rounded-xl bg-th-amber-soft text-th-amber flex items-center justify-center border border-th-amber/30">
                  <Smartphone className="size-6" />
                </div>
                <div>
                  <span className="font-mono text-[10px] text-th-amber uppercase font-bold tracking-wider">
                    Clientes en las Mesas
                  </span>
                  <h3 className="font-display text-lg font-bold text-th-text">App Web de Clientes</h3>
                </div>
                <p className="text-xs text-th-text-2 leading-relaxed">
                  <strong className="text-th-text">Sin instalar aplicaciones</strong>: los clientes apuntan con la cámara de su teléfono al código QR de la mesa y entran al instante.
                </p>
                <ul className="space-y-2 text-xs text-th-text-2 pt-3 border-t border-th-border">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-th-amber shrink-0" />
                    <span>Canjean el ticket del mozo para sumar créditos.</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-th-amber shrink-0" />
                    <span>Buscan canciones en YouTube o en el catálogo.</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-th-amber shrink-0" />
                    <span>Votan para que su tema suba en la pantalla de la TV.</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-th-amber shrink-0" />
                    <span>Ven en vivo cuánto tiempo le queda a la ronda.</span>
                  </li>
                </ul>
              </div>
              <div className="pt-3 border-t border-th-border text-[11px] font-mono text-th-amber font-semibold">
                URL: /p/[slug-del-bar]
              </div>
            </div>
          </div>
        </section>

        {/* ================= SECCIÓN 2: DESCARGA DE LA APP PARA LA TV (DOWNLOADER) ================= */}
        <section className="hero-panel rounded-3xl p-6 sm:p-10 relative overflow-hidden">
          <div className="max-w-3xl space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-th-teal-soft border border-th-teal/30 text-th-teal font-mono text-xs font-bold">
              <Download className="size-3.5" />
              <span>APLICACIÓN PARA SMART TV</span>
            </div>

            <div className="space-y-2">
              <h2 className="font-display text-2xl sm:text-4xl font-extrabold text-th-text tracking-tight">
                Cómo Descargar la App en tu Televisor
              </h2>
              <p className="text-th-text-2 text-sm sm:text-base leading-relaxed">
                Nuestra app nativa para <strong className="text-th-text">Android TV, Google TV, Xiaomi Mi Box y Fire TV Stick</strong> mantiene la pantalla siempre encendida, oculta las barras del sistema y optimiza la fluidez en el salón.
              </p>
            </div>

            {/* Downloader Box High-Contrast Callout */}
            <div className="card-panel rounded-2xl p-6 sm:p-7 space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-4 border-b border-th-border pb-4">
                <div>
                  <span className="font-mono text-xs text-th-amber font-bold uppercase tracking-wider block">
                    Método Más Rápido (Directo en la TV)
                  </span>
                  <h3 className="font-display text-xl font-bold text-th-text mt-0.5">
                    Descargar con la App &quot;Downloader&quot;
                  </h3>
                </div>
                <div className="flex items-center gap-2.5 bg-th-recessed px-4 py-2 rounded-xl border border-th-border">
                  <span className="text-xs font-mono text-th-text-2">Código Downloader:</span>
                  <span className="text-2xl font-black font-mono text-th-accent tracking-wider">
                    {DOWNLOADER_CODE}
                  </span>
                  <CopyCodeButton code={DOWNLOADER_CODE} />
                </div>
              </div>

              {/* 4 Step Instructions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-th-text-2">
                <div className="p-3.5 rounded-xl bg-th-recessed border border-th-border space-y-1">
                  <span className="font-mono font-bold text-th-teal block">Paso 1: Instalar Downloader</span>
                  <p className="text-th-text-2 font-sans text-xs leading-relaxed">
                    En la tienda Google Play Store de tu Android TV (o Appstore de Fire TV), buscá la app gratuita <strong className="text-th-text">&quot;Downloader by AFTVnews&quot;</strong> e instalala.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-th-recessed border border-th-border space-y-1">
                  <span className="font-mono font-bold text-th-amber block">Paso 2: Escribir el Código</span>
                  <p className="text-th-text-2 font-sans text-xs leading-relaxed">
                    Abrí Downloader y en la casilla de URL o código numérico escribí: <strong className="text-th-text font-mono bg-th-card border border-th-border px-1.5 py-0.5 rounded">{DOWNLOADER_CODE}</strong> y presioná <strong className="text-th-text">Go</strong>.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-th-recessed border border-th-border space-y-1">
                  <span className="font-mono font-bold text-th-emerald block">Paso 3: Instalar la App</span>
                  <p className="text-th-text-2 font-sans text-xs leading-relaxed">
                    Downloader descargará automáticamente el instalador de PonelePlay TV. Aceptá la instalación y tocá en <strong className="text-th-text">Abrir</strong>.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-th-recessed border border-th-border space-y-1">
                  <span className="font-mono font-bold text-th-accent block">Paso 4: Conectar tu Bar</span>
                  <p className="text-th-text-2 font-sans text-xs leading-relaxed">
                    Presioná el botón <strong className="text-th-text">Menú</strong> o <strong className="text-th-text">Atrás</strong> en el control remoto para escribir el identificador de tu bar (ej: <code className="text-th-accent font-mono">billar-aurora</code>). ¡Listo!
                  </p>
                </div>
              </div>
            </div>

            {/* Alternative Methods Buttons */}
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <a
                href="https://poneleplay.netlify.app/tv.apk"
                download="tv.apk"
                className="px-5 py-3 rounded-xl bg-th-accent hover:bg-th-accent-hover text-white text-xs font-semibold transition-colors shadow-sm flex items-center gap-2"
              >
                <Download className="size-4" />
                <span>Descargar APK Directo / Pendrive USB</span>
              </a>

              <Link
                href="/tv"
                className="px-5 py-3 rounded-xl bg-th-card hover:bg-th-hover border border-th-border text-th-text-2 hover:text-th-text text-xs font-semibold transition-colors flex items-center gap-2"
              >
                <Tv className="size-4 text-th-accent" />
                <span>Modo Web TV por Navegador</span>
              </Link>
            </div>
          </div>
        </section>

        {/* ================= SECCIÓN 3: REGLAS DE VOTACIÓN Y RONDAS ================= */}
        <section className="space-y-6">
          <div className="border-b border-th-border pb-3">
            <span className="font-mono text-xs text-th-amber uppercase tracking-widest font-bold">Mecánica</span>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-th-text mt-1">2. Sistema de Votación &amp; Rondas Automáticas</h2>
            <p className="text-xs sm:text-sm text-th-text-2 mt-1">
              ¿Cómo entra una canción a sonar en los parlantes del local?
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Regla 1: Meta Directa */}
            <div className="card-panel rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <span className="size-10 rounded-xl bg-th-accent-soft border border-th-accent/30 text-th-accent flex items-center justify-center shrink-0">
                  <Flame className="size-5" />
                </span>
                <div>
                  <h3 className="font-display text-base font-bold text-th-text">Meta Directa: 5 Votos</h3>
                  <span className="font-mono text-[11px] text-th-accent font-semibold">Pase inmediato a la cola activa</span>
                </div>
              </div>
              <p className="text-xs sm:text-sm text-th-text-2 leading-relaxed font-sans">
                Cuando una canción propuesta por cualquier mesa acumula <strong className="text-th-text">5 votos</strong> de diferentes clientes o consumiciones, entra automáticamente a la cola de reproducción de la TV sin esperas.
              </p>
              <div className="p-3 bg-th-recessed rounded-xl border border-th-border font-mono text-xs text-th-text-2 flex items-center gap-2">
                <span className="text-th-emerald font-bold">✓ Efecto:</span>
                <span>Fomenta que grupos de amigos se organicen para votar sus temas favoritos.</span>
              </div>
            </div>

            {/* Regla 2: Rondas por Tiempo */}
            <div className="card-panel rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <span className="size-10 rounded-xl bg-th-amber-soft border border-th-amber/30 text-th-amber flex items-center justify-center shrink-0">
                  <Clock className="size-5" />
                </span>
                <div>
                  <h3 className="font-display text-base font-bold text-th-text">Rondas de Votación (Desempate)</h3>
                  <span className="font-mono text-[11px] text-th-amber font-semibold">Si ninguna canción llega a 5 votos</span>
                </div>
              </div>
              <p className="text-xs sm:text-sm text-th-text-2 leading-relaxed font-sans">
                Para salones más tranquilos o pedidos diversos, el sistema ejecuta rondas periódicas (por ejemplo cada <strong className="text-th-text">3 minutos</strong>):
              </p>
              <ul className="space-y-1.5 text-xs text-th-text-2">
                <li className="flex items-start gap-2">
                  <span className="text-th-amber font-mono font-bold">1.</span>
                  <span>Al terminar el tiempo de la ronda, <strong className="text-th-text">la canción más votada</strong> entra a la TV.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-th-amber font-mono font-bold">2.</span>
                  <span>En caso de empate en votos, entra <strong className="text-th-text">la primera que fue propuesta</strong> (orden de llegada).</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-th-amber font-mono font-bold">3.</span>
                  <span>El encargado del bar también puede hacer clic en <em>&quot;Resolver Ronda Ahora&quot;</em> en cualquier momento.</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* ================= SECCIÓN 4: CÓDIGOS DE CONSUMICIÓN & MOZOS ================= */}
        <section className="space-y-6">
          <div className="border-b border-th-border pb-3">
            <span className="font-mono text-xs text-th-emerald uppercase tracking-widest font-bold">Monetización</span>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-th-text mt-1">3. Sistema de Tickets Térmicos &amp; Créditos</h2>
            <p className="text-xs sm:text-sm text-th-text-2 mt-1">
              Cómo vincular el consumo en el bar con el derecho a elegir la música.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
            <div className="card-panel rounded-2xl p-5 space-y-2">
              <Receipt className="size-6 text-th-emerald" />
              <h4 className="font-display text-sm font-bold text-th-text">1. El Cliente Consume</h4>
              <p className="text-th-text-2 leading-relaxed">
                Cada cerveza, trago o consumición incluye un voucher impreso con un código único de 8 caracteres (ej: <code className="text-th-accent font-mono font-bold">M3YBG584</code>).
              </p>
            </div>

            <div className="card-panel rounded-2xl p-5 space-y-2">
              <QrCode className="size-6 text-th-teal" />
              <h4 className="font-display text-sm font-bold text-th-text">2. Canje Directo con QR</h4>
              <p className="text-th-text-2 leading-relaxed">
                El cliente puede escanear el código QR del ticket directamente con su cámara para sumar los créditos sin tener que escribir nada manualmente.
              </p>
            </div>

            <div className="card-panel rounded-2xl p-5 space-y-2">
              <Printer className="size-6 text-th-accent" />
              <h4 className="font-display text-sm font-bold text-th-text">3. Impresión Rápida</h4>
              <p className="text-th-text-2 leading-relaxed">
                Los mozos o la caja pueden generar e imprimir tickets individuales o paquetes de vouchers desde el Panel de Control en un solo clic.
              </p>
            </div>
          </div>
        </section>

        {/* ================= SECCIÓN 5: FAQ / PREGUNTAS FRECUENTES ================= */}
        <section className="space-y-4">
          <div className="border-b border-th-border pb-3">
            <span className="font-mono text-xs text-th-accent uppercase tracking-widest font-bold">Dudas</span>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-th-text mt-1">Preguntas Frecuentes</h2>
          </div>

          <div className="space-y-3 text-xs">
            <div className="card-panel rounded-xl p-4 space-y-1.5">
              <h4 className="font-display text-sm font-bold text-th-text flex items-center gap-2">
                <HelpCircle className="size-4 text-th-teal shrink-0" />
                ¿Qué pasa si se corta internet o la TV se apaga?
              </h4>
              <p className="text-th-text-2 font-sans text-xs leading-relaxed">
                La música sigue sonando en la computadora del bar. Cuando la TV vuelve a encenderse, la app se reconecta automáticamente al salón y sincroniza la cola en tiempo real.
              </p>
            </div>

            <div className="card-panel rounded-xl p-4 space-y-1.5">
              <h4 className="font-display text-sm font-bold text-th-text flex items-center gap-2">
                <ShieldCheck className="size-4 text-th-emerald shrink-0" />
                ¿Se pueden filtrar canciones con groserías o contenido adulto?
              </h4>
              <p className="text-th-text-2 font-sans text-xs leading-relaxed">
                Sí. PonelePlay cuenta con un filtro acústico y de contenido que bloquea videos catalogados para mayores de 18 años y una lista de palabras clave configurables desde el panel de Ajustes.
              </p>
            </div>

            <div className="card-panel rounded-xl p-4 space-y-1.5">
              <h4 className="font-display text-sm font-bold text-th-text flex items-center gap-2">
                <Radio className="size-4 text-th-amber shrink-0" />
                ¿Qué suena si ningún cliente pide música?
              </h4>
              <p className="text-th-text-2 font-sans text-xs leading-relaxed">
                El bar cuenta con una lista de reproducción predeterminada (Playlist de Respaldo del Local) que suena continuamente en segundo plano para que nunca haya silencio en el salón.
              </p>
            </div>
          </div>
        </section>

        {/* CTA Register */}
        <section className="hero-panel rounded-3xl p-8 sm:p-10 text-center space-y-4">
          <Sparkles className="size-8 text-th-accent mx-auto" />
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-th-text">¿Listo para transformar la noche de tu bar?</h2>
          <p className="text-th-text-2 text-xs sm:text-sm max-w-xl mx-auto">
            Creá tu cuenta gratis, configurá el nombre de tu salón y probá el reproductor en menos de 2 minutos.
          </p>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="px-6 py-3 rounded-xl bg-th-accent hover:bg-th-accent-hover text-white text-xs font-semibold transition-colors shadow-sm flex items-center gap-2"
            >
              <span>Registrar mi Bar Gratis</span>
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/login"
              className="px-6 py-3 rounded-xl card-panel hover:bg-th-hover text-th-text-2 hover:text-th-text text-xs font-semibold transition-colors"
            >
              Iniciar Sesión
            </Link>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="w-full text-center text-th-muted font-mono text-xs py-6 border-t border-th-border bg-th-shell/80">
        PonelePlay Precision System · Sistema Integral de Jukebox para Bares
      </footer>
    </main>
  );
}

