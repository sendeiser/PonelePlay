"use client";

import { useEffect, useState } from "react";
import { Check, Copy, RotateCcw, Ticket } from "lucide-react";
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
        // Ignored or handled via empty list
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
    <div className="rounded-2xl border border-cream/10 bg-[#07211b] p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-display font-bold text-cream">
            Historial de códigos
          </h2>
          <p className="mt-1 text-xs text-cream/50">
            Códigos de consumición generados en el local.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setManualTrigger((prev) => prev + 1)}
          aria-label="Refrescar historial"
          className="grid size-9 place-items-center rounded-lg border border-cream/15 text-cream/60 hover:text-cream hover:bg-cream/5"
        >
          <RotateCcw className="size-4" />
        </button>
      </div>

      {loading && codes.length === 0 ? (
        <p className="text-center py-8 text-xs font-mono text-cream/40">
          Cargando historial...
        </p>
      ) : codes.length === 0 ? (
        <div className="text-center py-10 text-cream/40 space-y-2">
          <Ticket className="size-8 mx-auto text-cream/20" />
          <p className="text-xs">No se generaron códigos todavía.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-cream/10 text-cream/40 font-mono text-[10px] uppercase">
                <th className="py-2.5 px-3">Código</th>
                <th className="py-2.5 px-3">Votos</th>
                <th className="py-2.5 px-3">Estado</th>
                <th className="py-2.5 px-3">Emisor</th>
                <th className="py-2.5 px-3">Fecha</th>
                <th className="py-2.5 px-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream/5">
              {codes.map((item) => (
                <tr key={item.id} className="hover:bg-white/[0.02]">
                  <td className="py-3 px-3 font-mono font-bold text-cream tracking-wider">
                    {item.code}
                  </td>
                  <td className="py-3 px-3 font-semibold text-amber">
                    {item.credits}
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px] uppercase font-bold ${
                        item.status === "active"
                          ? "bg-mint/15 text-mint border border-mint/30"
                          : item.status === "redeemed"
                            ? "bg-cream/10 text-cream/60 border border-cream/10"
                            : "bg-coral/15 text-coral border border-coral/30"
                      }`}
                    >
                      {item.status === "active"
                        ? "Activo"
                        : item.status === "redeemed"
                          ? "Canjeado"
                          : "Vencido"}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-cream/60">
                    {item.createdByName}
                  </td>
                  <td className="py-3 px-3 text-cream/40">
                    {new Date(item.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="py-3 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleCopy(item.code, item.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-cream/15 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-cream/70 hover:bg-white/[0.08] hover:text-cream"
                    >
                      {copiedId === item.id ? (
                        <Check className="size-3 text-mint" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                      {copiedId === item.id ? "Copiado" : "Copiar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
