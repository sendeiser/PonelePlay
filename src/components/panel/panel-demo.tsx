"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUpRight,
  Ban,
  BadgeCheck,
  Clock3,
  Copy,
  Disc3,
  Info,
  LayoutDashboard,
  Minus,
  Monitor,
  Music2,
  Plus,
  Printer,
  QrCode,
  Radio,
  Settings,
  SkipForward,
  Ticket,
  Users,
} from "lucide-react";
import { BallChip } from "@/components/ball-chip";
import { BrandMark, Wordmark } from "@/components/brand";
import { SourceBadge } from "@/components/source-badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { TicketCode } from "@/components/ticket-code";
import { cn } from "@/lib/cn";
import {
  demoNowPlaying,
  demoPanelLog,
  demoQueue,
  demoStats,
  demoVenue,
  formatVotes,
  type DemoNowPlaying,
  type DemoTrack,
} from "@/lib/demo-data";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const navItems = [
  { label: "Noche", icon: LayoutDashboard, active: true },
  { label: "Catálogo", icon: Disc3, active: false },
  { label: "Códigos", icon: Ticket, active: false },
  { label: "Personal", icon: Users, active: false },
  { label: "Ajustes", icon: Settings, active: false },
];

type LogEntry = { time: string; text: string; tone: "neutral" | "amber" | "coral" | "mint" };

export function PanelDemo({ slug }: { slug: string }) {
  const [now, setNow] = useState<DemoNowPlaying | null>(demoNowPlaying);
  const [queue, setQueue] = useState<DemoTrack[]>(demoQueue);
  const [nightOpen, setNightOpen] = useState(true);
  const [proposalsEnabled, setProposalsEnabled] = useState(true);
  const [explicitFilter, setExplicitFilter] = useState(true);
  const [creditValue, setCreditValue] = useState(5);
  const [ticket, setTicket] = useState<{ code: string; credits: number } | null>(
    null,
  );
  const [issued, setIssued] = useState({ codes: 0, credits: 0 });
  const [log, setLog] = useState<LogEntry[]>(demoPanelLog);
  const [toast, setToast] = useState<{
    message: string;
    tone: "ok" | "error";
  } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function notify(message: string, tone: "ok" | "error" = "ok") {
    setToast({ message, tone });
  }

  function addLog(text: string, tone: LogEntry["tone"]) {
    setLog((current) =>
      [
        {
          time: new Intl.DateTimeFormat("es-AR", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }).format(new Date()),
          text,
          tone,
        },
        ...current,
      ].slice(0, 6),
    );
  }

  function generateCode() {
    if (!nightOpen) {
      notify("Abrí la noche para emitir códigos.", "error");
      return;
    }

    const code = Array.from(
      { length: 8 },
      () => alphabet[Math.floor(Math.random() * alphabet.length)],
    ).join("");

    setTicket({ code, credits: creditValue });
    setIssued((current) => ({
      codes: current.codes + 1,
      credits: current.credits + creditValue,
    }));
    addLog(`Código ${code} · ${creditValue} votos · Luz`, "amber");
    notify(`Código ${code} generado.`);
  }

  async function copyCode() {
    if (!ticket) return;

    try {
      await navigator.clipboard.writeText(ticket.code);
      notify("Código copiado al portapapeles.");
    } catch {
      notify(`Copialo manualmente: ${ticket.code}`, "error");
    }
  }

  function printTicket() {
    if (!ticket) return;
    window.print();
    notify("Diálogo de impresión abierto.");
  }

  function skip() {
    if (!nightOpen) {
      notify("La noche está cerrada.", "error");
      return;
    }

    const next = queue[0] ?? null;
    const skippedTitle = now?.title;

    setQueue((current) => current.slice(1));
    setNow(next ? { ...next, elapsed: "0:00", elapsedPct: 0 } : null);
    addLog(`Skip: «${skippedTitle ?? "sin tema"}»`, "neutral");
    notify(next ? "Canción saltada. Suena la siguiente." : "Pasa la playlist de fondo.");
  }

  function veto(track: DemoTrack) {
    if (!nightOpen) {
      notify("La noche está cerrada.", "error");
      return;
    }

    setQueue((current) => current.filter((item) => item.id !== track.id));
    addLog(`Veto: «${track.title}»`, "coral");
    notify(`«${track.title}» vetado. Sin devolución de votos.`);
  }

  function toggleNight() {
    if (nightOpen) {
      setNightOpen(false);
      setTicket(null);
      addLog("Noche cerrada · códigos y créditos vencidos", "coral");
      notify("Noche cerrada. Códigos y créditos vencidos.");
      return;
    }

    setNightOpen(true);
    addLog("Noche abierta por Luz", "neutral");
    notify("Noche abierta. A emitir códigos.");
  }

  return (
    <div className="min-h-dvh bg-th-canvas text-th-text lg:flex">
      <PanelSidebar
        slug={slug}
        nightOpen={nightOpen}
        onNavigate={(label) =>
          notify(`«${label}» llega en la próxima fase de la maqueta.`)
        }
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <PanelHeader
          nightOpen={nightOpen}
          slug={slug}
          onToggleNight={toggleNight}
        />

        <MobileNav
          onNavigate={(label) =>
            notify(`«${label}» llega en la próxima fase de la maqueta.`)
          }
        />

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 lg:px-8 lg:py-7">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label="Votos de la noche"
              value={demoStats.votes}
              hint="+8 en la última hora"
              accent
            />
            <StatCard
              label="Códigos emitidos"
              value={demoStats.codes + issued.codes}
              hint={`${issued.codes} en esta sesión`}
            />
            <StatCard
              label="Créditos entregados"
              value={demoStats.credits + issued.credits}
              hint="1 crédito = 1 voto"
            />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,1fr)]">
            <div className="space-y-4">
              <NowPlayingPanel
                now={now}
                nightOpen={nightOpen}
                onSkip={skip}
              />

              <section className="card-panel rounded-3xl p-4 lg:p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-th-muted">
                      Cola en vivo
                    </p>
                    <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-th-text">
                      Lo que viene
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-th-border bg-th-recessed px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-wider text-th-secondary">
                      {queue.length} temas
                    </span>
                    <span className="hidden rounded-full border border-th-amber/30 bg-th-amber-soft px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-wider text-th-amber sm:inline-flex">
                      Por votos
                    </span>
                  </div>
                </div>

                {queue.length ? (
                  <motion.ol layout className="mt-4 max-h-[420px] pr-1 space-y-2 ui-scroll-container">
                    <AnimatePresence initial={false}>
                      {queue.map((track, index) => (
                        <motion.li
                          layout
                          key={track.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          transition={{
                            type: "spring",
                            stiffness: 420,
                            damping: 34,
                          }}
                          className="flex items-center gap-3 rounded-xl border border-th-border bg-th-recessed/70 p-2.5"
                        >
                          <BallChip n={index + 1} size="sm" />
                          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-th-card border border-th-border text-th-muted">
                            <Music2 className="size-4" aria-hidden="true" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-th-text">
                              {track.title}
                            </p>
                            <p className="truncate text-[11px] text-th-muted">
                              {track.artist} · {track.duration}
                            </p>
                          </div>
                          <SourceBadge
                            source={track.source}
                            label={false}
                            className="hidden shrink-0 sm:inline-flex"
                          />
                          <span className="w-7 shrink-0 text-right font-mono text-xs font-bold text-th-amber tabular-nums">
                            {track.votes}
                          </span>
                          <button
                            type="button"
                            onClick={() => veto(track)}
                            disabled={!nightOpen}
                            className="grid size-8 shrink-0 place-items-center rounded-full border border-th-border bg-th-card text-th-muted transition-colors hover:border-th-danger/40 hover:bg-th-danger-soft hover:text-th-danger disabled:cursor-not-allowed disabled:opacity-35"
                            aria-label={`Vetar ${track.title}`}
                            title="Vetar tema"
                          >
                            <Ban className="size-3.5" aria-hidden="true" />
                          </button>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </motion.ol>
                ) : (
                  <div className="mt-4 flex flex-col items-center rounded-2xl border border-dashed border-th-border px-6 py-10 text-center">
                    <Music2 className="size-8 text-th-muted" aria-hidden="true" />
                    <p className="mt-3 font-display text-lg font-bold text-th-text">
                      La cola está vacía
                    </p>
                    <p className="mt-1 text-xs text-th-muted">
                      Suena la playlist de fondo hasta que alguien proponga.
                    </p>
                  </div>
                )}

                <p className="mt-3 flex items-start gap-2 text-[10px] leading-relaxed text-th-muted">
                  <Info className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                  El veto saca el tema de la cola y no devuelve créditos. Los
                  votos nunca se apilan sobre una misma canción.
                </p>
              </section>
            </div>

            <div className="space-y-4">
              <section className="card-panel rounded-3xl p-4 lg:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-th-muted">
                      Mostrador
                    </p>
                    <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-th-text">
                      Emitir código
                    </h2>
                  </div>
                  <span className="grid size-9 place-items-center rounded-full bg-th-amber-soft text-th-amber">
                    <Ticket className="size-4" aria-hidden="true" />
                  </span>
                </div>

                <div className="mt-4 flex items-center justify-between rounded-2xl border border-th-border bg-th-recessed p-3">
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-th-muted">
                      Créditos
                    </p>
                    <p className="font-display text-2xl font-black leading-none text-th-text tabular-nums">
                      {creditValue}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setCreditValue((value) => Math.max(1, value - 1))
                      }
                      className="grid size-9 place-items-center rounded-full border border-th-border bg-th-card text-th-secondary hover:text-th-text transition-colors"
                      aria-label="Restar un crédito"
                    >
                      <Minus className="size-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCreditValue((value) => Math.min(50, value + 1))
                      }
                      className="grid size-9 place-items-center rounded-full border border-th-border bg-th-card text-th-secondary hover:text-th-text transition-colors"
                      aria-label="Sumar un crédito"
                    >
                      <Plus className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="mt-2 flex gap-1.5">
                  {[5, 10, 15].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setCreditValue(preset)}
                      className={cn(
                        "flex-1 rounded-lg border px-2 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider transition-colors",
                        creditValue === preset
                          ? "border-th-amber bg-th-amber-soft text-th-amber"
                          : "border-th-border bg-th-recessed text-th-muted hover:text-th-text",
                      )}
                    >
                      {preset} votos
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={generateCode}
                  disabled={!nightOpen}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-th-accent px-4 py-2.5 font-display text-sm font-bold text-th-on-accent transition-all hover:bg-th-accent-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-th-recessed disabled:text-th-muted"
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Generar código
                </button>

                {ticket ? (
                  <div className="mt-4">
                    <TicketCode
                      code={ticket.code}
                      credits={ticket.credits}
                      venueName={demoVenue.name}
                      notchColor="var(--bg-card)"
                      printable
                    />
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={copyCode}
                        className="flex items-center justify-center gap-1.5 rounded-full border border-th-border bg-th-recessed px-3 py-2 font-mono text-[9px] font-semibold uppercase tracking-wider text-th-secondary transition-colors hover:text-th-text"
                      >
                        <Copy className="size-3.5" aria-hidden="true" />
                        Copiar
                      </button>
                      <button
                        type="button"
                        onClick={printTicket}
                        className="flex items-center justify-center gap-1.5 rounded-full border border-th-border bg-th-recessed px-3 py-2 font-mono text-[9px] font-semibold uppercase tracking-wider text-th-secondary transition-colors hover:text-th-text"
                      >
                        <Printer className="size-3.5" aria-hidden="true" />
                        Imprimir
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-th-border px-5 py-8 text-center">
                    <Ticket
                      className="mx-auto size-6 text-th-muted"
                      aria-hidden="true"
                    />
                    <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.2em] text-th-muted">
                      El ticket aparece acá
                    </p>
                  </div>
                )}

                <p className="mt-3 text-[10px] leading-relaxed text-th-muted">
                  El staff elige los créditos. Un código = un uso. Se puede
                  dictar, mostrar o imprimir.
                </p>
              </section>

              <section className="card-panel rounded-3xl p-4 lg:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-th-muted">
                      Reproductor
                    </p>
                    <h2 className="mt-1 font-display text-xl font-bold tracking-tight text-th-text">
                      PC del bar
                    </h2>
                  </div>
                  <span className="grid size-9 place-items-center rounded-full bg-th-emerald-soft text-th-emerald">
                    <Monitor className="size-4" aria-hidden="true" />
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between rounded-xl border border-th-emerald/25 bg-th-emerald-soft px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="size-2 animate-pulse rounded-full bg-th-emerald" />
                    <span className="text-xs font-semibold text-th-emerald">
                      Conectado
                    </span>
                  </div>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-th-muted">
                    hace 3 s
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <div className="grid size-11 place-items-center rounded-xl border border-th-border bg-th-recessed">
                    <QrCode className="size-5 text-th-muted" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-th-text">
                      Pantalla del salón
                    </p>
                    <p className="truncate font-mono text-[9px] uppercase tracking-wider text-th-muted">
                      QR + cola + canción actual
                    </p>
                  </div>
                </div>

                <Link
                  href={`/player/${slug}`}
                  target="_blank"
                  className="mt-3 flex items-center justify-center gap-1.5 rounded-full border border-th-border bg-th-recessed px-3 py-2 text-xs font-semibold text-th-secondary transition-colors hover:bg-th-card hover:text-th-text"
                >
                  Abrir pantalla
                  <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </Link>
              </section>

              <section className="card-panel rounded-3xl p-4 lg:p-5">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-th-muted">
                    Operación
                  </p>
                  <h2 className="mt-1 font-display text-xl font-bold tracking-tight text-th-text">
                    Modos y filtros
                  </h2>
                </div>

                <div className="mt-4 space-y-4">
                  <ToggleRow
                    label="Propuestas abiertas"
                    description="Los clientes pueden sumar temas de YouTube."
                    checked={proposalsEnabled}
                    disabled={!nightOpen}
                    onChange={(checked) => {
                      setProposalsEnabled(checked);
                      notify(
                        checked
                          ? "Propuestas abiertas."
                          : "Propuestas cerradas. El catálogo sigue votable.",
                      );
                    }}
                  />
                  <ToggleRow
                    label="Filtro explícito"
                    description="Bloquea títulos marcados dentro de las propuestas."
                    checked={explicitFilter}
                    onChange={(checked) => {
                      setExplicitFilter(checked);
                      notify(
                        checked
                          ? "Filtro explícito activo."
                          : "Filtro explícito desactivado.",
                      );
                    }}
                  />
                </div>

                <p className="mt-4 flex items-start gap-2 text-[10px] leading-relaxed text-th-muted">
                  <Info className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                  Los dos modos conviven: el catálogo del dueño siempre se vota
                  y las propuestas se pueden abrir o cerrar.
                </p>
              </section>

              <section className="card-panel rounded-3xl p-4 lg:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-th-muted">
                      Últimos movimientos
                    </p>
                    <h2 className="mt-1 font-display text-xl font-bold tracking-tight text-th-text">
                      Actividad
                    </h2>
                  </div>
                  <Clock3 className="size-4 text-th-muted" aria-hidden="true" />
                </div>

                <ul className="mt-3 space-y-2.5 max-h-[260px] pr-1 ui-scroll-container">
                  {log.map((entry, index) => (
                    <li key={`${entry.time}-${index}`} className="flex gap-2.5">
                      <span
                        className={cn(
                          "mt-1.5 size-1.5 shrink-0 rounded-full",
                          entry.tone === "amber" && "bg-th-amber",
                          entry.tone === "coral" && "bg-th-danger",
                          entry.tone === "mint" && "bg-th-emerald",
                          entry.tone === "neutral" && "bg-th-muted",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] leading-snug text-th-secondary">
                          {entry.text}
                        </p>
                        <p className="font-mono text-[9px] text-th-muted">
                          {entry.time}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        </main>
      </div>

      <AnimatePresence>
        {toast ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className={cn(
              "fixed bottom-4 right-4 z-[70] flex max-w-sm items-center gap-2 rounded-full border bg-th-card px-4 py-2.5 text-xs text-th-text shadow-xl",
              toast.tone === "ok"
                ? "border-th-emerald/35"
                : "border-th-danger/35",
            )}
            role="status"
          >
            {toast.tone === "ok" ? (
              <BadgeCheck className="size-4 shrink-0 text-th-emerald" aria-hidden="true" />
            ) : (
              <Info className="size-4 shrink-0 text-th-danger" aria-hidden="true" />
            )}
            {toast.message}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function PanelSidebar({
  slug,
  nightOpen,
  onNavigate,
}: {
  slug: string;
  nightOpen: boolean;
  onNavigate: (label: string) => void;
}) {
  return (
    <aside className="no-print sticky top-0 hidden h-dvh w-64 shrink-0 flex-col overflow-y-auto border-r border-th-border bg-th-shell p-5 scrollbar-none lg:flex">
      <Link href="/" className="flex items-center gap-2.5">
        <BrandMark />
        <Wordmark />
      </Link>

      <div className="mt-6 rounded-2xl border border-th-border bg-th-card p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-th-muted">
            Noche
          </span>
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-wider",
              nightOpen
                ? "bg-th-emerald-soft text-th-emerald"
                : "bg-th-danger-soft text-th-danger",
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                nightOpen ? "bg-th-emerald" : "bg-th-danger",
              )}
            />
            {nightOpen ? "Abierta" : "Cerrada"}
          </span>
        </div>
        <p className="mt-2 font-display text-lg font-bold leading-tight text-th-text">
          {demoVenue.name}
        </p>
        <p className="font-mono text-[9px] uppercase tracking-wider text-th-muted">
          /{slug}
        </p>
      </div>

      <nav className="mt-6 space-y-1">
        {navItems.map(({ label, icon: Icon, active }) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              if (!active) onNavigate(label);
            }}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
              active
                ? "bg-th-accent text-th-on-accent font-bold shadow-xs"
                : "text-th-secondary hover:bg-th-recessed hover:text-th-text",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
            {!active ? (
              <span className="ml-auto rounded-full border border-th-border px-1.5 py-0.5 font-mono text-[7px] uppercase tracking-wider text-th-muted">
                luego
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      <div className="mt-auto">
        <div className="rounded-2xl border border-th-border bg-th-card p-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-full bg-th-accent-soft font-display text-sm font-bold text-th-accent">
              L
            </span>
            <div>
              <p className="text-sm font-semibold text-th-text">Luz</p>
              <p className="font-mono text-[9px] uppercase tracking-wider text-th-muted">
                Dueña
              </p>
            </div>
          </div>
          <Link
            href="/"
            className="mt-3 flex items-center justify-between rounded-lg border border-th-border bg-th-recessed px-3 py-2 font-mono text-[9px] uppercase tracking-wider text-th-muted transition-colors hover:text-th-text"
          >
            Volver a la maqueta
            <ArrowUpRight className="size-3" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </aside>
  );
}

function PanelHeader({
  nightOpen,
  slug,
  onToggleNight,
}: {
  nightOpen: boolean;
  slug: string;
  onToggleNight: () => void;
}) {
  return (
    <header className="no-print sticky top-0 z-30 border-b border-th-border bg-th-shell/90 px-4 py-3 backdrop-blur-xl lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="lg:hidden">
            <BrandMark className="size-9" />
          </Link>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-th-muted">
              Panel del bar
            </p>
            <div className="mt-0.5 flex items-center gap-2">
              <h1 className="font-display text-xl font-bold tracking-tight text-th-text">
                {demoVenue.name}
              </h1>
              <span
                className={cn(
                  "flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider",
                  nightOpen
                    ? "bg-th-emerald-soft text-th-emerald"
                    : "bg-th-danger-soft text-th-danger",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    nightOpen ? "bg-th-emerald" : "bg-th-danger",
                  )}
                />
                {nightOpen ? "Noche abierta" : "Noche cerrada"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ThemeToggle variant="compact" />

          <Link
            href={`/player/${slug}`}
            target="_blank"
            className="flex items-center gap-1.5 rounded-full border border-th-border bg-th-recessed px-3 py-2 text-[11px] font-semibold text-th-secondary transition-colors hover:bg-th-card hover:text-th-text"
          >
            <Monitor className="size-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Abrir reproductor</span>
            <span className="sm:hidden">Pantalla</span>
            <ArrowUpRight className="size-3" aria-hidden="true" />
          </Link>

          <button
            type="button"
            onClick={onToggleNight}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-bold transition-colors",
              nightOpen
                ? "border border-th-danger/30 bg-th-danger-soft text-th-danger hover:bg-th-danger hover:text-white"
                : "bg-th-accent text-th-on-accent hover:bg-th-accent-hover",
            )}
          >
            <Radio className="size-3.5" aria-hidden="true" />
            {nightOpen ? "Cerrar noche" : "Abrir noche"}
          </button>

          <div className="hidden items-center gap-2 rounded-full border border-th-border bg-th-recessed py-1 pl-1 pr-3 xl:flex">
            <span className="grid size-7 place-items-center rounded-full bg-th-accent-soft font-display text-[10px] font-bold text-th-accent">
              L
            </span>
            <div className="leading-tight">
              <p className="text-[11px] font-semibold text-th-text">Luz</p>
              <p className="font-mono text-[8px] uppercase tracking-wider text-th-muted">
                Dueña
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function MobileNav({ onNavigate }: { onNavigate: (label: string) => void }) {
  return (
    <div className="no-print flex gap-1.5 overflow-x-auto border-b border-th-border bg-th-shell px-4 py-2 scrollbar-none lg:hidden">
      {navItems.map(({ label, icon: Icon, active }) => (
        <button
          key={label}
          type="button"
          onClick={() => {
            if (!active) onNavigate(label);
          }}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-wider transition-colors",
            active
              ? "bg-th-accent text-th-on-accent"
              : "border border-th-border bg-th-card text-th-muted hover:text-th-text",
          )}
        >
          <Icon className="size-3" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: number;
  hint: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-3.5",
        accent
          ? "border-th-accent/30 bg-th-accent-soft"
          : "card-panel",
      )}
    >
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-th-muted">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-display text-3xl font-extrabold leading-none tabular-nums",
          accent ? "text-th-accent" : "text-th-text",
        )}
      >
        {value}
      </p>
      <p className="mt-1 font-mono text-[8px] uppercase tracking-wider text-th-muted">
        {hint}
      </p>
    </div>
  );
}

function NowPlayingPanel({
  now,
  nightOpen,
  onSkip,
}: {
  now: DemoNowPlaying | null;
  nightOpen: boolean;
  onSkip: () => void;
}) {
  return (
    <section className="card-panel relative overflow-hidden rounded-3xl p-4 lg:p-5">
      <div
        aria-hidden="true"
        className="absolute -right-20 -top-24 size-56 rounded-full border border-th-accent/15 bg-th-accent-soft/50"
      />
      <div className="relative">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.25em] text-th-accent">
              <Radio className="size-3" aria-hidden="true" />
              Reproduciendo ahora
            </p>
            {now ? (
              <>
                <h2 className="mt-2 font-display text-3xl font-extrabold leading-[0.95] tracking-tight text-th-text">
                  {now.title}
                </h2>
                <p className="mt-1 text-sm text-th-secondary">{now.artist}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <SourceBadge source={now.source} />
                  <span className="rounded-full border border-th-border bg-th-recessed px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-th-muted">
                    {formatVotes(now.votes)}
                  </span>
                  <span className="rounded-full border border-th-border bg-th-recessed px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-th-muted">
                    Cola colaborativa
                  </span>
                </div>
              </>
            ) : (
              <>
                <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-th-text">
                  Sin canción en curso
                </h2>
                <p className="mt-1 max-w-md text-sm text-th-muted">
                  La cola quedó vacía. El reproductor pasa a la playlist de fondo.
                </p>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={onSkip}
            disabled={!nightOpen || !now}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-th-accent/30 bg-th-accent-soft px-3 py-2 text-[11px] font-bold text-th-accent transition-colors hover:bg-th-accent hover:text-th-on-accent disabled:cursor-not-allowed disabled:opacity-30"
          >
            <SkipForward className="size-3.5" aria-hidden="true" />
            Saltar
          </button>
        </div>

        {now ? (
          <div className="mt-5 flex items-center gap-3">
            <span className="font-mono text-[10px] text-th-muted tabular-nums">
              {now.elapsed}
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-th-recessed">
              <div
                className="h-full rounded-full bg-th-accent"
                style={{ width: `${now.elapsedPct}%` }}
              />
            </div>
            <span className="font-mono text-[10px] text-th-muted tabular-nums">
              {now.duration}
            </span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-th-text">{label}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-th-muted">
          {description}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40",
          checked ? "bg-th-accent" : "bg-th-border-strong",
        )}
      >
        <span
          className={cn(
            "block size-5 rounded-full bg-white shadow-xs transition-transform",
            checked ? "translate-x-5" : "translate-x-0",
          )}
        />
      </button>
    </div>
  );
}
