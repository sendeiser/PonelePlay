import Link from "next/link";
import { getPanelRole, panelNavFor } from "@/lib/domain/permissions";

interface PanelShellProps {
  slug: string;
  role: "owner" | "staff" | "guest";
  children: React.ReactNode;
}

export function PanelShell({ slug, role, children }: PanelShellProps) {
  const nav = panelNavFor(role as any, slug);
  return (
    <div className="min-h-screen bg-[#041611] text-cream flex">
      <aside className="w-64 border-r border-amber/10 bg-[#07211b] p-4 flex flex-col gap-2">
        <h2 className="font-display text-xl mb-4">PonelePlay</h2>
        <nav className="flex flex-col gap-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-3 py-2 rounded-lg hover:bg-amber/10 transition-colors text-cream/90 hover:text-cream"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
