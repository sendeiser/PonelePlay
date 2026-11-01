import Link from "next/link";
import { type PanelRole, panelNavFor } from "@/lib/domain/permissions";
import { LogoutButton } from "./logout-button";

interface PanelShellProps {
  slug: string;
  role: PanelRole;
  children: React.ReactNode;
}

export function PanelShell({ slug, role, children }: PanelShellProps) {
  const nav = panelNavFor(role, slug);
  return (
    <div className="min-h-screen bg-[#041611] text-cream flex">
      <aside className="w-64 border-r border-amber/10 bg-[#07211b] p-4 flex flex-col gap-2">
        <div className="mb-4">
          <h2 className="font-display text-xl text-amber">PonelePlay</h2>
          <span className="text-xs text-cream/50 uppercase tracking-widest font-mono">
            {slug} · {role}
          </span>
        </div>
        <nav className="flex flex-col gap-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-3 py-2 rounded-lg hover:bg-amber/10 transition-colors text-cream/90 hover:text-cream text-sm font-medium"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-6 pt-4 border-t border-amber/10 flex flex-col gap-1 text-xs">
          <Link
            href={`/player/${slug}`}
            target="_blank"
            className="px-3 py-2 rounded-lg text-cream/60 hover:text-cream hover:bg-amber/5 transition-colors"
          >
            📺 Abrir Pantalla TV ↗
          </Link>
          <Link
            href={`/p/${slug}`}
            target="_blank"
            className="px-3 py-2 rounded-lg text-cream/60 hover:text-cream hover:bg-amber/5 transition-colors"
          >
            📱 Vista Cliente (QR) ↗
          </Link>
        </div>

        <LogoutButton />
      </aside>
      <main className="flex-1 p-6 overflow-y-auto">{children}</main>
    </div>
  );
}
