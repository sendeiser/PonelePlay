"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type PanelRole, panelNavFor } from "@/lib/domain/permissions";
import { LogoutButton } from "./logout-button";
import { PanelPlaybackFooter } from "./panel-playback-footer";

interface PanelShellProps {
  slug: string;
  role: PanelRole;
  children: React.ReactNode;
}

const iconMap: Record<string, string> = {
  Noche: "sports_bar",
  Catálogo: "queue_music",
  Códigos: "receipt_long",
  Personal: "badge",
  Ajustes: "tune",
};

export function PanelShell({ slug, role, children }: PanelShellProps) {
  const pathname = usePathname();
  const nav = panelNavFor(role, slug);

  return (
    <div className="min-h-screen bg-[#0f131c] text-[#dfe2ef] flex flex-col">
      {/* ==================== TOP NAVIGATION BAR ==================== */}
      <header className="bg-[#0f131c] border-b border-[#1E2333] flex justify-between items-center w-full px-3.5 sm:px-6 h-16 sticky top-0 z-50 shadow-md">
        {/* Brand Info */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <span className="size-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-md shrink-0">
              <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>
                sports_bar
              </span>
            </span>
            <div className="flex flex-col">
              <span className="font-bold text-white text-sm sm:text-base tracking-tight capitalize truncate max-w-[130px] xs:max-w-[180px] sm:max-w-none">
                {slug.replace("-", " ")}
              </span>
              <span className="text-emerald-400 font-mono text-[10px] flex items-center gap-1 leading-none mt-0.5">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Sala Activa
              </span>
            </div>
          </div>

          <span className="hidden md:inline-block px-2.5 py-0.5 rounded text-xs font-mono bg-[#181b25] text-indigo-300 border border-[#2a3045]">
            Terminal #{role === "owner" ? "Admin" : "Mozo"}
          </span>
        </div>

        {/* Central Telemetry (Desktop only) */}
        <div className="hidden lg:flex items-center gap-6 font-mono text-xs">
          <div className="flex items-center gap-2 text-indigo-300 font-medium">
            <span className="size-2 rounded-full bg-emerald-400 pulse-dot" />
            <span className="text-white">
              Noche Activa <span className="text-emerald-400 font-bold">(Abierta)</span>
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
              Rol: <strong className="text-white uppercase">{role}</strong>
            </span>
          </div>
        </div>

        {/* Trailing Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href={`/panel/${slug}/codigos`}
            prefetch={true}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 sm:px-3.5 py-1.5 rounded-lg font-mono text-xs font-bold active:scale-95 transition-all shadow-md shadow-indigo-600/30"
          >
            <span className="material-symbols-outlined text-base">confirmation_number</span>
            <span className="hidden sm:inline">Nuevo Ticket</span>
          </Link>

          <Link
            href={`/player/${slug}`}
            target="_blank"
            className="flex items-center gap-1.5 bg-[#181b25] text-slate-300 hover:bg-[#202534] hover:text-white px-2.5 sm:px-3 py-1.5 rounded-lg font-mono text-xs border border-[#1E2333] transition-colors"
            title="Abrir en pantalla gigante"
          >
            <span className="material-symbols-outlined text-sm text-cyan-400">tv</span>
            <span className="hidden sm:inline">Pantalla TV ↗</span>
          </Link>

          <Link
            href={`/p/${slug}`}
            target="_blank"
            className="hidden sm:flex items-center gap-1.5 bg-[#181b25] text-slate-300 hover:bg-[#202534] hover:text-white px-3 py-1.5 rounded-lg font-mono text-xs border border-[#1E2333] transition-colors"
            title="Vista de cliente QR"
          >
            <span className="material-symbols-outlined text-sm text-indigo-400">qr_code</span>
            <span>Cliente QR ↗</span>
          </Link>

          <div className="md:hidden flex items-center">
            <LogoutButton />
          </div>
        </div>
      </header>

      {/* Main Container with Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* ==================== DESKTOP SIDE NAVIGATION BAR ==================== */}
        <aside className="hidden md:flex w-64 bg-[#0a0e17] border-r border-[#1E2333] flex-col justify-between p-4 z-40 shadow-xl shrink-0">
          <div className="flex flex-col gap-4">
            {/* Side Header Branding */}
            <div className="px-2 py-1 flex items-center justify-between border-b border-[#1E2333] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-600 to-cyan-400 p-[1.5px] shadow-sm shrink-0">
                  <div className="w-full h-full bg-[#0F172A] rounded-[10px] flex items-center justify-center">
                    <span className="material-symbols-outlined text-indigo-400 text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>
                      play_arrow
                    </span>
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="font-bold text-white text-sm tracking-tight leading-none">
                    Ponele<span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">Play</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mt-0.5">
                    Control Central
                  </span>
                </div>
              </div>
              <span className="material-symbols-outlined text-slate-500 text-sm">tune</span>
            </div>

            {/* Navigation Links */}
            <nav className="flex flex-col gap-1.5 mt-1">
              {nav.map((item) => {
                const isActive = pathname === item.href;
                const icon = iconMap[item.label] || "circle";

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={true}
                    className={`flex items-center gap-3 rounded-lg px-3.5 py-2.5 font-medium transition-all text-xs font-mono ${
                      isActive
                        ? "bg-indigo-600/15 text-indigo-300 font-semibold border-l-4 border-indigo-500 shadow-sm"
                        : "text-slate-400 hover:bg-[#181b25] hover:text-white"
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
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* TV Kiosk Mode Action */}
            <div className="mt-2">
              <Link
                href={`/player/${slug}`}
                target="_blank"
                className="w-full flex items-center justify-center gap-2 bg-[#131722] hover:bg-[#1a2030] text-indigo-300 hover:text-white px-3 py-2.5 rounded-lg font-mono text-xs transition-colors border border-indigo-500/25 shadow-sm"
              >
                <span className="material-symbols-outlined text-base">tv</span>
                <span>Modo Kiosco TV</span>
              </Link>
            </div>
          </div>

          {/* Bottom Staff / Logout */}
          <div className="pt-4 border-t border-[#1E2333] flex flex-col gap-2">
            <div className="flex items-center gap-2.5 px-2 py-1">
              <div className="size-8 rounded-full bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-300 font-bold font-mono text-xs">
                {role === "owner" ? "OP" : "ST"}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-white truncate">
                  {role === "owner" ? "Administrador" : "Personal de Barra"}
                </span>
                <span className="text-[10px] font-mono text-slate-500 uppercase">
                  {slug}
                </span>
              </div>
            </div>

            <LogoutButton />
          </div>
        </aside>

        {/* Main View Area with mobile bottom safe area */}
        <main className="flex-1 p-3.5 sm:p-6 lg:p-8 overflow-y-auto bg-[#0a0e17]/60 pb-44 md:pb-28">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>

      {/* Sticky Bottom Master Remote Playback Control Footer */}
      <PanelPlaybackFooter slug={slug} />

      {/* ==================== MOBILE DEDICATED BOTTOM NAVIGATION BAR ==================== */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0c101c] border-t border-[#1E2333] flex items-center justify-around px-1 h-16 shadow-[0_-10px_30px_rgba(0,0,0,0.8)]">
        {nav.map((item) => {
          const isActive = pathname === item.href;
          const icon = iconMap[item.label] || "circle";

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
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
