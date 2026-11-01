"use client";

import { useEffect, useState, useCallback } from "react";
import { Check, Copy, ExternalLink, Loader2, Monitor, Plus, RefreshCw, Trash2, X } from "lucide-react";
import {
  confirmTvPairingCode,
  listVenuePlayerDevices,
  revokePlayerDevice,
  type PlayerDeviceItem,
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
  const [activeTab, setActiveTab] = useState<"pair" | "list">("pair");
  const [code, setCode] = useState(initialCode || "");
  const [name, setName] = useState("TV Salón Principal");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Devices list
  const [devices, setDevices] = useState<PlayerDeviceItem[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    setLoadingDevices(true);
    try {
      const data = await listVenuePlayerDevices(slug);
      setDevices(data);
    } catch {
      // Non-blocking fallback
    } finally {
      setLoadingDevices(false);
    }
  }, [slug]);

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
      }, 1500);
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
    } catch {
      // Handle error
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl bg-[#0e121e] border border-[#232b42] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#1E2333] bg-[#0A0E17]/90">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-gradient-to-br from-indigo-600 to-cyan-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/25">
              <Monitor className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Gestor de Pantallas TV y Dispositivos
              </h2>
              <p className="font-mono text-xs text-slate-400">
                Vinculá pantallas de TV y proyectores del salón en tiempo real
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
            onClick={() => setActiveTab("pair")}
            className={`flex-1 py-2 px-3 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === "pair"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/25"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Plus className="size-4" />
            <span>Vincular TV por Código (6 Dígitos)</span>
          </button>

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
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          {activeTab === "pair" ? (
            <form onSubmit={handleConfirmPair} className="space-y-4 max-w-lg mx-auto py-2">
              <div className="p-4 rounded-2xl bg-[#141824] border border-[#232b42] text-xs font-mono text-slate-300 space-y-1">
                <span className="text-cyan-400 font-bold block">¿Cómo funciona?</span>
                <p>
                  Abrí <span className="text-white font-bold">/player/{slug}</span> en la Smart TV, Android TV o proyector del salón y hacé clic en «Vincular».
                  La TV mostrará un código de 6 dígitos que debés ingresar aquí.
                </p>
              </div>

              <div>
                <label
                  htmlFor="tv-code"
                  className="block text-xs font-mono font-bold text-slate-300 mb-1.5"
                >
                  Código de 6 Dígitos de la TV:
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
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2">
                <span className="text-xs font-mono text-slate-400">
                  Pantallas autorizadas para reproducir música del bar:
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
                devices.map((device) => (
                  <div
                    key={device.id}
                    className="p-3.5 rounded-xl bg-[#141824] border border-[#232b42] flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="size-10 rounded-lg bg-[#0a0e17] border border-[#232b42] flex items-center justify-center text-slate-300 shrink-0">
                        <Monitor className="size-5" />
                      </div>
                      <div className="min-w-0">
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
                        <p className="font-mono text-[10px] text-slate-400 mt-0.5">
                          {device.isOnline ? "En línea (Transmitiendo)" : "Última vez visto: recientemente"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={`/player/${slug}?token=${device.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 rounded-lg bg-[#202534] hover:bg-[#283248] text-slate-300 hover:text-white transition-colors"
                        title="Abrir reproductor en esta pantalla"
                      >
                        <ExternalLink className="size-4" />
                      </a>

                      <button
                        type="button"
                        onClick={() => handleCopyPlayerLink(device.id)}
                        className="p-2 rounded-lg bg-[#202534] hover:bg-[#283248] text-slate-300 hover:text-white transition-colors"
                        title="Copiar enlace con acceso directo"
                      >
                        {copiedId === device.id ? (
                          <Check className="size-4 text-emerald-400" />
                        ) : (
                          <Copy className="size-4" />
                        )}
                      </button>

                      <button
                        type="button"
                        disabled={revokingId === device.id}
                        onClick={() => void handleRevoke(device.id)}
                        className="p-2 rounded-lg bg-red-950/30 hover:bg-red-950/60 text-red-400 transition-colors"
                        title="Desvincular pantalla"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#1E2333] bg-[#0A0E17]/90 flex items-center justify-between">
          <span className="text-xs font-mono text-slate-400">
            PonelePlay Precision · Terminal de Salón
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#181b25] hover:bg-[#202534] text-slate-300 hover:text-white font-mono text-xs font-bold border border-[#232b42]"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
