"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type PanelRole, type PanelNavItem, panelNavFor } from "@/lib/domain/permissions";
import { type VenueType } from "@/lib/domain/party";
import { fetchServerPartyConfig, getStoredPartyConfig } from "@/lib/api/party-control";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "./logout-button";
import { PanelPlaybackFooter } from "./panel-playback-footer";

interface PanelShellProps {
  slug: string;
  role: PanelRole;
  children: React.ReactNode;
}

const iconMap: Record<string, string> = {
  Noche: "sports_bar",
  Fiesta: "celebration",
  Catálogo: "queue_music",
  Códigos: "receipt_long",
  Personal: "badge",
  Suscripción: "workspace_premium",
  Ajustes: "tune",
};

export function getVisiblePanelNavItems(
  venueType: VenueType,
  role: PanelRole,
  slug: string,
): PanelNavItem[] {
  const all = panelNavFor(role, slug);
  if (venueType === "party") {
    return all.filter(
      (item) => !item.href.endsWith("/codigos") && !item.href.endsWith("/personal"),
    );
  }
  return all;
}

export function PanelShell({ slug, role, children }: PanelShellProps) {
  const pathname = usePathname();
  const [venueType, setVenueType] = useState<VenueType>("bar");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("poneleplay.panel.sidebarCollapsed");
      if (saved !== null) {
        setIsSidebarCollapsed(saved === "true");
      }
      const cfg = getStoredPartyConfig(slug);
      setVenueType(cfg.venueType);
    }

    let active = true;
    void fetchServerPartyConfig(slug).then(({ partyConfig }) => {
      if (active) {
        setVenueType(partyConfig.venueType);
      }
    });

    const onPartyConfigChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ slug?: string; config?: { venueType?: VenueType } }>).detail;
      if (!detail?.slug || detail.slug === slug) {
        if (detail?.config?.venueType) {
          setVenueType(detail.config.venueType);
        }
      }
    };

    window.addEventListener("poneleplay:party-config-changed", onPartyConfigChanged);
    return () => {
      active = false;
      window.removeEventListener("poneleplay:party-config-changed", onPartyConfigChanged);
    };
  }, [slug]);

  const nav = getVisiblePanelNavItems(venueType, role, slug);
  const isParty = venueType === "party";

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("poneleplay.panel.sidebarCollapsed", String(next));
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen md:h-screen md:overflow-hidden bg-th-canvas text-th-text flex flex-col">
      {/* ==================== TOP NAVIGATION BAR ==================== */}
      <header className="bg-th-shell/95 backdrop-blur-md border-b border-th-border flex justify-between items-center w-full px-3.5 sm:px-6 h-16 sticky top-0 z-50 pt-[env(safe-area-inset-top,0px)]">
        {/* Left: Sidebar toggle & Venue identity */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={toggleSidebar}
            className="hidden md:flex size-9 rounded-xl bg-th-recessed hover:bg-th-hover border border-th-border text-th-text-2 hover:text-th-text items-center justify-center transition-colors cursor-pointer shrink-0"
            title={isSidebarCollapsed ? "Expandir menú lateral" : "Contraer menú lateral"}
            aria-label={isSidebarCollapsed ? "Expandir menú lateral" : "Contraer menú lateral"}
          >
            <span className="material-symbols-outlined text-lg">
              {isSidebarCollapsed ? "menu_open" : "menu"}
            </span>
          </button>

          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={`size-9 rounded-xl flex items-center justify-center text-white shrink-0 shadow-xs ${
                isParty ? "bg-th-accent" : "bg-th-accent"
              }`}
            >
              <span
                className="material-symbols-outlined text-[19px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {isParty ? "celebration" : "sports_bar"}
              </span>
            </span>
            <div className="flex flex-col min-w-0">
              <span className="font-display font-bold text-th-text text-sm sm:text-base tracking-tight capitalize truncate max-w-[130px] sm:max-w-[220px]">
                {slug.replace(/-/g, " ")}
              </span>
              <span className="text-th-emerald font-mono text-[10px] font-bold flex items-center gap-1 leading-none mt-0.5 whitespace-nowrap">
                <span className="size-1.5 rounded-full bg-th-emerald animate-pulse" />
                {isParty ? "Fiesta Activa" : "Sala En Vivo"}
              </span>
            </div>
          </div>

          <span
            className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border whitespace-nowrap shrink-0 ${
              isParty
                ? "bg-th-teal-soft text-th-teal border-th-teal/30"
                : "bg-th-accent-soft text-th-accent border-th-accent/25"
            }`}
          >
            {isParty ? "Modo Fiesta" : "Modo Bar"}
          </span>
        </div>

        {/* Center Status Telemetry */}
        <div className="hidden lg:flex items-center gap-4 text-xs text-th-text-2">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-th-recessed border border-th-border whitespace-nowrap">
            <span className="size-2 rounded-full bg-th-emerald pulse-dot" />
            <span className="font-medium text-th-text">
              {isParty ? "Fiesta abierta" : "Noche abierta"}
            </span>
          </div>
          <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="material-symbols-outlined text-sm text-th-teal">wifi</span>
            <span className="font-mono text-[11px]">Sync OK</span>
          </div>
          <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-th-muted">Perfil:</span>
            <span className="font-mono text-[11px] font-bold uppercase text-th-text">
              {isParty ? "FIESTA LIBRE" : role}
            </span>
          </div>
        </div>

        {/* Trailing Actions & Theme Switch */}
        <div className="flex items-center gap-2 shrink-0">
          <ThemeToggle variant="compact" />

          {!isParty && (
            <Link
              href={`/panel/${slug}/codigos?openModal=1`}
              prefetch={true}
              className="inline-flex items-center gap-1.5 h-9 bg-th-accent hover:bg-th-accent-hover text-white px-3 rounded-xl text-xs font-semibold active:scale-95 transition-all whitespace-nowrap shrink-0"
            >
              <span className="material-symbols-outlined text-base">confirmation_number</span>
              <span className="hidden sm:inline">Nuevo Ticket</span>
            </Link>
          )}

          <Link
            href={`/p/${slug}`}
            target="_blank"
            className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-medium border border-th-border bg-th-card hover:bg-th-hover text-th-text-2 hover:text-th-text transition-colors whitespace-nowrap shrink-0"
            title={isParty ? "Abrir vista de Invitado QR (Todo desbloqueado)" : "Vista de cliente QR"}
          >
            <span className="material-symbols-outlined text-sm text-th-accent">qr_code_2</span>
            <span>{isParty ? "Invitado QR ↗" : "Cliente QR ↗"}</span>
          </Link>

          <div className="md:hidden flex items-center">
            <LogoutButton isCollapsed />
          </div>
        </div>
      </header>

      {/* Main Container with Sidebar */}
      <div className="flex-1 flex flex-col md:flex-row md:overflow-hidden min-h-0">
        {/* ==================== DESKTOP SIDEBAR ==================== */}
        <aside
          className={`hidden md:flex ${
            isSidebarCollapsed ? "w-[74px]" : "w-60"
          } bg-th-shell border-r border-th-border flex-col justify-between p-3 z-40 shrink-0 transition-all duration-200`}
        >
          <div className="flex flex-col gap-3">
            {/* Sidebar Brand Header */}
            <div
              className={`px-1.5 py-2 flex items-center ${
                isSidebarCollapsed ? "justify-center" : "justify-between"
              } border-b border-th-border`}
            >
              {!isSidebarCollapsed ? (
                <div className="flex items-center gap-2.5">
                  <div className="size-8 rounded-xl bg-th-accent-soft border border-th-accent/25 shrink-0 flex items-center justify-center">
                    <span
                      className="material-symbols-outlined text-th-accent text-lg"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      play_arrow
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-display font-bold text-th-text text-sm tracking-tight leading-none">
                      Ponele<span className="text-th-accent">Play</span>
                    </span>
                    <span className="text-[10px] font-mono text-th-muted uppercase tracking-wider mt-1">
                      {isParty ? "Cabina Fiesta" : "Control Central"}
                    </span>
                  </div>
                </div>
              ) : (
                <div
                  className="size-8 rounded-xl bg-th-accent-soft border border-th-accent/25 shrink-0 flex items-center justify-center"
                  title="PonelePlay Control Central"
                >
                  <span
                    className="material-symbols-outlined text-th-accent text-lg"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    play_arrow
                  </span>
                </div>
              )}
            </div>

            {/* Navigation Links */}
            <nav className="flex flex-col gap-1">
              {nav.map((item) => {
                const isActive = pathname === item.href;
                const displayLabel = isParty && item.label === "Noche" ? "Cabina en Vivo" : item.label;
                const icon = isParty && item.label === "Noche" ? "celebration" : iconMap[item.label] || "circle";

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={true}
                    title={displayLabel}
                    className={`flex items-center ${
                      isSidebarCollapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"
                    } rounded-xl text-sm transition-colors border ${
                      isActive
                        ? "bg-th-accent-soft text-th-accent font-semibold border-th-accent/25"
                        : "text-th-text-2 hover:bg-th-recessed hover:text-th-text font-medium border-transparent"
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined text-[19px] shrink-0 ${
                        isActive ? "text-th-accent" : "text-th-muted"
                      }`}
                      style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
                    >
                      {icon}
                    </span>
                    {!isSidebarCollapsed && <span className="truncate">{displayLabel}</span>}
                  </Link>
                );
              })}
            </nav>

            {/* TV Kiosk Action */}
            <div className="pt-2 border-t border-th-border">
              <Link
                href={`/player/${slug}`}
                target="_blank"
                title="Modo Kiosco TV"
                className={`w-full flex items-center ${
                  isSidebarCollapsed ? "justify-center px-0 py-2.5" : "justify-center gap-2 px-3 py-2.5"
                } bg-th-recessed hover:bg-th-hover text-th-text-2 hover:text-th-text rounded-xl text-xs font-semibold transition-colors border border-th-border whitespace-nowrap`}
              >
                <span className="material-symbols-outlined text-base text-th-teal">tv</span>
                {!isSidebarCollapsed && <span>Modo Kiosco TV</span>}
              </Link>
            </div>
          </div>

          {/* Bottom User & Logout */}
          <div className="pt-3 border-t border-th-border flex flex-col gap-2">
            <div
              className={`flex items-center ${
                isSidebarCollapsed ? "justify-center px-0" : "gap-2.5 px-2"
              } py-1`}
              title={isParty ? "Anfitrión de la Fiesta" : role === "owner" ? "Administrador" : "Personal de Barra"}
            >
              <div className="size-8 rounded-full bg-th-accent-soft border border-th-accent/30 flex items-center justify-center text-th-accent font-bold font-mono text-xs shrink-0">
                {isParty ? "DJ" : role === "owner" ? "OP" : "ST"}
              </div>
              {!isSidebarCollapsed && (
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold text-th-text truncate">
                    {isParty ? "Anfitrión / DJ" : role === "owner" ? "Administrador" : "Personal de Barra"}
                  </span>
                  <span className="text-[10px] font-mono text-th-muted uppercase truncate">
                    {slug}
                  </span>
                </div>
              )}
            </div>

            <LogoutButton isCollapsed={isSidebarCollapsed} />
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-3.5 sm:p-6 lg:p-7 md:overflow-y-auto bg-th-canvas pb-56 md:pb-48">
          <div className="max-w-7xl mx-auto">
            {children}
            <div className="h-32 md:h-40 w-full shrink-0 pointer-events-none" aria-hidden="true" />
          </div>
        </main>
      </div>

      {/* Sticky Bottom Remote Playback Footer */}
      <PanelPlaybackFooter slug={slug} isSidebarCollapsed={isSidebarCollapsed} />

      {/* ==================== MOBILE BOTTOM NAV ==================== */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-th-shell/95 backdrop-blur-md border-t border-th-border flex items-center justify-around px-1 min-h-[64px] pb-[env(safe-area-inset-bottom,0px)] shadow-lg">
        {nav.map((item) => {
          const isActive = pathname === item.href;
          const displayLabel = isParty && item.label === "Noche" ? "Fiesta" : item.label;
          const icon = isParty && item.label === "Noche" ? "celebration" : iconMap[item.label] || "circle";

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              className={`flex flex-col items-center justify-center flex-1 py-1.5 rounded-xl transition-colors ${
                isActive ? "text-th-accent font-semibold" : "text-th-muted hover:text-th-text"
              }`}
            >
              <div
                className={`size-8 rounded-xl flex items-center justify-center transition-colors ${
                  isActive ? "bg-th-accent-soft text-th-accent" : ""
                }`}
              >
                <span
                  className="material-symbols-outlined text-xl"
                  style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
                >
                  {icon}
                </span>
              </div>
              <span className="text-[10px] font-medium tracking-tight mt-0.5">
                {displayLabel}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
