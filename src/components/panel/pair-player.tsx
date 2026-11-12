"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Monitor, RefreshCw, X } from "lucide-react";
import { pairPlayerDevice } from "@/lib/api/player";

interface PairPlayerDialogProps {
  open: boolean;
  venueId: string;
  slug: string;
  onClose: () => void;
}

export function PairPlayerDialog({
  open,
  venueId,
  slug,
  onClose,
}: PairPlayerDialogProps) {
  const [name, setName] = useState("TV Principal");
  const [loading, setLoading] = useState(false);
  const [tokenResult, setTokenResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [configuredThisPc, setConfiguredThisPc] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handlePair() {
    setLoading(true);
    setError(null);
    try {
      const res = await pairPlayerDevice(venueId, name);
      setTokenResult(res.token);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Error al vincular reproductor",
      );
    } finally {
      setLoading(false);
    }
  }

  function handleConfigureThisPc() {
    if (!tokenResult) return;
    localStorage.setItem(`poneleplay.player.${slug}`, tokenResult);
    setConfiguredThisPc(true);
  }

  const playerUrl = tokenResult
    ? `${window.location.origin}/player/${slug}?token=${tokenResult}`
    : `${window.location.origin}/player/${slug}`;

  function handleCopy() {
    navigator.clipboard.writeText(playerUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pair-player-title"
        className="relative w-full max-w-md card-panel rounded-2xl p-6"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 size-8 rounded-lg text-th-muted hover:text-th-text hover:bg-th-recessed flex items-center justify-center transition-colors cursor-pointer"
          aria-label="Cerrar"
        >
          <X className="size-4" />
        </button>

        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-th-accent-soft text-th-accent">
            <Monitor className="size-5" />
          </div>
          <div>
            <h2
              id="pair-player-title"
              className="text-lg font-display font-bold text-th-text"
            >
              Vincular Pantalla TV
            </h2>
            <p className="text-xs text-th-text-2">
              Generá un enlace seguro para la pantalla del salón
            </p>
          </div>
        </div>

        {!tokenResult ? (
          <div className="mt-5 space-y-4">
            <div>
              <label htmlFor="device-name" className="ui-label">
                Nombre del dispositivo
              </label>
              <input
                id="device-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ej: TV Salón, Proyector Pool"
                className="ui-input"
              />
            </div>

            {error ? (
              <p role="alert" className="text-xs text-th-danger font-medium">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="h-9 rounded-xl border border-th-border bg-th-recessed px-4 text-xs font-semibold text-th-text hover:bg-th-hover cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void handlePair()}
                className="h-9 flex items-center gap-2 rounded-xl bg-th-accent hover:bg-th-accent-hover px-4 text-xs font-semibold text-white disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <RefreshCw className="size-3.5 animate-spin" />
                ) : null}
                Generar acceso
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-th-emerald/25 bg-th-emerald-soft p-3.5 text-xs text-th-emerald font-medium">
              ¡Dispositivo vinculado con éxito! Usá este link en el navegador de la TV para abrir el reproductor.
            </div>

            <div className="rounded-xl border border-th-border bg-th-recessed p-3">
              <p className="font-mono text-[10px] uppercase tracking-wider text-th-muted">
                Enlace para la TV
              </p>
              <p className="mt-1 truncate font-mono text-xs text-th-text">
                {playerUrl}
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={handleCopy}
                className="h-10 flex items-center justify-center gap-2 rounded-xl bg-th-accent hover:bg-th-accent-hover px-4 text-xs font-semibold text-white cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="size-4" /> Copiado al portapapeles
                  </>
                ) : (
                  <>
                    <Copy className="size-4" /> Copiar enlace para la TV
                  </>
                )}
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleConfigureThisPc}
                  disabled={configuredThisPc}
                  className="h-9 rounded-xl border border-th-border bg-th-recessed px-3 text-center text-xs font-semibold text-th-text-2 hover:bg-th-hover hover:text-th-text disabled:opacity-50 cursor-pointer"
                >
                  {configuredThisPc ? "Guardado en esta PC" : "Usar en esta PC"}
                </button>

                <a
                  href={`/player/${slug}?token=${tokenResult}`}
                  target="_blank"
                  rel="noreferrer"
                  className="h-9 flex items-center justify-center gap-1.5 rounded-xl border border-th-border bg-th-recessed px-3 text-xs font-semibold text-th-text-2 hover:bg-th-hover hover:text-th-text"
                >
                  Abrir pantalla <ExternalLink className="size-3" />
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
