"use client";

import { useEffect, useState } from "react";
import { getCodeHistory } from "@/lib/api/codes";
import type { CodeRow } from "@/lib/api/contracts";

interface CodeHistoryProps {
  staffToken?: string;
  refreshTrigger?: number;
}

export function CodeHistory({ staffToken, refreshTrigger }: CodeHistoryProps) {
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [manualTrigger, setManualTrigger] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const data = await getCodeHistory(staffToken);
        if (active) setCodes(data);
      } catch {
        // Handled via empty list
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [staffToken, refreshTrigger, manualTrigger]);

  function handleCopy(code: string, id: string) {
    void navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className="card-panel rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-th-border">
        <div>
          <h2 className="font-display text-base font-bold text-th-text tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-th-accent text-lg">history</span>
            Registro de Tickets Emitidos en la Noche
          </h2>
          <p className="font-mono text-xs text-th-muted mt-0.5">
            Histórico y estado de canje de todos los códigos expedidos.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setManualTrigger((prev) => prev + 1)}
          aria-label="Refrescar historial"
          className="size-9 rounded-lg border border-th-border bg-th-recessed text-th-muted hover:text-th-text hover:bg-th-card-hover flex items-center justify-center transition-colors"
        >
          <span className="material-symbols-outlined text-base">refresh</span>
        </button>
      </div>

      {loading && codes.length === 0 ? (
        <p className="text-center py-10 text-xs font-mono text-th-muted">
          Cargando tickets...
        </p>
      ) : codes.length === 0 ? (
        <div className="text-center py-10 text-th-muted font-mono space-y-2 text-xs">
          <span className="material-symbols-outlined text-th-muted/70 text-3xl">receipt_long</span>
          <p>No se generaron códigos todavía en este turno.</p>
        </div>
      ) : (
        <>
          {/* Mobile Card List (sm:hidden) with Bounded Internal Scroll */}
          <div className="sm:hidden max-h-[420px] min-h-0 rounded-xl bg-th-recessed border border-th-border p-2 space-y-2 ui-scroll-container">
            {codes.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-xl bg-th-card border border-th-border flex items-center justify-between gap-3 font-mono"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-th-text font-bold tracking-widest text-sm">
                      {item.code}
                    </span>
                    <span className="text-xs text-th-teal font-bold">
                      +{item.credits}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-th-muted">
                    <span>{item.createdByName || "Staff"}</span>
                    <span>•</span>
                    <span>
                      {new Date(item.createdAt).toLocaleTimeString("es-AR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                        item.status === "active"
                          ? "bg-th-emerald-soft text-th-emerald"
                          : item.status === "redeemed"
                            ? "bg-th-recessed text-th-muted"
                            : "bg-th-danger-soft text-th-danger"
                      }`}
                    >
                      {item.status === "active" ? "Activo" : item.status === "redeemed" ? "Canjeado" : "Vencido"}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleCopy(item.code, item.id)}
                  className="px-3 py-1.5 rounded-lg bg-th-recessed border border-th-border text-th-secondary hover:text-th-text text-xs font-semibold shrink-0"
                >
                  {copiedId === item.id ? "¡Copiado!" : "Copiar"}
                </button>
              </div>
            ))}
          </div>

          {/* Desktop Table (hidden sm:block) with Bounded Internal Scroll */}
          <div className="hidden sm:block max-h-[420px] min-h-0 rounded-xl border border-th-border bg-th-recessed/50 overflow-x-auto ui-scroll-container">
            <table className="w-full text-left text-xs font-mono">
              <thead className="sticky top-0 z-10 bg-th-recessed border-b border-th-border">
                <tr className="text-th-muted text-[10px] uppercase">
                  <th className="py-2.5 px-3">Código</th>
                  <th className="py-2.5 px-3">Créditos</th>
                  <th className="py-2.5 px-3">Estado</th>
                  <th className="py-2.5 px-3">Emisor</th>
                  <th className="py-2.5 px-3">Hora</th>
                  <th className="py-2.5 px-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-th-border bg-th-card">
                {codes.map((item) => (
                  <tr key={item.id} className="hover:bg-th-card-hover transition-colors">
                    <td className="py-3 px-3 font-bold text-th-text tracking-wider">
                      {item.code}
                    </td>
                    <td className="py-3 px-3 font-bold text-th-teal">
                      +{item.credits}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          item.status === "active"
                            ? "bg-th-emerald-soft border border-th-emerald/25 text-th-emerald"
                            : item.status === "redeemed"
                              ? "bg-th-recessed text-th-muted border border-th-border"
                              : "bg-th-danger-soft text-th-danger border border-th-danger/25"
                        }`}
                      >
                        <span
                          className={`size-1.5 rounded-full ${
                            item.status === "active" ? "bg-th-emerald" : "bg-th-muted"
                          }`}
                        />
                        {item.status === "active"
                          ? "Activo"
                          : item.status === "redeemed"
                            ? "Canjeado"
                            : "Vencido"}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-th-secondary">
                      {item.createdByName || "Staff"}
                    </td>
                    <td className="py-3 px-3 text-th-muted">
                      {new Date(item.createdAt).toLocaleTimeString("es-AR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleCopy(item.code, item.id)}
                        className="px-2.5 py-1 rounded-lg bg-th-recessed border border-th-border text-th-secondary hover:text-th-text hover:bg-th-card-hover text-[11px] font-semibold transition-colors"
                      >
                        {copiedId === item.id ? "¡Copiado!" : "Copiar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
