"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  LayoutList,
  Loader2,
  Monitor,
  Palette,
  Plus,
  RefreshCw,
  Sliders,
  Sparkles,
  Trash2,
  Tv,
  Type,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { sendPlaybackCommand } from "@/lib/api/master-control";
import {
  confirmTvPairingCode,
  listVenuePlayerDevices,
  revokePlayerDevice,
  updateTvDeviceDisplay,
  DEFAULT_TV_DISPLAY_CONFIG,
  type PlayerDeviceItem,
  type TvDisplayConfig,
} from "@/lib/api/tv-pairing";

interface TvDevicesManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  slug: string;
  initialCode?: string | null;
}

export function TvDevicesManagerModal({
  isOpen,
  onClose,
  slug,
  initialCode,
}: TvDevicesManagerModalProps) {
  const [activeTab, setActiveTab] = useState<"pair" | "list">("list");
  const [code, setCode] = useState(initialCode || "");
  const [name, setName] = useState("TV Salón Principal");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Devices list & configs
  const [devices, setDevices] = useState<PlayerDeviceItem[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Expanded card for per-device settings
  const [expandedDeviceId, setExpandedDeviceId] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  }, []);

  const loadDevices = useCallback(async () => {
    setLoadingDevices(true);
    try {
      const data = await listVenuePlayerDevices(slug);
      setDevices(data);
      // Auto expand first device if only one
      if (data.length === 1 && !expandedDeviceId) {
        setExpandedDeviceId(data[0].id);
      }
    } catch {
      // Non-blocking fallback
    } finally {
      setLoadingDevices(false);
    }
  }, [slug, expandedDeviceId]);

  useEffect(() => {
    if (initialCode) {
      setCode(initialCode);
      setActiveTab("pair");
    }
  }, [initialCode]);

  useEffect(() => {
    if (isOpen) {
      void loadDevices();
    } else {
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen, loadDevices]);

  if (!isOpen) return null;

  async function handleConfirmPair(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await confirmTvPairingCode(slug, code.trim(), name);
      setSuccessMsg(`¡Pantalla «${res.name}» vinculada con éxito!`);
      setCode("");
      void loadDevices();
      setTimeout(() => {
        setActiveTab("list");
        setExpandedDeviceId(res.deviceId);
      }, 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al vincular pantalla");
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke(deviceId: string) {
    setRevokingId(deviceId);
    try {
      await revokePlayerDevice(deviceId);
      setDevices((prev) => prev.filter((d) => d.id !== deviceId));
      showToast("Pantalla desvinculada");
    } catch {
      showToast("Error al desvincular pantalla");
    } finally {
      setRevokingId(null);
    }
  }

  function handleCopyPlayerLink(token: string) {
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const url = `${origin}/player/${slug}?token=${token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(token);
    setTimeout(() => setCopiedId(null), 2000);
  }

  // Update specific TV or All TVs
  async function handleUpdateDisplay(
    deviceId: string | null,
    partialConfig: Partial<TvDisplayConfig>,
    targetName: string,
  ) {
    // Optimistic UI update
    setDevices((prev) =>
      prev.map((dev) => {
        if (!deviceId || dev.id === deviceId) {
          const cur = dev.displayConfig || DEFAULT_TV_DISPLAY_CONFIG;
          return {
            ...dev,
            displayConfig: { ...cur, ...partialConfig },
          };
        }
        return dev;
      }),
    );

    showToast(`⚡ Ajustes enviados a ${targetName}`);

    try {
      if (typeof partialConfig.tvMuted === "boolean") {
        await sendPlaybackCommand(slug, "set_tv_mute", { muted: partialConfig.tvMuted });
      }
      await updateTvDeviceDisplay(slug, deviceId, partialConfig);
    } catch {
      showToast("Error al sincronizar con el servidor");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in select-none">
      <div className="relative w-full max-w-2xl card-panel rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Floating Toast inside Modal */}
        {toastMsg && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-th-card/95 text-th-text font-mono text-xs font-semibold px-4 py-2 rounded-full border border-th-teal/50 shadow-xl backdrop-blur-md animate-fade-in flex items-center gap-2">
            <span>{toastMsg}</span>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-th-border bg-th-recessed">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-th-accent flex items-center justify-center text-th-on-accent shadow-sm">
              <Tv className="size-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-th-text tracking-tight flex flex-wrap items-center gap-2">
                <span>Gestor y Control de Pantallas TV</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-th-accent-soft text-th-accent border border-th-accent/30">
                  {devices.length} {devices.length === 1 ? "pantalla" : "pantallas"}
                </span>
              </h2>
              <p className="font-mono text-xs text-th-muted">
                Cambiá modos, visibilidad de listas, tema y tamaño en tiempo real desde la cabina
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="size-8 rounded-lg border border-th-border bg-th-card text-th-muted hover:text-th-text hover:bg-th-card-hover flex items-center justify-center transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="flex gap-1.5 p-1.5 bg-th-recessed border-b border-th-border">
          <button
            type="button"
            onClick={() => {
              setActiveTab("list");
              void loadDevices();
            }}
            className={`flex-1 py-2 px-3 rounded-xl font-mono text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
              activeTab === "list"
                ? "bg-th-accent text-th-on-accent shadow-sm"
                : "text-th-secondary hover:text-th-text hover:bg-th-card/70"
            }`}
          >
            <Monitor className="size-4" />
            <span>Pantallas Vinculadas ({devices.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("pair")}
            className={`flex-1 py-2 px-3 rounded-xl font-mono text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
              activeTab === "pair"
                ? "bg-th-accent text-th-on-accent shadow-sm"
                : "text-th-secondary hover:text-th-text hover:bg-th-card/70"
            }`}
          >
            <Plus className="size-4" />
            <span>Vincular Nueva TV por Código</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 flex-1 min-h-0 ui-scroll-container space-y-4">
          {activeTab === "pair" ? (
            /* Tab: Vincular por Código */
            <form onSubmit={handleConfirmPair} className="space-y-4 max-w-lg mx-auto py-2">
              <div className="p-4 rounded-2xl bg-th-recessed border border-th-border text-xs font-mono text-th-secondary space-y-1.5">
                <span className="text-th-teal font-bold flex items-center gap-1.5">
                  <Tv className="size-4" />
                  ¿Cómo vincular una Smart TV o Android TV?
                </span>
                <p>
                  Abrí la aplicación <span className="text-th-text font-bold">PonelePlay TV</span> en la tele (o ingresá a{" "}
                  <span className="text-th-accent font-bold">/player/{slug}</span> en el navegador).
                  Aparecerá un código de 6 dígitos que debés ingresar a continuación.
                </p>
              </div>

              <div>
                <label htmlFor="tv-code" className="ui-label mb-1.5">
                  Código de 6 Dígitos que muestra la TV:
                </label>
                <input
                  id="tv-code"
                  type="text"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="ej: 842195"
                  className="ui-input text-center tracking-[0.3em] !text-2xl font-extrabold !py-3 text-th-accent border-2 border-th-accent/40"
                  autoFocus
                />
              </div>

              <div>
                <label htmlFor="tv-name" className="ui-label mb-1.5">
                  Nombre para identificar esta pantalla:
                </label>
                <input
                  id="tv-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ej: TV Salón Principal, TV Barra, Proyector Pool"
                  className="ui-input"
                />
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-th-danger-soft border border-th-danger/35 text-th-danger text-xs font-mono">
                  {error}
                </div>
              )}

              {successMsg && (
                <div className="p-3 rounded-xl bg-th-emerald-soft border border-th-emerald/35 text-th-emerald text-xs font-mono flex items-center gap-2">
                  <Check className="size-4 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || code.trim().length !== 6}
                className="w-full py-3 rounded-xl bg-th-accent hover:bg-th-accent-hover font-mono text-xs font-semibold text-th-on-accent transition-all disabled:opacity-50 shadow-sm flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Monitor className="size-4" />}
                <span>Vincular Pantalla TV</span>
              </button>
            </form>
          ) : (
            /* Tab: Pantallas Vinculadas y Control Individual */
            <div className="space-y-4">
              {/* Header with Refresh */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-th-muted">
                  Control en vivo de modos, visibilidad, tema y tamaño:
                </span>
                <button
                  type="button"
                  onClick={() => void loadDevices()}
                  className="text-xs font-mono text-th-accent hover:underline font-semibold flex items-center gap-1"
                >
                  <RefreshCw className="size-3" />
                  <span>Actualizar</span>
                </button>
              </div>

              {/* Global Quick Actions Bar (Applies to ALL TVs) */}
              {devices.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-th-recessed border border-th-border space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-th-teal flex items-center gap-1.5">
                      <Sliders className="size-3.5" />
                      Control Global (Todas las Pantallas)
                    </span>
                    <span className="text-[10px] font-mono text-th-muted">
                      Envía el cambio a todas las TVs al mismo tiempo
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => void handleUpdateDisplay(null, { mode: "VIDEO" }, "todas las TVs")}
                      className="px-2.5 py-1.5 rounded-xl bg-th-card hover:bg-th-card-hover border border-th-border text-th-text font-mono text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95"
                      title="Cambiar todas las TVs a Modo Video"
                    >
                      <Tv className="size-3 text-th-teal" />
                      <span>Todas: Video</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleUpdateDisplay(null, { mode: "PLAYLIST" }, "todas las TVs")}
                      className="px-2.5 py-1.5 rounded-xl bg-th-card hover:bg-th-card-hover border border-th-border text-th-text font-mono text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95"
                      title="Cambiar todas las TVs a Modo Playlist & QR"
                    >
                      <LayoutList className="size-3 text-th-accent" />
                      <span>Todas: Playlist</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void handleUpdateDisplay(
                          null,
                          { showQueue: false, showProposals: false },
                          "todas las TVs",
                        )
                      }
                      className="px-2.5 py-1.5 rounded-xl bg-th-card hover:bg-th-card-hover border border-th-border text-th-amber font-mono text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95"
                      title="Ocultar las listas en todas las TVs (Solo video limpio)"
                    >
                      <EyeOff className="size-3" />
                      <span>Ocultar Listas</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void handleUpdateDisplay(
                          null,
                          { showQueue: true, showProposals: true },
                          "todas las TVs",
                        )
                      }
                      className="px-2.5 py-1.5 rounded-xl bg-th-card hover:bg-th-card-hover border border-th-border text-th-emerald font-mono text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95"
                      title="Mostrar las listas flotantes en todas las TVs"
                    >
                      <Eye className="size-3" />
                      <span>Mostrar Listas</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void handleUpdateDisplay(
                          null,
                          { tvMuted: true },
                          "todas las TVs (Silenciadas)",
                        )
                      }
                      className="px-2.5 py-1.5 rounded-xl bg-th-danger-soft hover:bg-th-danger border border-th-danger/30 text-th-danger hover:text-white font-mono text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95"
                      title="Silenciar el sonido de todas las TVs desde la cabina"
                    >
                      <VolumeX className="size-3" />
                      <span>Silenciar TV</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void handleUpdateDisplay(
                          null,
                          { tvMuted: false },
                          "todas las TVs (Audio Activo)",
                        )
                      }
                      className="px-2.5 py-1.5 rounded-xl bg-th-teal-soft hover:bg-th-teal border border-th-teal/30 text-th-teal hover:text-white font-mono text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95"
                      title="Activar el sonido de todas las TVs"
                    >
                      <Volume2 className="size-3" />
                      <span>Activar Audio TV</span>
                    </button>
                  </div>
                </div>
              )}

              {loadingDevices ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-th-muted font-mono text-xs">
                  <Loader2 className="size-6 animate-spin text-th-accent" />
                  <span>Cargando dispositivos...</span>
                </div>
              ) : devices.length === 0 ? (
                <div className="py-12 text-center text-xs font-mono text-th-muted space-y-2">
                  <Monitor className="size-10 mx-auto text-th-muted/70 stroke-[1.5]" />
                  <p>No hay pantallas TV vinculadas todavía.</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab("pair")}
                    className="text-th-accent hover:underline font-semibold"
                  >
                    + Vincular la primera TV del salón
                  </button>
                </div>
              ) : (
                devices.map((device) => {
                  const cfg = device.displayConfig || DEFAULT_TV_DISPLAY_CONFIG;
                  const isExpanded = expandedDeviceId === device.id;

                  return (
                    <div
                      key={device.id}
                      className={`rounded-2xl border transition-all ${
                        isExpanded
                          ? "bg-th-card border-th-accent/45 shadow-md"
                          : "bg-th-card border-th-border hover:border-th-border-strong"
                      }`}
                    >
                      {/* Device Header */}
                      <div className="p-3.5 flex items-center justify-between gap-3">
                        <div
                          onClick={() => setExpandedDeviceId(isExpanded ? null : device.id)}
                          className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                        >
                          <div className="size-10 rounded-xl bg-th-recessed border border-th-border flex items-center justify-center shrink-0">
                            <Tv className="size-5 text-th-accent" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs font-bold text-th-text truncate">
                                {device.name}
                              </h4>
                              <span
                                className={`size-2 rounded-full ${
                                  device.isOnline ? "bg-th-emerald animate-pulse" : "bg-th-muted"
                                }`}
                                title={device.isOnline ? "En línea ahora" : "Desconectado"}
                              />
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                              <span className="font-mono text-[10px] text-th-muted">
                                {device.isOnline ? "En línea" : "Desconectada"}
                              </span>
                              <span className="text-th-muted">·</span>
                              <span className="font-mono text-[10px] text-th-teal font-semibold">
                                {cfg.mode === "PLAYLIST"
                                  ? "Modo Playlist"
                                  : cfg.mode === "CLEAN"
                                  ? "Solo Video"
                                  : "Modo Video"}
                              </span>
                              <span className="text-th-muted">·</span>
                              <span className="font-mono text-[10px] text-th-accent font-semibold capitalize">
                                {cfg.theme}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Top Action Buttons */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setExpandedDeviceId(isExpanded ? null : device.id)}
                            className={`px-2.5 py-1.5 rounded-lg font-mono text-[11px] font-semibold border transition-all flex items-center gap-1 ${
                              isExpanded
                                ? "bg-th-accent border-th-accent text-th-on-accent shadow-sm"
                                : "bg-th-recessed border-th-border text-th-accent hover:bg-th-card-hover"
                            }`}
                          >
                            <Sliders className="size-3" />
                            <span>{isExpanded ? "Ocultar" : "Ajustes"}</span>
                          </button>

                          <a
                            href={`/player/${slug}?token=${device.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded-lg bg-th-recessed hover:bg-th-card-hover border border-th-border text-th-secondary hover:text-th-text transition-colors"
                            title="Abrir reproductor web en esta pantalla"
                          >
                            <ExternalLink className="size-3.5" />
                          </a>

                          <button
                            type="button"
                            onClick={() => handleCopyPlayerLink(device.id)}
                            className="p-1.5 rounded-lg bg-th-recessed hover:bg-th-card-hover border border-th-border text-th-secondary hover:text-th-text transition-colors"
                            title="Copiar enlace directo"
                          >
                            {copiedId === device.id ? (
                              <Check className="size-3.5 text-th-emerald" />
                            ) : (
                              <Copy className="size-3.5" />
                            )}
                          </button>

                          <button
                            type="button"
                            disabled={revokingId === device.id}
                            onClick={() => void handleRevoke(device.id)}
                            className="p-1.5 rounded-lg bg-th-danger-soft hover:bg-th-danger text-th-danger hover:text-white transition-colors"
                            title="Desvincular pantalla"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Expandable Per-TV Controls */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-3 border-t border-th-border space-y-3.5 animate-fade-in bg-th-recessed/70 rounded-b-2xl">
                          {/* 1. MODO DE PANTALLA */}
                          <div>
                            <span className="text-[11px] font-mono font-bold text-th-secondary mb-1.5 flex items-center gap-1.5">
                              <Tv className="size-3.5 text-th-teal" />
                              Modo de Pantalla TV:
                            </span>
                            <div className="grid grid-cols-3 gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  void handleUpdateDisplay(device.id, { mode: "VIDEO" }, device.name)
                                }
                                className={`py-2 px-2.5 rounded-xl font-mono text-xs font-semibold border transition-all flex flex-col items-center justify-center gap-0.5 ${
                                  cfg.mode === "VIDEO"
                                    ? "bg-th-accent text-th-on-accent border-th-accent shadow-sm"
                                    : "bg-th-card text-th-secondary hover:text-th-text border-th-border"
                                }`}
                              >
                                <span>Video Completo</span>
                                <span className="text-[9px] opacity-80">HD con listas flotantes</span>
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  void handleUpdateDisplay(device.id, { mode: "PLAYLIST" }, device.name)
                                }
                                className={`py-2 px-2.5 rounded-xl font-mono text-xs font-semibold border transition-all flex flex-col items-center justify-center gap-0.5 ${
                                  cfg.mode === "PLAYLIST"
                                    ? "bg-th-accent text-th-on-accent border-th-accent shadow-sm"
                                    : "bg-th-card text-th-secondary hover:text-th-text border-th-border"
                                }`}
                              >
                                <span>Playlist & QR</span>
                                <span className="text-[9px] opacity-80">Énfasis lista y pedidos</span>
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  void handleUpdateDisplay(
                                    device.id,
                                    { mode: "CLEAN", showQueue: false, showProposals: false },
                                    device.name,
                                  )
                                }
                                className={`py-2 px-2.5 rounded-xl font-mono text-xs font-semibold border transition-all flex flex-col items-center justify-center gap-0.5 ${
                                  cfg.mode === "CLEAN"
                                    ? "bg-th-accent text-th-on-accent border-th-accent shadow-sm"
                                    : "bg-th-card text-th-secondary hover:text-th-text border-th-border"
                                }`}
                              >
                                <span>Solo Video</span>
                                <span className="text-[9px] opacity-80">Limpio sin listas</span>
                              </button>
                            </div>
                          </div>

                          {/* 2. VISIBILIDAD DE LISTAS */}
                          <div>
                            <span className="text-[11px] font-mono font-bold text-th-secondary mb-1.5 flex items-center gap-1.5">
                              <Eye className="size-3.5 text-th-emerald" />
                              Visibilidad de Listas en Pantalla:
                            </span>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  void handleUpdateDisplay(
                                    device.id,
                                    { showQueue: !cfg.showQueue },
                                    device.name,
                                  )
                                }
                                className={`py-2 px-3 rounded-xl font-mono text-xs font-semibold border transition-all flex items-center justify-between ${
                                  cfg.showQueue
                                    ? "bg-th-emerald-soft border-th-emerald/45 text-th-emerald"
                                    : "bg-th-card border-th-border text-th-muted"
                                }`}
                              >
                                <span>Cola en Vivo</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-th-card border border-th-border">
                                  {cfg.showQueue ? "VISIBLE" : "OCULTA"}
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  void handleUpdateDisplay(
                                    device.id,
                                    { showProposals: !cfg.showProposals },
                                    device.name,
                                  )
                                }
                                className={`py-2 px-3 rounded-xl font-mono text-xs font-semibold border transition-all flex items-center justify-between ${
                                  cfg.showProposals
                                    ? "bg-th-amber-soft border-th-amber/45 text-th-amber"
                                    : "bg-th-card border-th-border text-th-muted"
                                }`}
                              >
                                <span>Propuestas</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-th-card border border-th-border">
                                  {cfg.showProposals ? "VISIBLE" : "OCULTA"}
                                </span>
                              </button>
                            </div>
                          </div>

                          {/* 3. TEMA / DISEÑO VISUAL */}
                          <div>
                            <span className="text-[11px] font-mono font-bold text-th-secondary mb-1.5 flex items-center gap-1.5">
                              <Palette className="size-3.5 text-pink-500" />
                              Tema y Estilo Visual (TV):
                            </span>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  void handleUpdateDisplay(device.id, { theme: "neon" }, device.name)
                                }
                                className={`py-2 px-2 rounded-xl font-mono text-[11px] font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                                  cfg.theme === "neon"
                                    ? "bg-th-teal-soft border-th-teal text-th-teal shadow-sm"
                                    : "bg-th-card border-th-border text-th-secondary hover:text-th-text"
                                }`}
                              >
                                <span className="size-2 rounded-full bg-cyan-400" />
                                <span>Neón</span>
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  void handleUpdateDisplay(device.id, { theme: "minimal" }, device.name)
                                }
                                className={`py-2 px-2 rounded-xl font-mono text-[11px] font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                                  cfg.theme === "minimal"
                                    ? "bg-th-accent-soft border-th-accent text-th-accent shadow-sm"
                                    : "bg-th-card border-th-border text-th-secondary hover:text-th-text"
                                }`}
                              >
                                <span className="size-2 rounded-full bg-slate-400" />
                                <span>Minimal</span>
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  void handleUpdateDisplay(device.id, { theme: "gold" }, device.name)
                                }
                                className={`py-2 px-2 rounded-xl font-mono text-[11px] font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                                  cfg.theme === "gold"
                                    ? "bg-th-amber-soft border-th-amber text-th-amber shadow-sm"
                                    : "bg-th-card border-th-border text-th-secondary hover:text-th-text"
                                }`}
                              >
                                <span className="size-2 rounded-full bg-amber-400" />
                                <span>Dorado</span>
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  void handleUpdateDisplay(device.id, { theme: "emerald" }, device.name)
                                }
                                className={`py-2 px-2 rounded-xl font-mono text-[11px] font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                                  cfg.theme === "emerald"
                                    ? "bg-th-emerald-soft border-th-emerald text-th-emerald shadow-sm"
                                    : "bg-th-card border-th-border text-th-secondary hover:text-th-text"
                                }`}
                              >
                                <span className="size-2 rounded-full bg-emerald-400" />
                                <span>Esmeralda</span>
                              </button>
                            </div>
                          </div>

                          {/* 4. TAMAÑO / ESCALA DE TEXTO */}
                          <div>
                            <span className="text-[11px] font-mono font-bold text-th-secondary mb-1.5 flex items-center gap-1.5">
                              <Type className="size-3.5 text-th-accent" />
                              Tamaño de Fuentes y Elementos:
                            </span>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  void handleUpdateDisplay(device.id, { scale: "compact" }, device.name)
                                }
                                className={`py-1.5 px-2 rounded-xl font-mono text-[11px] font-semibold border transition-all flex items-center justify-center ${
                                  cfg.scale === "compact"
                                    ? "bg-th-accent text-th-on-accent border-th-accent shadow-sm"
                                    : "bg-th-card border-th-border text-th-secondary hover:text-th-text"
                                }`}
                                title="Fuentes más chicas para pantallas pequeñas o más espacio"
                              >
                                <span>Chico (85%)</span>
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  void handleUpdateDisplay(device.id, { scale: "normal" }, device.name)
                                }
                                className={`py-1.5 px-2 rounded-xl font-mono text-[11px] font-semibold border transition-all flex items-center justify-center ${
                                  cfg.scale === "normal"
                                    ? "bg-th-accent text-th-on-accent border-th-accent shadow-sm"
                                    : "bg-th-card border-th-border text-th-secondary hover:text-th-text"
                                }`}
                                title="Tamaño balanceado estándar"
                              >
                                <span>Normal (100%)</span>
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  void handleUpdateDisplay(device.id, { scale: "large" }, device.name)
                                }
                                className={`py-1.5 px-2 rounded-xl font-mono text-[11px] font-semibold border transition-all flex items-center justify-center ${
                                  cfg.scale === "large"
                                    ? "bg-th-accent text-th-on-accent border-th-accent shadow-sm"
                                    : "bg-th-card border-th-border text-th-secondary hover:text-th-text"
                                }`}
                                title="Fuentes grandes para TVs a mayor distancia"
                              >
                                <span>Grande (125%)</span>
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  void handleUpdateDisplay(device.id, { scale: "xlarge" }, device.name)
                                }
                                className={`py-1.5 px-2 rounded-xl font-mono text-[11px] font-semibold border transition-all flex items-center justify-center ${
                                  cfg.scale === "xlarge"
                                    ? "bg-th-accent text-th-on-accent border-th-accent shadow-sm"
                                    : "bg-th-card border-th-border text-th-secondary hover:text-th-text"
                                }`}
                                title="Fuentes gigantes para proyectores o pantallas muy lejanas"
                              >
                                <span>Gigante (150%)</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-th-border bg-th-recessed flex items-center justify-between">
          <span className="text-xs font-mono text-th-muted flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-th-teal" />
            <span>Los cambios se aplican al instante en la TV vía WebSocket</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-th-card hover:bg-th-card-hover text-th-secondary hover:text-th-text font-mono text-xs font-semibold border border-th-border transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
