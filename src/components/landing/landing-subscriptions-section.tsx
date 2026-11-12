"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Crown, Tv, Zap } from "lucide-react";

interface PlanDefinition {
  id: string;
  name: string;
  category: "bar" | "party";
  badge?: string;
  billingCycle: "event" | "pack" | "monthly" | "annual";
  billingLabel: string;
  priceArs: number;
  priceDisplay: string;
  maxTvScreens: number;
  description: string;
  features: string[];
}

const BAR_PLANS: PlanDefinition[] = [
  {
    id: "bar_starter_monthly",
    name: "Bar Starter",
    category: "bar",
    billingCycle: "monthly",
    billingLabel: "por mes",
    priceArs: 14900,
    priceDisplay: "$14.900 ARS",
    maxTvScreens: 1,
    description: "Ideal para bares pequeños, cafeterías o foodtrucks con 1 pantalla TV.",
    features: [
      "1 Pantalla Smart TV / Android TV vinculada",
      "Hasta 200 tickets de créditos por noche",
      "Playlist del local y filtro explícito básico",
      "QR para mesas listo para imprimir",
    ],
  },
  {
    id: "bar_pro_monthly",
    name: "Bar Pro Nocturno",
    category: "bar",
    badge: "MÁS ELEGIDO EN BARES",
    billingCycle: "monthly",
    billingLabel: "por mes",
    priceArs: 24900,
    priceDisplay: "$24.900 ARS",
    maxTvScreens: 4,
    description: "Para pubs, cervecerías y salones de pool con múltiples pantallas y mozos.",
    features: [
      "Hasta 4 Pantallas TV sincronizadas en simultáneo",
      "Tickets de créditos y códigos QR ilimitados",
      "Acceso para mozos y personal de barra",
      "Votación para cambiar canción en vivo y Rondas Automáticas",
      "Control remoto de audio TV y Karaoke desde cabina",
    ],
  },
  {
    id: "bar_pro_annual",
    name: "Bar Pro Anual",
    category: "bar",
    badge: "2 MESES BONIFICADOS",
    billingCycle: "annual",
    billingLabel: "por año",
    priceArs: 249000,
    priceDisplay: "$249.000 ARS",
    maxTvScreens: 10,
    description: "Franquicias, grandes salones y complejos gastronómicos todo el año.",
    features: [
      "Hasta 10 Pantallas TV vinculadas en HD",
      "Tickets, sesiones nocturnas y catálogo ilimitado",
      "Soporte prioritario 24/7 y personalización de marca",
      "Ahorro del 20% frente al abono mensual",
    ],
  },
];

const PARTY_PLANS: PlanDefinition[] = [
  {
    id: "party_pass_24h",
    name: "Pase Fiesta 48hs",
    category: "party",
    billingCycle: "event",
    billingLabel: "pago único por evento",
    priceArs: 6900,
    priceDisplay: "$6.900 ARS",
    maxTvScreens: 2,
    description: "Perfecto para un cumpleaños, previa, joda o reunión de fin de semana.",
    features: [
      "48 horas con Modo Fiesta 100% desbloqueado (Sin códigos)",
      "Dedicatorias en vivo cruzando la pantalla TV",
      "Duelos 1 vs 1, Ruleta Fiestera y Fueguitos Turbo",
      "Modo Democrático configurable y Karaoke libre",
    ],
  },
  {
    id: "party_pack_3",
    name: "Pack Anfitrión (3 Fiestas)",
    category: "party",
    badge: "FAVORITO PARA JODAS",
    billingCycle: "pack",
    billingLabel: "válido por 90 días",
    priceArs: 15900,
    priceDisplay: "$15.900 ARS",
    maxTvScreens: 4,
    description: "Para grupos de amigos, quinchos o salones de eventos privados.",
    features: [
      "3 Eventos completos con todo desbloqueado",
      "Hasta 4 Pantallas TV / Proyectores en simultáneo",
      "Dedicatorias animadas, Ruleta, Duelos 1v1 y Votación de Skip",
      "Playlists guardadas entre fiestas",
    ],
  },
  {
    id: "party_dj_monthly",
    name: "Pase DJ & Eventos Pro",
    category: "party",
    badge: "EVENTOS ILIMITADOS",
    billingCycle: "monthly",
    billingLabel: "por mes",
    priceArs: 21900,
    priceDisplay: "$21.900 ARS",
    maxTvScreens: 8,
    description: "Para DJs, organizadores de fiestas, salones de cumpleaños y quintas.",
    features: [
      "Fiestas y eventos ilimitados durante todo el mes",
      "Hasta 8 Pantallas TV o proyectores conectados",
      "Todos los modos interactivos: Democrático, Turbo, Ruleta y 1v1",
      "Control total desde Cabina + App nativa Android TV",
    ],
  },
];

export function LandingSubscriptionsSection() {
  const [activeTab, setActiveTab] = useState<"bar" | "party">("bar");
  const displayedPlans = activeTab === "party" ? PARTY_PLANS : BAR_PLANS;

  return (
    <section
      id="planes"
      className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 z-10 border-t border-th-border"
    >
      {/* Section Header */}
      <div className="flex flex-col items-center text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-th-amber-soft border border-th-amber/30 text-th-amber font-mono text-[11px] sm:text-xs font-semibold mb-3">
          <Crown className="size-3.5 text-th-amber" />
          <span>SUSCRIPCIONES Y PASES · BARES & EVENTOS</span>
        </div>

        <h2 className="font-display text-2xl sm:text-4xl font-extrabold text-th-text tracking-tight">
          Elegí el plan para tu{" "}
          <span className="text-th-accent">
            Bar o Fiesta en Vivo
          </span>
        </h2>
        <p className="text-xs sm:text-sm text-th-secondary max-w-2xl mt-2">
          Activá tu cabina comercial mensual con sistema de vouchers para mozos, o desbloqueá pases por evento para cumpleaños, previas y jodas.
        </p>

        {/* Category Switcher */}
        <div className="flex p-1.5 rounded-2xl bg-th-recessed border border-th-border mt-6 shadow-xs">
          <button
            type="button"
            onClick={() => setActiveTab("bar")}
            className={`px-5 py-2.5 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === "bar"
                ? "bg-th-accent text-th-on-accent shadow-sm"
                : "text-th-muted hover:text-th-text"
            }`}
          >
            <span>🍻 Planes para Bares</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("party")}
            className={`px-5 py-2.5 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === "party"
                ? "bg-th-teal text-white shadow-sm"
                : "text-th-muted hover:text-th-text"
            }`}
          >
            <span>🎉 Pases para Fiestas</span>
          </button>
        </div>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-left">
        {displayedPlans.map((plan) => {
          const isPartyCard = plan.category === "party";
          const isHighlighted = Boolean(plan.badge);

          return (
            <div
              key={plan.id}
              className={`card-panel relative rounded-2xl p-6 flex flex-col justify-between transition-all ${
                isHighlighted
                  ? isPartyCard
                    ? "border-th-teal ring-1 ring-th-teal/30"
                    : "border-th-accent ring-1 ring-th-accent/30"
                  : "hover:border-th-border-strong"
              }`}
            >
              {plan.badge && (
                <div
                  className={`absolute -top-3 right-5 px-3 py-0.5 rounded-full font-mono text-[10px] font-black uppercase tracking-wider shadow-sm ${
                    isPartyCard
                      ? "bg-th-teal text-white"
                      : "bg-th-accent text-th-on-accent"
                  }`}
                >
                  {plan.badge}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-th-muted font-bold">
                    {isPartyCard ? "🎉 Modo Fiesta" : "🍻 Modo Bar"}
                  </span>
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-th-teal bg-th-teal-soft border border-th-teal/25 px-2 py-0.5 rounded-md">
                    <Tv className="size-3" />
                    <span>Hasta {plan.maxTvScreens} TVs</span>
                  </span>
                </div>

                <h3 className="font-display text-lg font-black text-th-text">{plan.name}</h3>
                <p className="text-xs text-th-muted mt-1 min-h-[34px]">
                  {plan.description}
                </p>

                <div className="my-5 pb-4 border-b border-th-border">
                  <span className="text-2xl sm:text-3xl font-black text-th-text font-mono tabular-nums">
                    {plan.priceDisplay}
                  </span>
                  <span className="block text-[11px] font-mono text-th-muted mt-0.5">
                    {plan.billingLabel}
                  </span>
                </div>

                <ul className="space-y-2.5 text-xs text-th-secondary mb-6">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2">
                      <Check
                        className={`size-4 shrink-0 mt-0.5 ${
                          isPartyCard ? "text-th-teal" : "text-th-emerald"
                        }`}
                      />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <Link
                href={`/signup?mode=${plan.category}&plan=${plan.id}`}
                prefetch={true}
                className={`w-full py-3 rounded-xl font-mono text-xs font-extrabold transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95 ${
                  isPartyCard
                    ? "bg-th-teal hover:brightness-105 text-white"
                    : "bg-th-accent hover:bg-th-accent-hover text-th-on-accent"
                }`}
              >
                <Zap className="size-4" />
                <span>Elegir {plan.name}</span>
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}

