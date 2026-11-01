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
      <div className="flex items-center justify-between pb-3 border-b border-[#1E2333]">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-indigo-400 text-lg">history</span>
            Registro de Tickets Emitidos en la Noche
          </h2>
          <p className="font-mono text-xs text-slate-400">
            Histórico y estado de canje de todos los códigos expedidos.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setManualTrigger((prev) => prev + 1)}
          aria-label="Refrescar historial"
          className="size-9 rounded-lg border border-[#232b42] text-slate-400 hover:text-white hover:bg-[#181b25] flex items-center justify-center transition-colors"
        >
          <span className="material-symbols-outlined text-base">refresh</span>
        </button>
      </div>

      {loading && codes.length === 0 ? (
        <p className="text-center py-10 text-xs font-mono text-slate-500">
          Cargando tickets...
        </p>
      ) : codes.length === 0 ? (
        <div className="text-center py-10 text-slate-500 font-mono space-y-2 text-xs">
          <span className="material-symbols-outlined text-slate-600 text-3xl">receipt_long</span>
          <p>No se generaron códigos todavía en este turno.</p>
        </div>
      ) : (
        <>
          {/* Mobile Card List (sm:hidden) */}
          <div className="sm:hidden space-y-2.5">
            {codes.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-xl bg-[#141824] border border-[#232b42] flex items-center justify-between gap-3 font-mono"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-bold tracking-widest text-sm">
                      {item.code}
                    </span>
                    <span className="text-xs text-cyan-300 font-bold">
                      +{item.credits}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                    <span>{item.createdByName || "Staff"}</span>
                    <span>•</span>
                    <span>
                      {new Date(item.createdAt).toLocaleTimeString("es-AR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.2 text-[9px] font-bold uppercase ${
                        item.status === "active"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : item.status === "redeemed"
                            ? "bg-slate-800 text-slate-500"
                            : "bg-red-500/10 text-red-400"
                      }`}
                    >
                      {item.status === "active" ? "Activo" : item.status === "redeemed" ? "Canjeado" : "Vencido"}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleCopy(item.code, item.id)}
                  className="px-3 py-1.5 rounded-lg bg-[#181b25] border border-[#232b42] text-slate-300 active:text-white text-xs font-semibold shrink-0"
                >
                  {copiedId === item.id ? "¡Copiado!" : "Copiar"}
                </button>
              </div>
            ))}
          </div>

          {/* Desktop Table (hidden sm:block) */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-[#1E2333] text-slate-500 text-[10px] uppercase">
                  <th className="py-2.5 px-3">Código</th>
                  <th className="py-2.5 px-3">Créditos</th>
                  <th className="py-2.5 px-3">Estado</th>
                  <th className="py-2.5 px-3">Emisor</th>
                  <th className="py-2.5 px-3">Hora</th>
                  <th className="py-2.5 px-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2333]/50">
                {codes.map((item) => (
                  <tr key={item.id} className="hover:bg-[#181b25]/50 transition-colors">
                    <td className="py-3 px-3 font-bold text-white tracking-wider">
                      {item.code}
                    </td>
                    <td className="py-3 px-3 font-bold text-cyan-300">
                      +{item.credits}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          item.status === "active"
                            ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                            : item.status === "redeemed"
                              ? "bg-slate-800 text-slate-400 border border-slate-700"
                              : "bg-red-500/10 text-red-400 border border-red-500/20"
                        }`}
                      >
                        <span
                          className={`size-1.5 rounded-full ${
                            item.status === "active" ? "bg-emerald-400" : "bg-slate-500"
                          }`}
                        />
                        {item.status === "active"
                          ? "Activo"
                          : item.status === "redeemed"
                            ? "Canjeado"
                            : "Vencido"}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400">
                      {item.createdByName || "Staff"}
                    </td>
                    <td className="py-3 px-3 text-slate-500">
                      {new Date(item.createdAt).toLocaleTimeString("es-AR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleCopy(item.code, item.id)}
                        className="px-2.5 py-1 rounded-md bg-[#181b25] border border-[#232b42] text-slate-300 hover:text-white text-[11px] font-semibold transition-colors"
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
