"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type PanelRole, type PanelNavItem, panelNavFor } from "@/lib/domain/permissions";
import { type VenueType } from "@/lib/domain/party";
import { fetchServerPartyConfig, getStoredPartyConfig } from "@/lib/api/party-control";
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

    // Fetch persisted party config from server
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
    <div className="min-h-screen md:h-screen md:overflow-hidden bg-[#0f131c] text-[#dfe2ef] flex flex-col">
      {/* ==================== TOP NAVIGATION BAR ==================== */}
      <header className="bg-[#0f131c]/95 backdrop-blur-md border-b border-[#1E2333] flex justify-between items-center w-full px-3.5 sm:px-6 h-16 sticky top-0 z-50 shadow-md pt-[env(safe-area-inset-top,0px)]">
        {/* Brand Info & Sidebar Toggle */}
        <div className="flex items-center gap-3">
          {/* Desktop Toggle Button */}
          <button
            type="button"
            onClick={toggleSidebar}
            className="hidden md:flex size-8 rounded-lg bg-[#181b25] hover:bg-[#202534] border border-[#283250] text-slate-300 hover:text-white items-center justify-center transition-all active:scale-95"
            title={isSidebarCollapsed ? "Expandir menú lateral" : "Contraer menú lateral"}
            aria-label={isSidebarCollapsed ? "Expandir menú lateral" : "Contraer menú lateral"}
          >
            <span className="material-symbols-outlined text-lg">
              {isSidebarCollapsed ? "menu_open" : "menu"}
            </span>
          </button>

          <div className="flex items-center gap-2.5">
            <span
              className={`size-8 rounded-lg border flex items-center justify-center text-white shadow-md shrink-0 ${
                isParty
                  ? "bg-gradient-to-br from-pink-600 to-purple-600 border-pink-400/40"
                  : "bg-indigo-600 border-indigo-400/30"
              }`}
            >
              <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>
                {isParty ? "celebration" : "sports_bar"}
              </span>
            </span>
            <div className="flex flex-col">
              <span className="font-bold text-white text-sm sm:text-base tracking-tight capitalize truncate max-w-[130px] xs:max-w-[180px] sm:max-w-none">
                {slug.replace(/-/g, " ")}
              </span>
              <span className="text-emerald-400 font-mono text-[10px] flex items-center gap-1 leading-none mt-0.5">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {isParty ? "🎉 Fiesta Desbloqueada" : "Sala Activa"}
              </span>
            </div>
          </div>

          <div
            className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold border ${
              isParty
                ? "bg-pink-500/20 text-pink-300 border-pink-500/40"
                : "bg-[#181b25] text-indigo-300 border-[#2a3045]"
            }`}
          >
            <span>{isParty ? "🎉 Modo Fiesta" : "🍻 Modo Bar"}</span>
          </div>
        </div>

        {/* Central Telemetry (Desktop only) */}
        <div className="hidden lg:flex items-center gap-6 font-mono text-xs">
          <div className="flex items-center gap-2 text-indigo-300 font-medium">
            <span className="size-2 rounded-full bg-emerald-400 pulse-dot" />
            <span className="text-white">
              {isParty ? "Fiesta en Vivo" : "Noche Activa"}{" "}
              <span className="text-emerald-400 font-bold">(Abierta)</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-400">
            <span className="material-symbols-outlined text-sm text-cyan-400">wifi</span>
            <span>Host Conectado (18ms)</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-400">
            <span className="material-symbols-outlined text-sm text-indigo-400" style={{ fontVariationSettings: "'FILL' 1" }}>
              token
            </span>
            <span>
              Modo: <strong className="text-white uppercase">{isParty ? "FIESTA LIBRE" : role}</strong>
            </span>
          </div>
        </div>

        {/* Trailing Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {!isParty && (
            <Link
              href={`/panel/${slug}/codigos?openModal=1`}
              prefetch={true}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 sm:px-3.5 py-1.5 rounded-lg font-mono text-xs font-bold active:scale-95 transition-all shadow-md shadow-indigo-600/30"
            >
              <span className="material-symbols-outlined text-base">confirmation_number</span>
              <span className="hidden sm:inline">Nuevo Ticket</span>
            </Link>
          )}

          <Link
            href={`/p/${slug}`}
            target="_blank"
            className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-xs border transition-colors ${
              isParty
                ? "bg-gradient-to-r from-pink-600/25 to-purple-600/25 text-pink-200 border-pink-500/40 hover:text-white"
                : "bg-[#181b25] text-slate-300 hover:bg-[#202534] hover:text-white border-[#1E2333]"
            }`}
            title={isParty ? "Abrir vista de Invitado QR (Todo desbloqueado)" : "Vista de cliente QR"}
          >
            <span className="material-symbols-outlined text-sm text-indigo-400">qr_code</span>
            <span>{isParty ? "Invitado QR ↗" : "Cliente QR ↗"}</span>
          </Link>

          <div className="md:hidden flex items-center">
            <LogoutButton />
          </div>
        </div>
      </header>

      {/* Main Container with Sidebar */}
      <div className="flex-1 flex flex-col md:flex-row md:overflow-hidden min-h-0">
        {/* ==================== DESKTOP SIDE NAVIGATION BAR ==================== */}
        <aside
          className={`hidden md:flex ${
            isSidebarCollapsed ? "w-20" : "w-64"
          } bg-[#0a0e17] border-r border-[#1E2333] flex-col justify-between p-3 sm:p-4 z-40 shadow-xl shrink-0 transition-all duration-300`}
        >
          <div className="flex flex-col gap-4">
            {/* Side Header Branding */}
            <div
              className={`px-1 py-1 flex items-center ${
                isSidebarCollapsed ? "justify-center" : "justify-between"
              } border-b border-[#1E2333] pb-3`}
            >
              {!isSidebarCollapsed ? (
                <div className="flex items-center gap-2.5">
                  <div className="size-8 rounded-xl bg-indigo-600/20 border border-indigo-500/40 shadow-sm shrink-0 flex items-center justify-center">
                    <span className="material-symbols-outlined text-cyan-400 text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>
                      play_arrow
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-white text-sm tracking-tight leading-none">
                      Ponele<span className="text-cyan-400 font-bold">Play</span>
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mt-0.5">
                      {isParty ? "Cabina de Fiesta" : "Control Central"}
                    </span>
                  </div>
                </div>
              ) : (
                <div
                  className="size-8 rounded-xl bg-indigo-600/20 border border-indigo-500/40 shadow-sm shrink-0 flex items-center justify-center"
                  title="PonelePlay Control Central"
                >
                  <span className="material-symbols-outlined text-cyan-400 text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>
                    play_arrow
                  </span>
                </div>
              )}

              <button
                type="button"
                onClick={toggleSidebar}
                className={`text-slate-500 hover:text-white transition-colors ${
                  isSidebarCollapsed ? "hidden" : "block"
                }`}
                title="Contraer menú lateral"
              >
                <span className="material-symbols-outlined text-sm">tune</span>
              </button>
            </div>

            {/* Navigation Links */}
            <nav className="flex flex-col gap-1.5 mt-1">
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
                      isSidebarCollapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3.5 py-2.5"
                    } rounded-lg font-medium transition-all text-xs font-mono border ${
                      isActive
                        ? "bg-indigo-600/20 text-white font-semibold border-indigo-500/40 shadow-sm"
                        : "text-slate-400 hover:bg-[#181b25] hover:text-white border-transparent"
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined text-base ${
                        isActive ? "text-indigo-400" : "text-slate-500"
                      }`}
                      style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
                    >
                      {icon}
                    </span>
                    {!isSidebarCollapsed && <span>{displayLabel}</span>}
                  </Link>
                );
              })}
            </nav>

            {/* TV Kiosk Mode Action */}
            <div className="mt-2">
              <Link
                href={`/player/${slug}`}
                target="_blank"
                title="Modo Kiosco TV"
                className={`w-full flex items-center ${
                  isSidebarCollapsed ? "justify-center px-0 py-2.5" : "justify-center gap-2 px-3 py-2.5"
                } bg-[#131722] hover:bg-[#1a2030] text-indigo-300 hover:text-white rounded-lg font-mono text-xs transition-colors border border-indigo-500/25 shadow-sm`}
              >
                <span className="material-symbols-outlined text-base">tv</span>
                {!isSidebarCollapsed && <span>Modo Kiosco TV</span>}
              </Link>
            </div>
          </div>

          {/* Bottom Staff / Logout */}
          <div className="pt-4 border-t border-[#1E2333] flex flex-col gap-2">
            <div
              className={`flex items-center ${
                isSidebarCollapsed ? "justify-center px-0" : "gap-2.5 px-2"
              } py-1`}
              title={isParty ? "Anfitrión de la Fiesta" : role === "owner" ? "Administrador" : "Personal de Barra"}
            >
              <div className="size-8 rounded-full bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-300 font-bold font-mono text-xs shrink-0">
                {isParty ? "DJ" : role === "owner" ? "OP" : "ST"}
              </div>
              {!isSidebarCollapsed && (
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-white truncate">
                    {isParty ? "Anfitrión / DJ" : role === "owner" ? "Administrador" : "Personal de Barra"}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 uppercase">
                    {slug}
                  </span>
                </div>
              )}
            </div>

            <LogoutButton isCollapsed={isSidebarCollapsed} />
          </div>
        </aside>

        {/* Main View Area with comfortable bottom padding above fixed playback footer */}
        <main className="flex-1 p-3.5 sm:p-6 lg:p-8 md:overflow-y-auto bg-[#0a0e17]/60 pb-56 md:pb-48">
          <div className="max-w-7xl mx-auto">
            {children}
            {/* Dedicated physical bottom clearance spacer so fixed bottom playback bar NEVER covers any content or list */}
            <div className="h-32 md:h-44 w-full shrink-0 pointer-events-none" aria-hidden="true" />
          </div>
        </main>
      </div>

      {/* Sticky Bottom Master Remote Playback Control Footer */}
      <PanelPlaybackFooter slug={slug} isSidebarCollapsed={isSidebarCollapsed} />

      {/* ==================== MOBILE DEDICATED BOTTOM NAVIGATION BAR ==================== */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0c101c]/95 backdrop-blur-md border-t border-[#1E2333] flex items-center justify-around px-1 min-h-[64px] pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-10px_30px_rgba(0,0,0,0.8)]">
        {nav.map((item) => {
          const isActive = pathname === item.href;
          const displayLabel = isParty && item.label === "Noche" ? "Fiesta" : item.label;
          const icon = isParty && item.label === "Noche" ? "celebration" : iconMap[item.label] || "circle";

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all ${
                isActive
                  ? "text-indigo-400 font-bold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <div
                className={`size-8 rounded-xl flex items-center justify-center transition-all ${
                  isActive ? "bg-indigo-600/25 text-indigo-300 shadow-sm shadow-indigo-600/40" : ""
                }`}
              >
                <span
                  className="material-symbols-outlined text-xl"
                  style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
                >
                  {icon}
                </span>
              </div>
              <span className="text-[10px] font-mono tracking-tight mt-0.5">
                {displayLabel}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
