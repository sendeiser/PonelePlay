"use client";

import { useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Radio,
  RefreshCw,
  Tv,
  Wifi,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import type { SyncStatusState } from "@/lib/sync/client";

interface LanSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  slug: string;
  syncStatus: SyncStatusState;
  onProbeLan: () => Promise<boolean>;
  onReconnect: () => void;
}

export function LanSyncModal({
  isOpen,
  onClose,
  slug,
  syncStatus,
  onProbeLan,
  onReconnect,
}: LanSyncModalProps) {
  const [probing, setProbing] = useState(false);
  const [probeMsg, setProbeMsg] = useState<string | null>(null);
  const [copiedEndpoint, setCopiedEndpoint] = useState<string | null>(null);

  if (!isOpen) return null;

  const isLan = syncStatus.transport === "lan";
  const isCloud = syncStatus.transport === "cloud";
  const tvCount = syncStatus.presence?.tvCount ?? 0;
  const bridgeCount = syncStatus.presence?.bridgeCount ?? 0;
  const lanEndpoints = syncStatus.lanEndpoints ?? [];

  const handleProbe = async () => {
    setProbing(true);
    setProbeMsg(null);
    try {
      const ok = await onProbeLan();
      if (ok) {
        setProbeMsg("¡LAN Hub detectado en esta PC! Conectando en modo < 2ms...");
      } else {
        onReconnect();
        setProbeMsg(
          "No se detectó el LAN Hub ejecutándose en esta PC. Descargá el ZIP y abrí Iniciar-PonelePlay-LAN.bat.",
        );
      }
    } finally {
      setProbing(false);
    }
  };

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedEndpoint(value);
      setTimeout(() => setCopiedEndpoint(null), 2000);
    } catch {
      // Clipboard fallback ignored
    }
  };

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div
        className="fixed inset-0 bg-black/65 backdrop-blur-xs"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-xl bg-th-card border border-th-border rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-th-border bg-th-shell flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`size-10 rounded-2xl flex items-center justify-center shrink-0 border ${
                isLan
                  ? "bg-th-emerald-soft text-th-emerald border-th-emerald/30"
                  : isCloud
                    ? "bg-th-accent-soft text-th-accent border-th-accent/30"
                    : "bg-th-amber-soft text-th-amber border-th-amber/30"
              }`}
            >
              {isLan ? (
                <Zap className="size-5" />
              ) : isCloud ? (
                <Radio className="size-5" />
              ) : (
                <WifiOff className="size-5" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-display font-bold text-th-text truncate">
                Sincronización Cabina ↔ TVs
              </h3>
              <p className="text-xs text-th-text-2 truncate">
                Sala <span className="font-mono font-semibold text-th-text">{slug}</span> · Audio e
                imagen sin desfase
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-8 rounded-xl bg-th-recessed border border-th-border text-th-text-2 hover:text-th-text flex items-center justify-center cursor-pointer"
            aria-label="Cerrar panel de sincronización"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Live Transport Status */}
          <div
            className={`p-4 rounded-2xl border ${
              isLan
                ? "bg-th-emerald-soft/60 border-th-emerald/40"
                : isCloud
                  ? "bg-th-recessed border-th-border"
                  : "bg-th-amber-soft/60 border-th-amber/40"
            }`}
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span
                  className={`size-2.5 rounded-full shrink-0 ${
                    isLan
                      ? "bg-th-emerald animate-pulse"
                      : isCloud
                        ? "bg-th-accent animate-pulse"
                        : "bg-th-amber"
                  }`}
                />
                <span className="text-sm font-display font-bold text-th-text">
                  {isLan
                    ? "Modo LAN Ultra Rápido ACTIVO (< 2 ms)"
                    : isCloud
                      ? "Modo Internet Cloud Edge Activo"
                      : syncStatus.transport === "connecting"
                        ? "Conectando sincronización..."
                        : "WebSocket desconectado"}
                </span>
              </div>
              {syncStatus.rttMs !== null && (
                <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-full bg-th-card border border-th-border text-th-text tabular-nums">
                  Ping: {syncStatus.rttMs} ms
                </span>
              )}
            </div>

            <div className="mt-2.5 flex items-center gap-3 flex-wrap text-xs text-th-text-2">
              <span className="inline-flex items-center gap-1.5">
                <Tv className="size-3.5 text-th-accent" />
                <span>
                  TVs conectadas: <strong className="text-th-text">{tvCount}</strong>
                </span>
              </span>
              <span className="text-th-muted">·</span>
              <span className="inline-flex items-center gap-1.5">
                <Wifi className="size-3.5 text-th-emerald" />
                <span>
                  Hub LAN activo:{" "}
                  <strong className="text-th-text">
                    {isLan || bridgeCount > 0 ? "Sí" : "No detectado aún"}
                  </strong>
                </span>
              </span>
            </div>

            {probeMsg && (
              <p className="mt-2.5 text-xs font-medium text-th-text bg-th-card/80 border border-th-border rounded-xl px-3 py-2">
                {probeMsg}
              </p>
            )}
          </div>

          {/* Super Easy 3-step LAN Setup */}
          <div className="p-4 rounded-2xl bg-th-recessed border border-th-border space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h4 className="text-sm font-display font-bold text-th-text">
                  Activar Modo LAN en 3 clics (para 0 desfase entre audio y TV)
                </h4>
                <p className="text-xs text-th-text-2 mt-0.5">
                  Funciona directo por el Wi-Fi del local aunque Internet esté lento. Sin configurar
                  código ni IPs manualmente.
                </p>
              </div>
            </div>

            <div className="space-y-2.5 text-xs text-th-text-2">
              <div className="flex items-start gap-2.5 bg-th-card border border-th-border rounded-xl p-3">
                <span className="size-5 rounded-full bg-th-accent text-white font-mono text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  1
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-th-text">
                    Descargá e iniciá el Mini Hub en esta PC Windows
                  </p>
                  <p className="mt-0.5">
                    Descomprimí el archivo y hacé doble clic en{" "}
                    <code className="px-1.5 py-0.5 rounded bg-th-recessed text-th-accent font-mono">
                      Iniciar-PonelePlay-LAN.bat
                    </code>
                    . Abre el Firewall solo y te crea un acceso directo en el Escritorio.
                  </p>
                  <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                    <a
                      href="/poneleplay-lan.zip"
                      download="poneleplay-lan.zip"
                      className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-th-accent hover:bg-th-accent-hover text-white text-xs font-semibold transition-all active:scale-95"
                    >
                      <Download className="size-3.5" />
                      <span>Descargar LAN Hub (.ZIP)</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => void handleProbe()}
                      disabled={probing}
                      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-th-recessed hover:bg-th-card-hover text-th-text border border-th-border text-xs font-semibold transition-all cursor-pointer disabled:opacity-60"
                    >
                      <RefreshCw className={`size-3.5 ${probing ? "animate-spin" : ""}`} />
                      <span>{probing ? "Buscando..." : "Detectar Hub ahora"}</span>
                    </button>
                    {isLan && (
                      <a
                        href="http://127.0.0.1:4321"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 h-9 px-3 rounded-xl bg-th-emerald-soft text-th-emerald border border-th-emerald/30 text-xs font-semibold"
                      >
                        <ExternalLink className="size-3.5" />
                        <span>Ver estado local</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2.5 bg-th-card border border-th-border rounded-xl p-3">
                <span className="size-5 rounded-full bg-th-accent text-white font-mono text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  2
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-th-text">
                    Tus Android TV se conectan solas en el mismo Wi-Fi
                  </p>
                  <p className="mt-0.5">
                    Cuando el Hub corre en la PC, le avisa su IP local automáticamente a las TVs por
                    nube y mDNS. Si alguna TV no lo tomó sola, abrí{" "}
                    <strong className="text-th-text">Ajustes (⚙️) → Buscar Cabina automáticamente</strong>.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Auto-discovered LAN IPs */}
          {lanEndpoints.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-th-recessed border border-th-border">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-display font-bold text-th-text flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 text-th-emerald" />
                  <span>Dirección LAN anunciada automáticamente a tus TVs:</span>
                </span>
              </div>
              <div className="space-y-1.5">
                {lanEndpoints.map((ep) => (
                  <div
                    key={ep}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-th-card border border-th-border"
                  >
                    <code className="font-mono text-xs font-bold text-th-accent">{ep}</code>
                    <button
                      type="button"
                      onClick={() => void handleCopy(ep)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-th-recessed hover:bg-th-card-hover border border-th-border text-[11px] font-semibold text-th-text cursor-pointer"
                    >
                      {copiedEndpoint === ep ? (
                        <>
                          <Check className="size-3 text-th-emerald" />
                          <span>Copiada</span>
                        </>
                      ) : (
                        <>
                          <Copy className="size-3" />
                          <span>Copiar</span>
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-th-border bg-th-shell flex items-center justify-between gap-2">
          <span className="text-[11px] text-th-muted">
            También disponible en Pantallas TV
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-th-card hover:bg-th-card-hover text-th-text border border-th-border text-xs font-semibold cursor-pointer"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}

