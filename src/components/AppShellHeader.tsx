import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
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
import { PonelePlayLogo } from './PonelePlayLogo';

interface AppShellHeaderProps {
  onOpenAccountModal: () => void;
}

export const AppShellHeader: React.FC<AppShellHeaderProps> = ({ onOpenAccountModal }) => {
  const { theme, toggleTheme, room, triggerPwaInstall } = usePartyPreview();
  const location = useLocation();

  const navItems = [
    { to: '/', label: 'Inicio', icon: Home, match: (p: string) => p === '/' },
    { to: `/join/${room.code}`, label: 'Unirse', icon: DoorOpen, match: (p: string) => p.startsWith('/join') },
    { to: `/room/${room.code}`, label: 'Sala', icon: Radio, match: (p: string) => /^\/room\/[^/]+$/.test(p) },
    { to: `/room/${room.code}/tv`, label: 'Modo TV', icon: Tv, match: (p: string) => p.endsWith('/tv') },
    { to: `/room/${room.code}/summary`, label: 'Resumen', icon: Trophy, match: (p: string) => p.endsWith('/summary') },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-stroke bg-canvas/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-6">
        <Link
          to="/"
          className="flex min-h-[44px] items-center rounded-xl px-1 py-1 transition-opacity hover:opacity-90"
        >
          <PonelePlayLogo size="sm" />
        </Link>

        {/* Navegación limpia de vistas */}
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
                className={`flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors sm:text-sm ${
                  active
                    ? 'bg-elevated font-semibold text-ink'
                    : 'text-muted hover:bg-card hover:text-ink'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-brand' : ''}`} />
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
            className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-xl border border-stroke bg-card px-3 text-xs font-medium text-ink transition-colors hover:bg-elevated"
            title="Instalar App PWA en tu dispositivo"
            aria-label="Instalar App PWA"
          >
            <Download className="h-4 w-4 shrink-0 text-brand" />
            <span className="hidden sm:inline">Instalar</span>
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-stroke bg-card text-ink transition-colors hover:bg-elevated"
            title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4 text-coral" />
            ) : (
              <Moon className="h-4 w-4 text-brand" />
            )}
          </button>

          <button
            type="button"
            onClick={onOpenAccountModal}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-xl border border-stroke bg-card px-3 text-xs font-medium text-ink transition-colors hover:bg-elevated"
            title="Cuenta y vinculación opcional"
            aria-label="Vincular cuenta"
          >
            <UserCheck className="h-4 w-4 shrink-0 text-muted" />
            <span className="hidden md:inline">Cuenta</span>
          </button>
        </div>
      </div>
    </header>
  );
};
