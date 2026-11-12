"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { type PanelRole } from "@/lib/domain/permissions";
import { CodeHistory } from "./code-history";
import { TicketModal } from "./ticket-modal";

interface CodesManagementProps {
  slug: string;
  role: PanelRole;
  staffToken?: string;
}

export function CodesManagement({ slug, staffToken }: CodesManagementProps) {
  const searchParams = useSearchParams();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Auto-open modal if navigated with ?openModal=1
  useEffect(() => {
    if (searchParams.get("openModal") === "1" || searchParams.get("emit") === "1") {
      setIsModalOpen(true);
    }
  }, [searchParams]);

  return (
    <div className="space-y-6 pb-36 md:pb-48">
      {/* Top Header with Emit Action Button */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-th-border">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs text-th-accent mb-1 font-semibold">
            <span className="material-symbols-outlined text-sm">confirmation_number</span>
            <span>TERMINAL DE CONSUMICIÓN · /panel/{slug}/codigos</span>
          </div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-th-text tracking-tight">
            Gestión de Tickets & Códigos
          </h1>
          <p className="text-xs text-th-muted mt-0.5">
            Emití códigos de un solo uso para consumiciones y auditá los tickets generados en la noche.
          </p>
        </div>

        {/* Primary Action Button: Opens Ticket Modal */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-th-accent hover:bg-th-accent-hover text-th-on-accent font-mono text-xs font-semibold shadow-sm active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-base">add_circle</span>
            <span>Emitir Nuevo Ticket</span>
          </button>
        </div>
      </section>

      {/* Full-width spacious History Card */}
      <div className="w-full">
        <CodeHistory
          staffToken={staffToken}
          refreshTrigger={refreshTrigger}
        />
      </div>

      {/* Dedicated Ticket Generator & Thermal Receipt Modal */}
      <TicketModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        venueName={slug}
        staffToken={staffToken}
        onCodeGenerated={() => setRefreshTrigger((prev) => prev + 1)}
      />
    </div>
  );
}
