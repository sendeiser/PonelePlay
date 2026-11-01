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
        className="fixed inset-0 bg-black/75 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pair-player-title"
        className="relative w-full max-w-md rounded-2xl border border-cream/15 bg-felt-900 p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-cream/40 hover:text-cream"
          aria-label="Cerrar"
        >
          <X className="size-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-amber/15 text-amber">
            <Monitor className="size-5" />
          </div>
          <div>
            <h2
              id="pair-player-title"
              className="text-lg font-display font-bold text-cream"
            >
              Vincular Pantalla TV
            </h2>
            <p className="text-xs text-cream/50">
              Generá un enlace seguro para la pantalla del salón
            </p>
          </div>
        </div>

        {!tokenResult ? (
          <div className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="device-name"
                className="block text-xs font-medium text-cream/70"
              >
                Nombre del dispositivo
              </label>
              <input
                id="device-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ej: TV Salón, Proyector Pool"
                className="mt-1.5 w-full rounded-xl border border-cream/15 bg-white/5 px-3.5 py-2.5 text-sm text-cream placeholder:text-cream/30 focus:border-amber focus:outline-none"
              />
            </div>

            {error ? (
              <p role="alert" className="text-xs text-coral">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-cream/15 px-4 py-2 text-xs font-semibold text-cream/70 hover:bg-cream/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void handlePair()}
                className="flex items-center gap-2 rounded-xl bg-amber px-4 py-2 text-xs font-bold text-[#041611] hover:bg-amber/90 disabled:opacity-50"
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
            <div className="rounded-xl border border-mint/20 bg-mint/5 p-3.5 text-xs text-mint">
              ¡Dispositivo vinculado con éxito! Usá este link en el navegador de
              la TV para abrir el reproductor.
            </div>

            <div className="rounded-xl border border-cream/10 bg-black/40 p-3">
              <p className="font-mono text-[10px] uppercase tracking-wider text-cream/40">
                Enlace para la TV
              </p>
              <p className="mt-1 truncate font-mono text-xs text-cream">
                {playerUrl}
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center justify-center gap-2 rounded-xl bg-amber px-4 py-2.5 text-xs font-bold text-[#041611] hover:bg-amber/90"
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
                  className="rounded-xl border border-cream/15 bg-cream/5 px-3 py-2 text-center text-xs font-semibold text-cream/80 hover:bg-cream/10 disabled:opacity-50"
                >
                  {configuredThisPc ? "✓ Guardado en esta PC" : "Usar en esta PC"}
                </button>

                <a
                  href={`/player/${slug}?token=${tokenResult}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-cream/15 bg-cream/5 px-3 py-2 text-xs font-semibold text-cream/80 hover:bg-cream/10"
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

