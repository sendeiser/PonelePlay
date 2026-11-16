import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Disc3,
  Download,
  Moon,
  Sun,
  Tv,
  UserCheck,
  Radio,
  Trophy,
  DoorOpen,
  Home,
} from 'lucide-react';
import { usePartyPreview } from '../context/PartyPreviewContext';

interface AppShellHeaderProps {
  onOpenAccountModal: () => void;
}

export const AppShellHeader: React.FC<AppShellHeaderProps> = ({ onOpenAccountModal }) => {
  const { theme, toggleTheme, room, triggerPwaInstall } = usePartyPreview();
  const location = useLocation();

  const navItems = [
    { to: '/', label: 'Inicio', icon: Home, match: (p: string) => p === '/' },
    { to: `/join/${room.code}`, label: 'Entrada', icon: DoorOpen, match: (p: string) => p.startsWith('/join') },
    { to: `/room/${room.code}`, label: 'Sala', icon: Radio, match: (p: string) => /^\/room\/[^/]+$/.test(p) },
    { to: `/room/${room.code}/tv`, label: 'Modo TV', icon: Tv, match: (p: string) => p.endsWith('/tv') },
    { to: `/room/${room.code}/summary`, label: 'Resumen', icon: Trophy, match: (p: string) => p.endsWith('/summary') },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-stroke bg-card/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-6">
        <Link
          to="/"
          className="flex min-h-[44px] items-center gap-2.5 rounded-xl px-1.5 py-1 transition-opacity hover:opacity-90"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-white shadow-neon-indigo">
            <Disc3 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-display text-lg tracking-wide text-ink sm:text-xl">
                PonelePlay <span className="text-neon">V2</span>
              </span>
              <span className="hidden rounded-full border border-neon/40 bg-neon/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-neon sm:inline-block">
                PWA
              </span>
            </div>
            <p className="hidden text-[11px] text-muted sm:block">Jukebox Social Sin Premium</p>
          </div>
        </Link>

        {/* Navegación rápida de vistas */}
        <nav
          aria-label="Navegación principal"
          className="order-3 flex w-full items-center gap-1 overflow-x-auto pb-0.5 pt-1 lg:order-2 lg:w-auto lg:pb-0 lg:pt-0"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.match(location.pathname);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors sm:text-sm ${
                  active
                    ? 'bg-brand text-white shadow-neon-indigo'
                    : 'text-muted hover:bg-elevated hover:text-ink'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Controles globales */}
        <div className="order-2 flex items-center gap-1.5 lg:order-3">
          <button
            type="button"
            onClick={triggerPwaInstall}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-xl border border-stroke bg-elevated px-2.5 text-xs font-semibold text-ink transition-colors hover:border-neon/60 hover:text-neon sm:px-3"
            title="Instalar App PWA en tu dispositivo"
            aria-label="Instalar App PWA"
          >
            <Download className="h-4 w-4 shrink-0 text-neon" />
            <span className="hidden sm:inline">Instalar App</span>
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-stroke bg-elevated text-ink transition-colors hover:border-brand"
            title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4 text-amber" />
            ) : (
              <Moon className="h-4 w-4 text-brand" />
            )}
          </button>

          <button
            type="button"
            onClick={onOpenAccountModal}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-xl border border-stroke bg-elevated px-2.5 text-xs font-semibold text-ink transition-colors hover:border-brand sm:px-3"
            title="Cuenta y vinculación opcional"
            aria-label="Vincular cuenta"
          >
            <UserCheck className="h-4 w-4 shrink-0 text-brand" />
            <span className="hidden md:inline">Cuenta</span>
          </button>
        </div>
      </div>
    </header>
  );
};
