"use client";

import { useEffect, useState, useCallback } from "react";
import { Check, Crown, Sparkles, Tv, Zap } from "lucide-react";
import type { VenueSubscriptionState } from "@/app/api/panel/subscription/route";
import { fetchServerPartyConfig, getStoredPartyConfig } from "@/lib/api/party-control";
import type { VenueType } from "@/lib/domain/party";

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
    description: "franquicias, grandes salones y complejos gastronómicos todo el año.",
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

export function SubscriptionManager({ slug }: { slug: string }) {
  const [venueType, setVenueType] = useState<VenueType>("bar");
  const [activeTab, setActiveTab] = useState<"bar" | "party">("bar");
  const [currentSub, setCurrentSub] = useState<VenueSubscriptionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadSubscription = useCallback(async () => {
    setLoading(true);
    try {
      const localParty = getStoredPartyConfig(slug);
      setVenueType(localParty.venueType);
      setActiveTab(localParty.venueType);

      const [{ partyConfig }, subRes] = await Promise.all([
        fetchServerPartyConfig(slug),
        fetch(`/api/panel/subscription?slug=${encodeURIComponent(slug)}`, {
          cache: "no-store",
        }),
      ]);

      setVenueType(partyConfig.venueType);
      setActiveTab(partyConfig.venueType);

      if (subRes.ok) {
        const data = (await subRes.json()) as {
          subscription?: VenueSubscriptionState;
        };
        if (data.subscription) {
          setCurrentSub(data.subscription);
        }
      }
    } catch {
      // Non-blocking fallback
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void loadSubscription();
  }, [loadSubscription]);

  async function handleSelectPlan(plan: PlanDefinition) {
    setActivatingId(plan.id);
    setFeedback(null);
    try {
      const res = await fetch("/api/panel/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          subscription: {
            planId: plan.id,
            planName: plan.name,
            category: plan.category,
            status: "active",
            billingCycle: plan.billingCycle,
            priceArs: plan.priceArs,
            maxTvScreens: plan.maxTvScreens,
            features: plan.features,
          },
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { subscription?: VenueSubscriptionState };
        if (data.subscription) {
          setCurrentSub(data.subscription);
        }
        setFeedback(`✅ ¡Plan «${plan.name}» activado con éxito en tu cuenta!`);
        setTimeout(() => setFeedback(null), 4000);
      }
    } catch {
      setFeedback("No se pudo actualizar la suscripción. Reintentá en unos segundos.");
    } finally {
      setActivatingId(null);
    }
  }

  const displayedPlans = activeTab === "party" ? PARTY_PLANS : BAR_PLANS;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-th-border">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs text-th-accent mb-1">
            <span>/panel/{slug}/suscripcion</span>
            <span className="text-th-muted">/</span>
            <span className="px-2 py-0.5 rounded-full bg-th-emerald-soft text-th-emerald text-[11px] border border-th-emerald/25 font-bold">
              Suscripción Activa
            </span>
          </div>
          <h1 className="font-display text-xl sm:text-2xl font-extrabold text-th-text tracking-tight flex items-center gap-2">
            <Crown className="size-6 text-th-amber" />
            <span>Planes y Suscripciones · Bar & Modo Fiesta</span>
          </h1>
          <p className="text-xs text-th-muted mt-1">
            Administrá el plan de tu salón comercial o activá pases para fiestas, cumpleaños y eventos en vivo.
          </p>
        </div>

        {/* Category Switcher (Planes para Bar vs Planes para Fiestas) */}
        <div className="flex p-1.5 rounded-xl bg-th-recessed border border-th-border self-start gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("bar")}
            className={`px-4 py-2 rounded-lg font-mono text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === "bar"
                ? "bg-th-accent text-th-on-accent shadow-sm"
                : "text-th-secondary hover:text-th-text"
            }`}
          >
            <span>Planes para Bares</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("party")}
            className={`px-4 py-2 rounded-lg font-mono text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === "party"
                ? "bg-gradient-to-r from-fuchsia-600 to-amber-600 text-white shadow-sm"
                : "text-th-secondary hover:text-th-text"
            }`}
          >
            <span>Pases para Fiestas</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className="rounded-xl border border-th-emerald/35 bg-th-emerald-soft px-4 py-3 text-xs font-mono text-th-emerald flex items-center justify-between">
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-th-emerald hover:opacity-75 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Current Subscription Status Card */}
      {!loading && currentSub && (
        <section className="rounded-2xl border border-th-accent/35 card-panel p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-th-emerald-soft border border-th-emerald/30 font-mono text-[10px] font-bold uppercase text-th-emerald">
                ● PLAN ACTUAL ACTIVO
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-th-recessed border border-th-border font-mono text-[10px] text-th-secondary">
                Modalidad actual: {venueType === "party" ? "Fiesta" : "Bar"}
              </span>
            </div>
            <h2 className="font-display text-lg font-bold text-th-text">
              {currentSub.planName}
            </h2>
            <p className="text-xs font-mono text-th-secondary">
              Vencimiento / Renovación:{" "}
              <strong className="text-th-teal">
                {new Date(currentSub.expiresAt).toLocaleDateString("es-AR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </strong>{" "}
              · Hasta {currentSub.maxTvScreens} pantallas TV habilitadas
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="px-4 py-2.5 rounded-xl bg-th-recessed border border-th-border text-right font-mono">
              <span className="block text-[10px] text-th-muted uppercase">Abono activo</span>
              <span className="text-base font-extrabold text-th-text">
                ${currentSub.priceArs.toLocaleString("es-AR")} ARS
              </span>
            </div>
          </div>
        </section>
      )}

      {/* Plans Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {displayedPlans.map((plan) => {
          const isCurrent = currentSub?.planId === plan.id;
          const isPartyCard = plan.category === "party";

          return (
            <div
              key={plan.id}
              className={`relative rounded-2xl border p-6 flex flex-col justify-between transition-all ${
                isCurrent
                  ? isPartyCard
                    ? "bg-th-card border-fuchsia-500 shadow-lg ring-1 ring-fuchsia-500/30"
                    : "bg-th-card border-th-accent shadow-lg ring-1 ring-th-accent/30"
                  : "bg-th-card border-th-border hover:border-th-border-strong shadow-sm"
              }`}
            >
              {plan.badge && (
                <div
                  className={`absolute -top-3 right-5 px-3 py-0.5 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider shadow-sm ${
                    isPartyCard
                      ? "bg-fuchsia-600 text-white"
                      : "bg-th-accent text-th-on-accent"
                  }`}
                >
                  {plan.badge}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-th-muted font-bold">
                    {isPartyCard ? "Modo Fiesta" : "Modo Bar"}
                  </span>
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] text-th-teal bg-th-teal-soft border border-th-teal/25 px-2 py-0.5 rounded-md font-semibold">
                    <Tv className="size-3" />
                    <span>Hasta {plan.maxTvScreens} TVs</span>
                  </span>
                </div>

                <h3 className="font-display text-lg font-bold text-th-text">{plan.name}</h3>
                <p className="text-xs text-th-muted mt-1 min-h-[34px]">
                  {plan.description}
                </p>

                <div className="my-5 pb-4 border-b border-th-border">
                  <span className="font-display text-2xl sm:text-3xl font-extrabold text-th-text tabular-nums">
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
                          isPartyCard ? "text-fuchsia-500" : "text-th-emerald"
                        }`}
                      />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                type="button"
                disabled={isCurrent || activatingId === plan.id}
                onClick={() => void handleSelectPlan(plan)}
                className={`w-full py-3 rounded-xl font-mono text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
                  isCurrent
                    ? "bg-th-emerald-soft text-th-emerald border border-th-emerald/35 cursor-default"
                    : isPartyCard
                    ? "bg-gradient-to-r from-fuchsia-600 to-amber-600 hover:from-fuchsia-500 hover:to-amber-500 text-white shadow-sm active:scale-95"
                    : "bg-th-accent hover:bg-th-accent-hover text-th-on-accent shadow-sm active:scale-95"
                }`}
              >
                {isCurrent ? (
                  <>
                    <Sparkles className="size-4" />
                    <span>Plan Activo Actualmente</span>
                  </>
                ) : activatingId === plan.id ? (
                  <span>Activando Plan...</span>
                ) : (
                  <>
                    <Zap className="size-4" />
                    <span>Activar {plan.name}</span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

