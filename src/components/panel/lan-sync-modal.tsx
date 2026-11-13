"use client";

import { useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cloud,
  Copy,
  Download,
  ExternalLink,
  Radio,
  RefreshCw,
  ShieldCheck,
  Tv,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import type { SyncStatusState } from "@/lib/sync/client";
import type { SyncPreferenceMode } from "@/lib/sync/protocol";

interface LanSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  slug: string;
  syncStatus: SyncStatusState;
  onSelectMode: (mode: SyncPreferenceMode) => void;
  onProbeLan: () => Promise<boolean>;
  onReconnect: () => void;
}

export function LanSyncModal({
  isOpen,
  onClose,
  slug,
  syncStatus,
  onSelectMode,
  onProbeLan,
  onReconnect,
}: LanSyncModalProps) {
  const [probing, setProbing] = useState(false);
  const [probeMsg, setProbeMsg] = useState<string | null>(null);
  const [copiedEndpoint, setCopiedEndpoint] = useState<string | null>(null);
  const [showLanAdvanced, setShowLanAdvanced] = useState(
    syncStatus.preferenceMode === "lan" || syncStatus.transport === "lan",
  );

  if (!isOpen) return null;

  const isDirect = syncStatus.transport === "direct";
  const isLan = syncStatus.transport === "lan";
  const isCloud = syncStatus.transport === "cloud";
  const prefMode = syncStatus.preferenceMode ?? "cloud";
  const tvCount = syncStatus.presence?.tvCount ?? 0;
  const bridgeCount = syncStatus.presence?.bridgeCount ?? 0;
  const lanEndpoints = syncStatus.lanEndpoints ?? [];
  const directStats = syncStatus.directStats;
  const directPeerTotal =
    (directStats?.broadcastPeerCount ?? 0) + (directStats?.dataChannelCount ?? 0);

  const handleChooseMode = (mode: SyncPreferenceMode) => {
    setProbeMsg(null);
    onSelectMode(mode);
    if (mode === "lan") {
      setShowLanAdvanced(true);
    }
  };

  const handleProbe = async () => {
    setProbing(true);
    setProbeMsg(null);
    onSelectMode("lan");
    setShowLanAdvanced(true);
    try {
      const ok = await onProbeLan();
      if (ok) {
        setProbeMsg("¡Hub LAN detectado en esta PC! Conectando en modo < 2 ms...");
      } else {
        setProbeMsg(
          "No se detectó el Hub LAN en esta PC. Abrí Iniciar-PonelePlay-LAN.bat o usá Modo Directo / Cloud.",
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
      setTimeout(() => setCopiedEndpoint(null), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-xl rounded-2xl bg-th-card border border-th-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-th-border bg-th-shell flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`size-9 rounded-xl flex items-center justify-center border shrink-0 ${
                isDirect
                  ? "bg-th-teal-soft border-th-teal/35 text-th-teal"
                  : isLan
                    ? "bg-th-emerald-soft border-th-emerald/35 text-th-emerald"
                    : isCloud
                      ? "bg-th-accent-soft border-th-accent/35 text-th-accent"
                      : "bg-th-card border-th-border text-th-muted"
              }`}
            >
              {isDirect ? (
                <Zap className="size-4" />
              ) : isLan ? (
                <Radio className="size-4" />
              ) : isCloud ? (
                <Cloud className="size-4" />
              ) : (
                <WifiOff className="size-4" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="font-display font-bold text-base text-th-text truncate">
                Modos de Sincronización Cabina ↔ TV
              </h2>
              <p className="text-xs text-th-muted truncate">
                Elegí cómo sincronizar música y video (Cloud estable, Directo P2P o Hub LAN)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="size-8 rounded-lg flex items-center justify-center text-th-muted hover:text-th-text hover:bg-th-card-hover transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5 text-sm">
          {/* Live Transport Status Bar */}
          <div
            className={`rounded-xl p-3.5 border ${
              isDirect
                ? "bg-th-teal-soft/45 border-th-teal/35"
                : isLan
                  ? "bg-th-emerald-soft/45 border-th-emerald/35"
                  : "bg-th-recessed border-th-border"
            }`}
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`size-2.5 rounded-full shrink-0 ${
                    isDirect
                      ? "bg-th-teal animate-pulse"
                      : isLan
                        ? "bg-th-emerald animate-pulse"
                        : isCloud
                          ? "bg-th-accent animate-pulse"
                          : "bg-th-amber"
                  }`}
                />
                <span className="font-semibold text-th-text truncate">
                  {isDirect
                    ? `Modo Directo P2P ACTIVO (${syncStatus.rttMs ?? "~2"} ms)`
                    : isLan
                      ? `Hub LAN Local ACTIVO (${syncStatus.rttMs ?? "<2"} ms)`
                      : isCloud
                        ? prefMode === "direct"
                          ? "Directo P2P listo (Cloud activo como respaldo)"
                          : "Modo Cloud Estable ACTIVO"
                        : syncStatus.transport === "connecting"
                          ? "Conectando sincronización..."
                          : "Sin conexión al servidor Sync"}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {syncStatus.rttMs !== null && (
                  <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-th-card border border-th-border text-th-secondary">
                    RTT: {syncStatus.rttMs} ms
                  </span>
                )}
                <button
                  type="button"
                  onClick={onReconnect}
                  className="text-xs px-2.5 py-1 rounded-lg bg-th-card hover:bg-th-card-hover border border-th-border text-th-secondary hover:text-th-text flex items-center gap-1 cursor-pointer"
                  title="Reconectar WebSocket ahora"
                >
                  <RefreshCw className="size-3" />
                  <span>Reconectar</span>
                </button>
              </div>
            </div>

            <div className="mt-2.5 flex items-center gap-3 flex-wrap text-xs text-th-secondary">
              <span className="inline-flex items-center gap-1.5">
                <Tv className="size-3.5 text-th-muted" />
                TVs en sala:{" "}
                <strong className="text-th-text">{tvCount}</strong>
              </span>
              {prefMode === "direct" && (
                <span className="inline-flex items-center gap-1.5">
                  <Zap className="size-3.5 text-th-teal" />
                  Enlaces P2P abiertos:{" "}
                  <strong className="text-th-text">
                    {directPeerTotal}
                  </strong>
                  <span className="text-th-muted">
                    ({directStats?.broadcastPeerCount ?? 0} misma PC ·{" "}
                    {directStats?.dataChannelCount ?? 0} Wi-Fi)
                  </span>
                </span>
              )}
              {prefMode === "lan" && (
                <span className="inline-flex items-center gap-1.5">
                  <Radio className="size-3.5 text-th-emerald" />
                  Hub PC:{" "}
                  <strong className="text-th-text">
                    {isLan || bridgeCount > 0 ? "Conectado + Espejo Cloud" : "Buscando..."}
                  </strong>
                </span>
              )}
            </div>
          </div>

          {probeMsg && (
            <p className="text-xs px-3 py-2 rounded-lg bg-th-shell border border-th-border text-th-secondary">
              {probeMsg}
            </p>
          )}

          {/* Mode Option 1: Cloud Estable (Default) */}
          <div
            className={`rounded-xl p-4 border transition-all ${
              prefMode === "cloud"
                ? "bg-th-accent-soft/25 border-th-accent/50"
                : "bg-th-shell/60 border-th-border hover:border-th-border-strong"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Cloud className="size-4 text-th-accent shrink-0" />
                  <span className="font-semibold text-th-text">
                    1. Modo Cloud Estable
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-th-accent-soft text-th-accent">
                    Por defecto
                  </span>
                </div>
                <p className="text-xs text-th-secondary leading-relaxed">
                  Sincroniza mediante Cloudflare en cualquier red (Wi-Fi, celulares o Smart TV) sin conexiones locales ni bloqueos del navegador en Netlify.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleChooseMode("cloud")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-colors cursor-pointer ${
                  prefMode === "cloud"
                    ? "bg-th-accent text-white"
                    : "bg-th-card hover:bg-th-card-hover border border-th-border text-th-text"
                }`}
              >
                {prefMode === "cloud" ? "Activo" : "Elegir Cloud"}
              </button>
            </div>
          </div>

          {/* Mode Option 2: Modo Directo P2P (NEW · 1 Click · Zero Downloads) */}
          <div
            className={`rounded-xl p-4 border transition-all ${
              prefMode === "direct"
                ? "bg-th-teal-soft/35 border-th-teal/55"
                : "bg-th-shell/60 border-th-border hover:border-th-border-strong"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Zap className="size-4 text-th-teal shrink-0" />
                  <span className="font-semibold text-th-text">
                    2. Modo Directo P2P (1 clic · Sin descargas)
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-th-teal-soft text-th-teal">
                    Nuevo · Más estable
                  </span>
                </div>
                <p className="text-xs text-th-secondary leading-relaxed">
                  Envía los tiempos directo Cabina ↔ Pantalla Web (<code className="text-th-text">/tv</code> o{" "}
                  <code className="text-th-text">/player</code>) por WebRTC Wi-Fi (~2 ms) o pestañas locales (&lt;1 ms), manteniendo la Nube abierta en paralelo para que Netlify nunca se corte ni falle.
                </p>
                <div className="flex items-center gap-3 flex-wrap pt-0.5 text-[11px] text-th-muted">
                  <span className="inline-flex items-center gap-1">
                    <ShieldCheck className="size-3.5 text-th-teal" />
                    Sin firewall, sin .BAT y sin IPs manuales
                  </span>
                  <a
                    href={`/player/${encodeURIComponent(slug)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-th-teal hover:underline font-medium"
                  >
                    <ExternalLink className="size-3" />
                    <span>Abrir Pantalla Web Directa</span>
                  </a>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleChooseMode("direct")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-colors cursor-pointer ${
                  prefMode === "direct"
                    ? "bg-th-teal text-white"
                    : "bg-th-teal-soft hover:bg-th-teal text-th-teal hover:text-white border border-th-teal/35"
                }`}
              >
                {prefMode === "direct" ? "Activo" : "Activar Directo"}
              </button>
            </div>
          </div>

          {/* Mode Option 3: Hub LAN Local (.ZIP - Optional for Android TV) */}
          <div
            className={`rounded-xl border transition-all ${
              prefMode === "lan"
                ? "bg-th-emerald-soft/25 border-th-emerald/45"
                : "bg-th-shell/50 border-th-border"
            }`}
          >
            <div className="p-4 flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Radio className="size-4 text-th-emerald shrink-0" />
                  <span className="font-semibold text-th-text">
                    3. Hub LAN Local (.ZIP · Para Android TV APK)
                  </span>
                </div>
                <p className="text-xs text-th-secondary leading-relaxed">
                  Puente local opcional en Windows si usás la app de Android TV y querés latencia Wi-Fi &lt;2 ms. Con el espejo Cloud y permisos CORS Private Network corregidos ya no congela Netlify.
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleChooseMode("lan")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    prefMode === "lan"
                      ? "bg-th-emerald text-white"
                      : "bg-th-card hover:bg-th-card-hover border border-th-border text-th-text"
                  }`}
                >
                  {prefMode === "lan" ? "Activo" : "Activar LAN"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowLanAdvanced((v) => !v)}
                  className="size-8 rounded-xl bg-th-card hover:bg-th-card-hover border border-th-border flex items-center justify-center text-th-muted hover:text-th-text cursor-pointer"
                  aria-label="Mostrar herramientas del Hub LAN"
                >
                  {showLanAdvanced ? (
                    <ChevronUp className="size-4" />
                  ) : (
                    <ChevronDown className="size-4" />
                  )}
                </button>
              </div>
            </div>

            {showLanAdvanced && (
              <div className="px-4 pb-4 pt-2 border-t border-th-border/60 space-y-2.5">
                <ol className="space-y-1 text-xs text-th-secondary list-decimal list-inside">
                  <li>
                    Descargá <strong className="text-th-text">poneleplay-lan.zip</strong> y descomprimilo.
                  </li>
                  <li>
                    Ejecutá <code className="px-1.5 py-0.5 rounded bg-th-card text-th-text font-mono">Iniciar-PonelePlay-LAN.bat</code>.
                  </li>
                </ol>
                <div className="flex items-center gap-2 flex-wrap">
                  <a
                    href="/poneleplay-lan.zip"
                    download="poneleplay-lan.zip"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-th-emerald text-white text-xs font-semibold shadow-sm hover:opacity-95 transition-opacity"
                  >
                    <Download className="size-3.5" />
                    <span>Descargar Hub LAN (.ZIP)</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => void handleProbe()}
                    disabled={probing}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-th-card hover:bg-th-card-hover border border-th-border text-th-text text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`size-3.5 ${probing ? "animate-spin" : ""}`} />
                    <span>{probing ? "Buscando..." : "Detectar Hub ahora"}</span>
                  </button>
                  {isLan && (
                    <a
                      href={`http://127.0.0.1:4321/tv?origin=${encodeURIComponent(
                        typeof window !== "undefined" ? window.location.origin : "",
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-th-card hover:bg-th-card-hover border border-th-border text-th-secondary hover:text-th-text text-xs font-medium"
                    >
                      <ExternalLink className="size-3.5" />
                      <span>Portal LAN local</span>
                    </a>
                  )}
                </div>

                {lanEndpoints.length > 0 && (
                  <div className="pt-1 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-th-emerald">
                      <CheckCircle2 className="size-3.5" />
                      <span>Dirección LAN detectada automáticamente para Android TV:</span>
                    </div>
                    {lanEndpoints.map((ep) => (
                      <div
                        key={ep}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-th-card border border-th-border"
                      >
                        <code className="text-[11px] font-mono text-th-text truncate">{ep}</code>
                        <button
                          type="button"
                          onClick={() => void handleCopy(ep)}
                          className="text-[11px] px-2 py-0.5 rounded bg-th-recessed hover:bg-th-card-hover text-th-secondary flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          {copiedEndpoint === ep ? (
                            <>
                              <Check className="size-3 text-th-emerald" />
                              <span>Copiado</span>
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
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-th-border bg-th-shell flex items-center justify-between gap-2">
          <span className="text-[11px] text-th-muted">
            Tu preferencia se guarda automáticamente en este navegador
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-th-card hover:bg-th-card-hover text-th-text border border-th-border text-xs font-semibold cursor-pointer"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
