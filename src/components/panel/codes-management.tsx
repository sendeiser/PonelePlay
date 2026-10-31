"use client";

import { useState } from "react";
import { type PanelRole } from "@/lib/domain/permissions";
import { CodeGenerator } from "./code-generator";
import { CodeHistory } from "./code-history";

interface CodesManagementProps {
  slug: string;
  role: PanelRole;
  staffToken?: string;
}

export function CodesManagement({ slug, staffToken }: CodesManagementProps) {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  return (
    <div className="space-y-6">
      <div className="border-b border-cream/10 pb-5">
        <h1 className="text-2xl font-display font-bold text-cream">
          Gestión de Códigos
        </h1>
        <p className="mt-1 text-xs text-cream/50">
          Emití códigos de un solo uso para consumiciones y revisá los códigos de la noche.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <CodeGenerator
          venueName={slug}
          staffToken={staffToken}
          onCodeGenerated={() => setRefreshTrigger((prev) => prev + 1)}
        />
        <CodeHistory
          staffToken={staffToken}
          refreshTrigger={refreshTrigger}
        />
      </div>
    </div>
  );
}
