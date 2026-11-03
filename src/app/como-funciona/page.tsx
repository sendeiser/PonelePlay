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

export const metadata = {
  title: "Cómo Funciona & App TV | PonelePlay Jukebox",
  description:
    "Guía completa de funcionamiento de PonelePlay para bares y restaurantes. Cómo instalar la app en Android TV con el código de Downloader 4062401 y reglas de votación.",
};

export default function ComoFuncionaPage() {
  const DOWNLOADER_CODE = "4062401";

  return (
    <main className="min-h-screen bg-[#090D16] text-[#dfe2ef] flex flex-col justify-between relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 size-[40rem] bg-[radial-gradient(circle,rgba(99,102,241,0.12)_0%,transparent_70%)] rounded-full pointer-events-none" />
      <div className="absolute top-1/3 -right-20 size-[32rem] bg-[radial-gradient(circle,rgba(6,182,212,0.10)_0%,transparent_70%)] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 left-10 size-[30rem] bg-[radial-gradient(circle,rgba(244,63,94,0.08)_0%,transparent_70%)] rounded-full pointer-events-none" />

      {/* Header */}
      <header className="w-full px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between border-b border-[#1E2333] bg-[#0A0E17]/95 backdrop-blur-md z-20 sticky top-0">
        <Link href="/" className="flex items-center gap-2 sm:gap-3 hover:opacity-90 transition-opacity">
          <BrandMark className="size-8 sm:size-9" />
          <Wordmark className="text-lg sm:text-xl" />
        </Link>
        <div className="flex items-center gap-2 sm:gap-3 font-mono text-xs">
          <Link
            href="/"
            className="px-3 sm:px-4 py-2 min-h-[40px] inline-flex items-center rounded-xl bg-[#181b25] hover:bg-[#202534] border border-[#232b42] text-slate-300 hover:text-white transition-colors"
          >
            Inicio
          </Link>
          <Link
            href="/signup"
            prefetch={true}
            className="px-3 sm:px-4 py-2 min-h-[40px] inline-flex items-center rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:brightness-110 font-bold text-white shadow-md shadow-indigo-600/30 transition-all"
          >
            Registrar Bar
          </Link>
        </div>
      </header>

      {/* Hero Intro */}
      <section className="flex flex-col items-center justify-center text-center px-4 sm:px-6 pt-12 pb-8 sm:pt-16 sm:pb-12 z-10 max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-[#c0c1ff] font-mono text-[11px] sm:text-xs mb-6 shadow-[0_0_15px_rgba(99,102,241,0.25)]">
          <span className="size-2 rounded-full bg-cyan-400 animate-pulse" />
          <span>GUÍA OFICIAL DEL SISTEMA · BARS & RESTAURANTES</span>
        </div>

        <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-white tracking-tight leading-[1.1]">
          ¿Cómo funciona <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">PonelePlay</span> en tu local?
        </h1>

        <p className="text-sm sm:text-base md:text-lg text-slate-400 max-w-2xl mt-4 leading-relaxed font-sans">
          PonelePlay conecta la computadora del bar, los televisores del salón y los celulares de las mesas en una sola experiencia interactiva musical.
        </p>
      </section>

      <div className="max-w-5xl w-full mx-auto px-4 sm:px-6 pb-20 space-y-16 z-10">
        {/* ================= SECCIÓN 1: LAS 3 PANTALLAS DEL SISTEMA ================= */}
        <section className="space-y-6">
          <div className="border-b border-[#1E2333] pb-3">
            <span className="font-mono text-xs text-cyan-400 uppercase tracking-widest font-bold">Arquitectura</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mt-1">1. Las 3 Pantallas del Local</h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Cada dispositivo tiene una función clara y complementaria para que el bar funcione de forma armónica.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Pantalla 1: PC / Cabina Admin */}
            <div className="bg-[#121624] border border-indigo-500/30 rounded-2xl p-6 shadow-xl flex flex-col justify-between space-y-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-bl-full pointer-events-none" />
              <div className="space-y-3">
                <div className="size-12 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/40">
                  <Laptop className="size-6" />
                </div>
                <div>
                  <span className="font-mono text-[10px] text-indigo-400 uppercase font-bold tracking-wider">
                    Cabina / Mostrador
                  </span>
                  <h3 className="text-lg font-bold text-white">Panel de Control Admin</h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Es la computadora del bar donde <strong>se conecta el equipo de sonido</strong>. Todo el control de reproducción se maneja aquí.
                </p>
                <ul className="space-y-2 text-xs font-mono text-slate-400 pt-2 border-t border-[#1e2538]">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" />
                    <span>Control de audio (Play, Pausa, Salteo, Volumen).</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" />
                    <span>Emisión de tickets de créditos para los mozos.</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" />
                    <span>Moderación de canciones (vetar o adelantar temas).</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" />
                    <span>Configuración de tiempos y catálogo musical.</span>
                  </li>
                </ul>
              </div>
              <div className="pt-3 border-t border-[#1e2538] text-[11px] font-mono text-indigo-300 font-semibold">
                URL: /panel/[slug-del-bar]
              </div>
            </div>

            {/* Pantalla 2: TV del Salón */}
            <div className="bg-[#121624] border border-cyan-500/30 rounded-2xl p-6 shadow-xl flex flex-col justify-between space-y-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/10 rounded-bl-full pointer-events-none" />
              <div className="space-y-3">
                <div className="size-12 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/40">
                  <Tv className="size-6" />
                </div>
                <div>
                  <span className="font-mono text-[10px] text-cyan-400 uppercase font-bold tracking-wider">
                    Pared del Salón / Smart TV
                  </span>
                  <h3 className="text-lg font-bold text-white">Pantalla TV (Cartelera)</h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Es una <strong>cartelera visual para los clientes</strong>. No tiene botones de play ni interrupciones para que nadie en el salón pueda apagar la música.
                </p>
                <ul className="space-y-2 text-xs font-mono text-slate-400 pt-2 border-t border-[#1e2538]">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-cyan-400 shrink-0" />
                    <span>Muestra el tema sonando con vinilo o video HD.</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-cyan-400 shrink-0" />
                    <span>Cola de espera y temas en votación popular.</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-cyan-400 shrink-0" />
                    <span>Código QR gigante de alta visibilidad (tecla Q).</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-cyan-400 shrink-0" />
                    <span>Reloj en cuenta regresiva de la ronda actual.</span>
                  </li>
                </ul>
              </div>
              <div className="pt-3 border-t border-[#1e2538] text-[11px] font-mono text-cyan-300 font-semibold">
                App Nativa APK o /player/[slug]
              </div>
            </div>

            {/* Pantalla 3: Celular de las Mesas */}
            <div className="bg-[#121624] border border-amber-500/30 rounded-2xl p-6 shadow-xl flex flex-col justify-between space-y-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-bl-full pointer-events-none" />
              <div className="space-y-3">
                <div className="size-12 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/40">
                  <Smartphone className="size-6" />
                </div>
                <div>
                  <span className="font-mono text-[10px] text-amber-400 uppercase font-bold tracking-wider">
                    Clientes en las Mesas
                  </span>
                  <h3 className="text-lg font-bold text-white">App Web de Clientes</h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  <strong>Sin instalar aplicaciones</strong>: los clientes apuntan con la cámara de su teléfono al código QR de la mesa y entran al instante.
                </p>
                <ul className="space-y-2 text-xs font-mono text-slate-400 pt-2 border-t border-[#1e2538]">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-amber-400 shrink-0" />
                    <span>Canjean el ticket del mozo para sumar créditos.</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-amber-400 shrink-0" />
                    <span>Buscan canciones en YouTube o en el catálogo.</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-amber-400 shrink-0" />
                    <span>Votan para que su tema suba en la pantalla de la TV.</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-amber-400 shrink-0" />
                    <span>Ven en vivo cuánto tiempo le queda a la ronda.</span>
                  </li>
                </ul>
              </div>
              <div className="pt-3 border-t border-[#1e2538] text-[11px] font-mono text-amber-300 font-semibold">
                URL: /p/[slug-del-bar]
              </div>
            </div>
          </div>
        </section>

        {/* ================= SECCIÓN 2: DESCARGA DE LA APP PARA LA TV (DOWNLOADER) ================= */}
        <section className="bg-gradient-to-br from-[#13192b] via-[#101422] to-[#181528] rounded-3xl border-2 border-indigo-500/40 p-6 sm:p-10 shadow-2xl relative overflow-hidden">
          <div className="max-w-3xl space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-mono text-xs font-bold">
              <Download className="size-3.5" />
              <span>APLICACIÓN PARA SMART TV</span>
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
                Cómo Descargar la App en tu Televisor
              </h2>
              <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                Nuestra app nativa para <strong>Android TV, Google TV, Xiaomi Mi Box y Fire TV Stick</strong> mantiene la pantalla siempre encendida, oculta las barras del sistema y optimiza la fluidez en el salón.
              </p>
            </div>

            {/* Downloader Box High-Contrast Callout */}
            <div className="bg-[#0b0f1a] border border-[#283250] rounded-2xl p-6 sm:p-7 space-y-5 shadow-inner">
              <div className="flex items-center justify-between flex-wrap gap-4 border-b border-[#1e2538] pb-4">
                <div>
                  <span className="font-mono text-xs text-amber-400 font-bold uppercase tracking-wider block">
                    ⚡ Método Más Rápido (Directo en la TV)
                  </span>
                  <h3 className="text-xl font-bold text-white mt-0.5">
                    Descargar con la App &quot;Downloader&quot;
                  </h3>
                </div>
                <div className="flex items-center gap-2 bg-[#141a29] px-4 py-2 rounded-xl border border-indigo-500/30">
                  <span className="text-xs font-mono text-slate-400">Código Downloader:</span>
                  <span className="text-2xl font-black font-mono text-cyan-300 tracking-wider">
                    {DOWNLOADER_CODE}
                  </span>
                  <CopyCodeButton code={DOWNLOADER_CODE} />
                </div>
              </div>

              {/* 4 Step Instructions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono text-xs text-slate-300">
                <div className="p-3.5 rounded-xl bg-[#121626] border border-[#1e2538] space-y-1">
                  <span className="font-bold text-cyan-400 block">Paso 1: Instalar Downloader</span>
                  <p className="text-slate-400 font-sans text-xs">
                    En la tienda Google Play Store de tu Android TV (o Appstore de Fire TV), buscá la app gratuita <strong>&quot;Downloader by AFTVnews&quot;</strong> e instalala.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-[#121626] border border-[#1e2538] space-y-1">
                  <span className="font-bold text-amber-400 block">Paso 2: Escribir el Código</span>
                  <p className="text-slate-400 font-sans text-xs">
                    Abrí Downloader y en la casilla de URL o código numérico escribí: <strong className="text-white font-mono bg-black/40 px-1 py-0.5 rounded">{DOWNLOADER_CODE}</strong> y presioná <strong>Go</strong>.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-[#121626] border border-[#1e2538] space-y-1">
                  <span className="font-bold text-emerald-400 block">Paso 3: Instalar la App</span>
                  <p className="text-slate-400 font-sans text-xs">
                    Downloader descargará automáticamente el instalador de PonelePlay TV. Aceptá la instalación y tocá en <strong>Abrir</strong>.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-[#121626] border border-[#1e2538] space-y-1">
                  <span className="font-bold text-indigo-400 block">Paso 4: Conectar tu Bar</span>
                  <p className="text-slate-400 font-sans text-xs">
                    Presioná el botón <strong>Menú</strong> o <strong>Atrás</strong> en el control remoto para escribir el identificador de tu bar (ej: <code className="text-cyan-300">billar-aurora</code>). ¡Listo!
                  </p>
                </div>
              </div>
            </div>

            {/* Alternative Methods Buttons */}
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <a
                href="https://poneleplay.netlify.app/tv.apk"
                download="tv.apk"
                className="px-5 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:brightness-110 text-white font-mono text-xs font-bold transition-all shadow-lg shadow-cyan-900/30 flex items-center gap-2"
              >
                <Download className="size-4" />
                <span>Descargar APK Directo / Pendrive USB</span>
              </a>

              <Link
                href="/tv"
                className="px-5 py-3 rounded-xl bg-[#181b25] hover:bg-[#202534] border border-[#232b42] text-slate-300 hover:text-white font-mono text-xs font-bold transition-colors flex items-center gap-2"
              >
                <Tv className="size-4 text-purple-400" />
                <span>Modo Web TV por Navegador</span>
              </Link>
            </div>
          </div>
        </section>

        {/* ================= SECCIÓN 3: REGLAS DE VOTACIÓN Y RONDAS ================= */}
        <section className="space-y-6">
          <div className="border-b border-[#1E2333] pb-3">
            <span className="font-mono text-xs text-amber-400 uppercase tracking-widest font-bold">Mecánica</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mt-1">2. Sistema de Votación & Rondas Automáticas</h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              ¿Cómo entra una canción a sonar en los parlantes del local?
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Regla 1: 5 votos */}
            <div className="bg-[#121624] border border-[#232b42] rounded-2xl p-6 space-y-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="size-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shrink-0">
                  <Flame className="size-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-white">Meta Directa: 5 Votos</h3>
                  <span className="font-mono text-[11px] text-indigo-300">Pase inmediato a la cola activa</span>
                </div>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-sans">
                Cuando una canción propuesta por cualquier mesa acumula <strong>5 votos</strong> de diferentes clientes o consumiciones, entra automáticamente a la cola de reproducción de la TV sin esperas.
              </p>
              <div className="p-3 bg-[#0a0e17] rounded-xl border border-[#1e2333] font-mono text-xs text-slate-400 flex items-center gap-2">
                <span className="text-emerald-400 font-bold">✓ Efecto:</span>
                <span>Fomenta que grupos de amigos se organicen para votar sus temas favoritos.</span>
              </div>
            </div>

            {/* Regla 2: Rondas por Tiempo */}
            <div className="bg-[#121624] border border-[#232b42] rounded-2xl p-6 space-y-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="size-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                  <Clock className="size-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-white">Rondas de Votación (Desempate)</h3>
                  <span className="font-mono text-[11px] text-amber-300">Si ninguna canción llega a 5 votos</span>
                </div>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-sans">
                Para salones más tranquilos o pedidos diversos, el sistema ejecuta rondas periódicas (por ejemplo cada <strong>3 minutos</strong>):
              </p>
              <ul className="space-y-1.5 font-mono text-xs text-slate-400">
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 font-bold">1.</span>
                  <span>Al terminar el tiempo de la ronda, <strong>la canción más votada</strong> entra a la TV.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 font-bold">2.</span>
                  <span>En caso de empate en votos, entra <strong>la primera que fue propuesta</strong> (orden de llegada).</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 font-bold">3.</span>
                  <span>El encargado del bar también puede hacer clic en <em>&quot;Resolver Ronda Ahora&quot;</em> en cualquier momento.</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* ================= SECCIÓN 4: CÓDIGOS DE CONSUMICIÓN & MOZOS ================= */}
        <section className="space-y-6">
          <div className="border-b border-[#1E2333] pb-3">
            <span className="font-mono text-xs text-emerald-400 uppercase tracking-widest font-bold">Monetización</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mt-1">3. Sistema de Tickets Térmicos & Créditos</h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Cómo vincular el consumo en el bar con el derecho a elegir la música.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono text-xs">
            <div className="bg-[#121624] border border-[#232b42] rounded-2xl p-5 space-y-2">
              <Receipt className="size-6 text-emerald-400" />
              <h4 className="text-sm font-bold text-white font-sans">1. El Cliente Consume</h4>
              <p className="text-slate-400 leading-relaxed">
                Cada cerveza, trago o consumición incluye un voucher impreso con un código único de 8 caracteres (ej: <code className="text-cyan-300 font-bold">M3YBG584</code>).
              </p>
            </div>

            <div className="bg-[#121624] border border-[#232b42] rounded-2xl p-5 space-y-2">
              <QrCode className="size-6 text-cyan-400" />
              <h4 className="text-sm font-bold text-white font-sans">2. Canje Directo con QR</h4>
              <p className="text-slate-400 leading-relaxed">
                El cliente puede escanear el código QR del ticket directamente con su cámara para sumar los créditos sin tener que escribir nada manualmente.
              </p>
            </div>

            <div className="bg-[#121624] border border-[#232b42] rounded-2xl p-5 space-y-2">
              <Printer className="size-6 text-indigo-400" />
              <h4 className="text-sm font-bold text-white font-sans">3. Impresión Rápida</h4>
              <p className="text-slate-400 leading-relaxed">
                Los mozos o la caja pueden generar e imprimir tickets individuales o paquetes de vouchers desde el Panel de Control en un solo clic.
              </p>
            </div>
          </div>
        </section>

        {/* ================= SECCIÓN 5: FAQ / PREGUNTAS FRECUENTES ================= */}
        <section className="space-y-4">
          <div className="border-b border-[#1E2333] pb-3">
            <span className="font-mono text-xs text-indigo-400 uppercase tracking-widest font-bold">Dudas</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mt-1">Preguntas Frecuentes</h2>
          </div>

          <div className="space-y-3 font-mono text-xs">
            <div className="bg-[#121624] border border-[#232b42] rounded-xl p-4 space-y-1">
              <h4 className="text-sm font-bold text-white font-sans flex items-center gap-2">
                <HelpCircle className="size-4 text-cyan-400" />
                ¿Qué pasa si se corta internet o la TV se apaga?
              </h4>
              <p className="text-slate-400 font-sans text-xs leading-relaxed">
                La música sigue sonando en la computadora del bar. Cuando la TV vuelve a encenderse, la app se reconecta automáticamente al salón y sincroniza la cola en tiempo real.
              </p>
            </div>

            <div className="bg-[#121624] border border-[#232b42] rounded-xl p-4 space-y-1">
              <h4 className="text-sm font-bold text-white font-sans flex items-center gap-2">
                <ShieldCheck className="size-4 text-emerald-400" />
                ¿Se pueden filtrar canciones con groserías o contenido adulto?
              </h4>
              <p className="text-slate-400 font-sans text-xs leading-relaxed">
                Sí. PonelePlay cuenta con un filtro acústico y de contenido que bloquea videos catalogados para mayores de 18 años y una lista de palabras clave configurables desde el panel de Ajustes.
              </p>
            </div>

            <div className="bg-[#121624] border border-[#232b42] rounded-xl p-4 space-y-1">
              <h4 className="text-sm font-bold text-white font-sans flex items-center gap-2">
                <Radio className="size-4 text-amber-400" />
                ¿Qué suena si ningún cliente pide música?
              </h4>
              <p className="text-slate-400 font-sans text-xs leading-relaxed">
                El bar cuenta con una lista de reproducción predeterminada (Playlist de Respaldo del Local) que suena continuamente en segundo plano para que nunca haya silencio en el salón.
              </p>
            </div>
          </div>
        </section>

        {/* CTA Register */}
        <section className="bg-gradient-to-r from-indigo-900/60 to-purple-900/60 border border-indigo-500/40 rounded-3xl p-8 sm:p-10 text-center space-y-4">
          <Sparkles className="size-8 text-cyan-400 mx-auto" />
          <h2 className="text-2xl sm:text-3xl font-black text-white">¿Listo para transformar la noche de tu bar?</h2>
          <p className="text-slate-300 text-xs sm:text-sm max-w-xl mx-auto">
            Creá tu cuenta gratis, configurá el nombre de tu salón y probá el reproductor en menos de 2 minutos.
          </p>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 hover:brightness-110 text-white font-mono text-xs font-bold transition-all shadow-xl shadow-indigo-900/40 flex items-center gap-2"
            >
              <span>Registrar mi Bar Gratis</span>
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/login"
              className="px-6 py-3 rounded-xl bg-[#121624] hover:bg-[#1a2034] border border-[#232b42] text-slate-300 font-mono text-xs font-bold transition-colors"
            >
              Iniciar Sesión
            </Link>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="w-full text-center text-slate-500 font-mono text-xs py-6 border-t border-[#1E2333] bg-[#0A0E17]/60">
        PonelePlay Precision System · Sistema Integral de Jukebox para Bares
      </footer>
    </main>
  );
}

