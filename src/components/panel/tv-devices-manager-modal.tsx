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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in select-none">
      <div className="relative w-full max-w-2xl bg-[#0e121e] border border-[#232b42] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Floating Toast inside Modal */}
        {toastMsg && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-[#0A0E17]/95 text-white font-mono text-xs font-bold px-4 py-2 rounded-full border border-cyan-500/50 shadow-2xl backdrop-blur-md animate-fade-in flex items-center gap-2">
            <span>{toastMsg}</span>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[#1E2333] bg-[#0A0E17]/95">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-gradient-to-br from-indigo-600 to-cyan-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/25">
              <Tv className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>Gestor y Control de Pantallas TV</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {devices.length} {devices.length === 1 ? "pantalla" : "pantallas"}
                </span>
              </h2>
              <p className="font-mono text-xs text-slate-400">
                Cambiá modos, visibilidad de listas, tema y tamaño en tiempo real desde la cabina
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="flex p-1.5 bg-[#121624] border-b border-[#1E2333]">
          <button
            type="button"
            onClick={() => {
              setActiveTab("list");
              void loadDevices();
            }}
            className={`flex-1 py-2 px-3 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === "list"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/25"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Monitor className="size-4" />
            <span>Pantallas Vinculadas ({devices.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("pair")}
            className={`flex-1 py-2 px-3 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === "pair"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/25"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Plus className="size-4" />
            <span>+ Vincular Nueva TV por Código</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 custom-scrollbar space-y-4">
          {activeTab === "pair" ? (
            /* Tab: Vincular por Código */
            <form onSubmit={handleConfirmPair} className="space-y-4 max-w-lg mx-auto py-2">
              <div className="p-4 rounded-2xl bg-[#141824] border border-[#232b42] text-xs font-mono text-slate-300 space-y-1.5">
                <span className="text-cyan-400 font-bold block flex items-center gap-1.5">
                  <Tv className="size-4" />
                  ¿Cómo vincular una Smart TV o Android TV?
                </span>
                <p>
                  Abrí la aplicación <span className="text-white font-bold">PonelePlay TV</span> en la tele (o ingresá a <span className="text-indigo-300 font-bold">/player/{slug}</span> en el navegador).
                  Aparecerá un código de 6 dígitos que debés ingresar a continuación.
                </p>
              </div>

              <div>
                <label
                  htmlFor="tv-code"
                  className="block text-xs font-mono font-bold text-slate-300 mb-1.5"
                >
                  Código de 6 Dígitos que muestra la TV:
                </label>
                <input
                  id="tv-code"
                  type="text"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="ej: 842195"
                  className="w-full text-center tracking-[0.3em] font-mono text-2xl font-extrabold py-3 bg-[#0a0e17] border-2 border-indigo-500/50 rounded-2xl text-cyan-300 placeholder:text-slate-600 focus:border-cyan-400 focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label
                  htmlFor="tv-name"
                  className="block text-xs font-mono font-bold text-slate-300 mb-1.5"
                >
                  Nombre para identificar esta pantalla:
                </label>
                <input
                  id="tv-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ej: TV Salón Principal, TV Barra, Proyector Pool"
                  className="w-full px-4 py-2.5 bg-[#0a0e17] border border-[#232b42] rounded-xl text-xs font-mono text-white placeholder:text-slate-600 focus:border-indigo-400 focus:outline-none"
                />
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-xs font-mono">
                  {error}
                </div>
              )}

              {successMsg && (
                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs font-mono flex items-center gap-2">
                  <Check className="size-4 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || code.trim().length !== 6}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 font-mono text-xs font-bold text-white transition-all disabled:opacity-50 shadow-md shadow-indigo-600/25 flex items-center justify-center gap-2"
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
                <span className="text-xs font-mono text-slate-400">
                  Control en vivo de modos, visibilidad, tema y tamaño:
                </span>
                <button
                  type="button"
                  onClick={() => void loadDevices()}
                  className="text-xs font-mono text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                >
                  <RefreshCw className="size-3" />
                  <span>Actualizar</span>
                </button>
              </div>

              {/* Global Quick Actions Bar (Applies to ALL TVs) */}
              {devices.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-[#121626] border border-indigo-500/30 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                      <Sliders className="size-3.5 text-cyan-400" />
                      Control Global (Todas las Pantallas)
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      Envía el cambio a todas las TVs al mismo tiempo
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {/* Mode Global */}
                    <button
                      type="button"
                      onClick={() => void handleUpdateDisplay(null, { mode: "VIDEO" }, "todas las TVs")}
                      className="px-2.5 py-1.5 rounded-xl bg-[#192136] hover:bg-[#202b46] border border-[#2b3756] text-white font-mono text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95"
                      title="Cambiar todas las TVs a Modo Video"
                    >
                      <Tv className="size-3 text-cyan-400" />
                      <span>Todas: Video</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleUpdateDisplay(null, { mode: "PLAYLIST" }, "todas las TVs")}
                      className="px-2.5 py-1.5 rounded-xl bg-[#192136] hover:bg-[#202b46] border border-[#2b3756] text-white font-mono text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95"
                      title="Cambiar todas las TVs a Modo Playlist & QR"
                    >
                      <LayoutList className="size-3 text-indigo-400" />
                      <span>Todas: Playlist</span>
                    </button>

                    {/* Toggle Lists Global */}
                    <button
                      type="button"
                      onClick={() =>
                        void handleUpdateDisplay(
                          null,
                          { showQueue: false, showProposals: false },
                          "todas las TVs",
                        )
                      }
                      className="px-2.5 py-1.5 rounded-xl bg-[#192136] hover:bg-[#202b46] border border-[#2b3756] text-amber-300 font-mono text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95"
                      title="Ocultar las listas en todas las TVs (Solo video limpio)"
                    >
                      <EyeOff className="size-3 text-amber-400" />
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
                      className="px-2.5 py-1.5 rounded-xl bg-[#192136] hover:bg-[#202b46] border border-[#2b3756] text-emerald-300 font-mono text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95"
                      title="Mostrar las listas flotantes en todas las TVs"
                    >
                      <Eye className="size-3 text-emerald-400" />
                      <span>Mostrar Listas</span>
                    </button>

                    {/* Mute / Unmute TV Audio Global */}
                    <button
                      type="button"
                      onClick={() =>
                        void handleUpdateDisplay(
                          null,
                          { tvMuted: true },
                          "todas las TVs (Silenciadas)",
                        )
                      }
                      className="px-2.5 py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/50 border border-rose-500/40 text-rose-200 font-mono text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95"
                      title="Silenciar el sonido de todas las TVs desde la cabina"
                    >
                      <VolumeX className="size-3 text-rose-400" />
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
                      className="px-2.5 py-1.5 rounded-xl bg-cyan-950/40 hover:bg-cyan-900/50 border border-cyan-500/40 text-cyan-200 font-mono text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95"
                      title="Activar el sonido de todas las TVs"
                    >
                      <Volume2 className="size-3 text-cyan-400" />
                      <span>Activar Audio TV</span>
                    </button>
                  </div>
                </div>
              )}

              {loadingDevices ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400 font-mono text-xs">
                  <Loader2 className="size-6 animate-spin text-indigo-400" />
                  <span>Cargando dispositivos...</span>
                </div>
              ) : devices.length === 0 ? (
                <div className="py-12 text-center text-xs font-mono text-slate-500 space-y-2">
                  <Monitor className="size-10 mx-auto text-slate-600 stroke-[1.5]" />
                  <p>No hay pantallas TV vinculadas todavía.</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab("pair")}
                    className="text-indigo-400 hover:underline"
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
                          ? "bg-[#131726] border-indigo-500/50 shadow-lg"
                          : "bg-[#141824] border-[#232b42] hover:border-[#2f3b5c]"
                      }`}
                    >
                      {/* Device Header */}
                      <div className="p-3.5 flex items-center justify-between gap-3">
                        <div
                          onClick={() => setExpandedDeviceId(isExpanded ? null : device.id)}
                          className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                        >
                          <div className="size-10 rounded-xl bg-[#0a0e17] border border-[#232b42] flex items-center justify-center text-slate-300 shrink-0">
                            <Tv className="size-5 text-indigo-400" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs font-bold text-white truncate">
                                {device.name}
                              </h4>
                              <span
                                className={`size-2 rounded-full ${
                                  device.isOnline ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
                                }`}
                                title={device.isOnline ? "En línea ahora" : "Desconectado"}
                              />
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="font-mono text-[10px] text-slate-400">
                                {device.isOnline ? "En línea" : "Desconectada"}
                              </span>
                              <span className="text-slate-600">·</span>
                              <span className="font-mono text-[10px] text-cyan-400 font-semibold">
                                {cfg.mode === "PLAYLIST"
                                  ? "Modo Playlist"
                                  : cfg.mode === "CLEAN"
                                  ? "Solo Video"
                                  : "Modo Video"}
                              </span>
                              <span className="text-slate-600">·</span>
                              <span className="font-mono text-[10px] text-indigo-300 font-semibold capitalize">
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
                            className={`px-2.5 py-1.5 rounded-lg font-mono text-[11px] font-bold border transition-all flex items-center gap-1 ${
                              isExpanded
                                ? "bg-indigo-600 border-indigo-500 text-white shadow-sm"
                                : "bg-[#181F33] border-[#283250] text-indigo-300 hover:text-white"
                            }`}
                          >
                            <Sliders className="size-3" />
                            <span>{isExpanded ? "Ocultar Controles" : "Ajustes"}</span>
                          </button>

                          <a
                            href={`/player/${slug}?token=${device.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded-lg bg-[#202534] hover:bg-[#283248] text-slate-300 hover:text-white transition-colors"
                            title="Abrir reproductor web en esta pantalla"
                          >
                            <ExternalLink className="size-3.5" />
                          </a>

                          <button
                            type="button"
                            onClick={() => handleCopyPlayerLink(device.id)}
                            className="p-1.5 rounded-lg bg-[#202534] hover:bg-[#283248] text-slate-300 hover:text-white transition-colors"
                            title="Copiar enlace directo"
                          >
                            {copiedId === device.id ? (
                              <Check className="size-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="size-3.5" />
                            )}
                          </button>

                          <button
                            type="button"
                            disabled={revokingId === device.id}
                            onClick={() => void handleRevoke(device.id)}
                            className="p-1.5 rounded-lg bg-red-950/30 hover:bg-red-950/60 text-red-400 transition-colors"
                            title="Desvincular pantalla"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Expandable Per-TV Controls */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-2 border-t border-[#1F263B] space-y-3.5 animate-fade-in bg-[#0e121e]/80">
                          {/* 1. MODO DE PANTALLA */}
                          <div>
                            <span className="block text-[11px] font-mono font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                              <Tv className="size-3.5 text-cyan-400" />
                              Modo de Pantalla TV:
                            </span>
                            <div className="grid grid-cols-3 gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  void handleUpdateDisplay(device.id, { mode: "VIDEO" }, device.name)
                                }
                                className={`py-2 px-2.5 rounded-xl font-mono text-xs font-bold border transition-all flex flex-col items-center justify-center gap-1 ${
                                  cfg.mode === "VIDEO"
                                    ? "bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-600/30"
                                    : "bg-[#181F33] text-slate-400 hover:text-white border-[#283250]"
                                }`}
                              >
                                <span>🎬 Video Completo</span>
                                <span className="text-[9px] opacity-75">HD con listas flotantes</span>
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  void handleUpdateDisplay(device.id, { mode: "PLAYLIST" }, device.name)
                                }
                                className={`py-2 px-2.5 rounded-xl font-mono text-xs font-bold border transition-all flex flex-col items-center justify-center gap-1 ${
                                  cfg.mode === "PLAYLIST"
                                    ? "bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-600/30"
                                    : "bg-[#181F33] text-slate-400 hover:text-white border-[#283250]"
                                }`}
                              >
                                <span>📑 Playlist & QR</span>
                                <span className="text-[9px] opacity-75">Énfasis lista y pedidos</span>
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
                                className={`py-2 px-2.5 rounded-xl font-mono text-xs font-bold border transition-all flex flex-col items-center justify-center gap-1 ${
                                  cfg.mode === "CLEAN"
                                    ? "bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-600/30"
                                    : "bg-[#181F33] text-slate-400 hover:text-white border-[#283250]"
                                }`}
                              >
                                <span>📺 Solo Video</span>
                                <span className="text-[9px] opacity-75">100% limpio sin listas</span>
                              </button>
                            </div>
                          </div>

                          {/* 2. VISIBILIDAD DE LISTAS */}
                          <div>
                            <span className="block text-[11px] font-mono font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                              <Eye className="size-3.5 text-emerald-400" />
                              Visibilidad de Listas en Pantalla:
                            </span>
                            <div className="grid grid-cols-2 gap-2">
                              {/* Toggle Cola Activa */}
                              <button
                                type="button"
                                onClick={() =>
                                  void handleUpdateDisplay(
                                    device.id,
                                    { showQueue: !cfg.showQueue },
                                    device.name,
                                  )
                                }
                                className={`py-2 px-3 rounded-xl font-mono text-xs font-bold border transition-all flex items-center justify-between ${
                                  cfg.showQueue
                                    ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-300"
                                    : "bg-[#181F33] border-[#283250] text-slate-500"
                                }`}
                              >
                                <span>📋 Cola en Vivo</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/40">
                                  {cfg.showQueue ? "VISIBLE" : "OCULTA"}
                                </span>
                              </button>

                              {/* Toggle Propuestas */}
                              <button
                                type="button"
                                onClick={() =>
                                  void handleUpdateDisplay(
                                    device.id,
                                    { showProposals: !cfg.showProposals },
                                    device.name,
                                  )
                                }
                                className={`py-2 px-3 rounded-xl font-mono text-xs font-bold border transition-all flex items-center justify-between ${
                                  cfg.showProposals
                                    ? "bg-amber-950/40 border-amber-500/50 text-amber-300"
                                    : "bg-[#181F33] border-[#283250] text-slate-500"
                                }`}
                              >
                                <span>🔥 Propuestas</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/40">
                                  {cfg.showProposals ? "VISIBLE" : "OCULTA"}
                                </span>
                              </button>
                            </div>
                          </div>

                          {/* 3. TEMA / DISEÑO VISUAL */}
                          <div>
                            <span className="block text-[11px] font-mono font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                              <Palette className="size-3.5 text-pink-400" />
                              Tema y Estilo Visual:
                            </span>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              {/* Neon Cyberpunk */}
                              <button
                                type="button"
                                onClick={() =>
                                  void handleUpdateDisplay(device.id, { theme: "neon" }, device.name)
                                }
                                className={`py-2 px-2 rounded-xl font-mono text-[11px] font-bold border transition-all flex items-center justify-center gap-1.5 ${
                                  cfg.theme === "neon"
                                    ? "bg-indigo-600/30 border-cyan-400 text-cyan-300 shadow-sm"
                                    : "bg-[#181F33] border-[#283250] text-slate-400 hover:text-white"
                                }`}
                              >
                                <span className="size-2 rounded-full bg-cyan-400" />
                                <span>Neón</span>
                              </button>

                              {/* Minimal Dark */}
                              <button
                                type="button"
                                onClick={() =>
                                  void handleUpdateDisplay(device.id, { theme: "minimal" }, device.name)
                                }
                                className={`py-2 px-2 rounded-xl font-mono text-[11px] font-bold border transition-all flex items-center justify-center gap-1.5 ${
                                  cfg.theme === "minimal"
                                    ? "bg-slate-700/40 border-white text-white shadow-sm"
                                    : "bg-[#181F33] border-[#283250] text-slate-400 hover:text-white"
                                }`}
                              >
                                <span className="size-2 rounded-full bg-white" />
                                <span>Minimal</span>
                              </button>

                              {/* Sunset Gold */}
                              <button
                                type="button"
                                onClick={() =>
                                  void handleUpdateDisplay(device.id, { theme: "gold" }, device.name)
                                }
                                className={`py-2 px-2 rounded-xl font-mono text-[11px] font-bold border transition-all flex items-center justify-center gap-1.5 ${
                                  cfg.theme === "gold"
                                    ? "bg-amber-600/30 border-amber-400 text-amber-300 shadow-sm"
                                    : "bg-[#181F33] border-[#283250] text-slate-400 hover:text-white"
                                }`}
                              >
                                <span className="size-2 rounded-full bg-amber-400" />
                                <span>Dorado</span>
                              </button>

                              {/* Emerald Mint */}
                              <button
                                type="button"
                                onClick={() =>
                                  void handleUpdateDisplay(device.id, { theme: "emerald" }, device.name)
                                }
                                className={`py-2 px-2 rounded-xl font-mono text-[11px] font-bold border transition-all flex items-center justify-center gap-1.5 ${
                                  cfg.theme === "emerald"
                                    ? "bg-emerald-600/30 border-emerald-400 text-emerald-300 shadow-sm"
                                    : "bg-[#181F33] border-[#283250] text-slate-400 hover:text-white"
                                }`}
                              >
                                <span className="size-2 rounded-full bg-emerald-400" />
                                <span>Esmeralda</span>
                              </button>
                            </div>
                          </div>

                          {/* 4. TAMAÑO / ESCALA DE TEXTO */}
                          <div>
                            <span className="block text-[11px] font-mono font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                              <Type className="size-3.5 text-purple-400" />
                              Tamaño de Fuentes y Elementos:
                            </span>
                            <div className="grid grid-cols-4 gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  void handleUpdateDisplay(device.id, { scale: "compact" }, device.name)
                                }
                                className={`py-1.5 px-2 rounded-xl font-mono text-[11px] font-bold border transition-all flex items-center justify-center ${
                                  cfg.scale === "compact"
                                    ? "bg-indigo-600 text-white border-indigo-400 shadow-sm"
                                    : "bg-[#181F33] border-[#283250] text-slate-400 hover:text-white"
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
                                className={`py-1.5 px-2 rounded-xl font-mono text-[11px] font-bold border transition-all flex items-center justify-center ${
                                  cfg.scale === "normal"
                                    ? "bg-indigo-600 text-white border-indigo-400 shadow-sm"
                                    : "bg-[#181F33] border-[#283250] text-slate-400 hover:text-white"
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
                                className={`py-1.5 px-2 rounded-xl font-mono text-[11px] font-bold border transition-all flex items-center justify-center ${
                                  cfg.scale === "large"
                                    ? "bg-indigo-600 text-white border-indigo-400 shadow-sm"
                                    : "bg-[#181F33] border-[#283250] text-slate-400 hover:text-white"
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
                                className={`py-1.5 px-2 rounded-xl font-mono text-[11px] font-bold border transition-all flex items-center justify-center ${
                                  cfg.scale === "xlarge"
                                    ? "bg-indigo-600 text-white border-indigo-400 shadow-sm"
                                    : "bg-[#181F33] border-[#283250] text-slate-400 hover:text-white"
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
        <div className="px-5 sm:px-6 py-3.5 border-t border-[#1E2333] bg-[#0A0E17]/95 flex items-center justify-between">
          <span className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-cyan-400" />
            <span>Los cambios se aplican al instante en la TV vía WebSocket</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#181b25] hover:bg-[#202534] text-slate-300 hover:text-white font-mono text-xs font-bold border border-[#232b42] transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
