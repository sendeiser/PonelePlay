"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import { createBrowserSupabase } from "@/lib/api/supabase/browser";
import { fetchNightSummary, venueQrUrl, type NightSummary } from "@/lib/api/owner-ops";
import {
  type PartyConfig,
  type PartyMode,
  type VenueType,
  type DedicationStyle,
  DEDICATION_STYLES,
} from "@/lib/domain/party";
import {
  fetchServerPartyConfig,
  getStoredPartyConfig,
  normalizePartyConfigPatch,
  saveStoredPartyConfig,
  updatePartyConfig,
} from "@/lib/api/party-control";
import { PrintQrModal } from "./print-qr-modal";

interface SettingsManagerProps {
  slug: string;
}

export function SettingsManager({ slug }: SettingsManagerProps) {
  const [venueId, setVenueId] = useState<string | null>(null);
  const [venueName, setVenueName] = useState("");
  const [accentColor, setAccentColor] = useState("#8083ff");
  const [joinMessage, setJoinMessage] = useState("");

  const [explicitFilter, setExplicitFilter] = useState(true);
  const [keywords, setKeywords] = useState("gemidos, insultos, contenido inapropiado");
  const [maxDuration, setMaxDuration] = useState(480);
  const [maxProposals, setMaxProposals] = useState(3);
  const [maxQueue, setMaxQueue] = useState(30);
  const [votingRoundsEnabled, setVotingRoundsEnabled] = useState(true);
  const [votingRoundSeconds, setVotingRoundSeconds] = useState(180);
  const [partyConfig, setPartyConfig] = useState<PartyConfig>(() =>
    getStoredPartyConfig(slug),
  );

  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [summary, setSummary] = useState<NightSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [printQrOpen, setPrintQrOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientUrl =
    typeof window !== "undefined"
      ? venueQrUrl(window.location.origin, slug)
      : venueQrUrl("https://poneleplay.app", slug);

  // Generate QR for tables
  useEffect(() => {
    QRCode.toDataURL(clientUrl, {
      margin: 1,
      width: 400,
      color: { dark: "#0a0e17", light: "#ffffff" },
    }).then(setQrUrl).catch(() => {});
  }, [clientUrl]);

  // Load venue and settings via Admin API (with browser fallback)
  const loadSettings = useCallback(async () => {
    try {
      const [res, partyData] = await Promise.all([
        fetch(`/api/panel/settings?slug=${encodeURIComponent(slug)}`, {
          cache: "no-store",
        }),
        fetchServerPartyConfig(slug),
      ]);
      if (partyData?.partyConfig) {
        setPartyConfig(partyData.partyConfig);
      }
      if (res.ok) {
        const json = (await res.json()) as {
          venue?: { id: string; name: string; accent_color: string | null; join_message: string | null };
          settings?: {
            explicit_filter_enabled?: boolean;
            explicit_keywords?: string[];
            max_song_duration_seconds?: number;
            max_proposals_per_participant?: number;
            max_queue_size?: number;
            voting_rounds_enabled?: boolean;
            voting_round_seconds?: number;
          } | null;
          partyConfig?: Partial<PartyConfig>;
        };
        if (json.venue) {
          setVenueId(json.venue.id);
          setVenueName(json.venue.name);
          setAccentColor(json.venue.accent_color || "#8083ff");
          setJoinMessage(json.venue.join_message || "");
          if (json.settings) {
            setExplicitFilter(json.settings.explicit_filter_enabled ?? true);
            setKeywords(json.settings.explicit_keywords?.join(", ") || "");
            setMaxDuration(json.settings.max_song_duration_seconds || 480);
            setMaxProposals(json.settings.max_proposals_per_participant || 3);
            setMaxQueue(json.settings.max_queue_size || 30);
            setVotingRoundsEnabled(json.settings.voting_rounds_enabled ?? true);
            setVotingRoundSeconds(json.settings.voting_round_seconds ?? 180);
          }
          if (json.partyConfig) {
            const merged = normalizePartyConfigPatch(
              json.partyConfig,
              partyData?.partyConfig ?? getStoredPartyConfig(slug),
            );
            saveStoredPartyConfig(slug, merged);
            setPartyConfig(merged);
          }
          const sum = await fetchNightSummary(json.venue.id).catch(() => null);
          if (sum) setSummary(sum);
          return;
        }
      }
    } catch {
      // Fallback to browser client below
    }

    const supabase = createBrowserSupabase();
    const { data: vData } = await supabase
      .from("venues")
      .select("*")
      .eq("slug", slug)
      .single();

    if (vData) {
      const v = vData as { id: string; name: string; accent_color: string; join_message: string | null };
      setVenueId(v.id);
      setVenueName(v.name);
      setAccentColor(v.accent_color || "#8083ff");
      setJoinMessage(v.join_message || "");

      const { data: sData } = await supabase
        .from("venue_settings")
        .select("*")
        .eq("venue_id", v.id)
        .single();

      if (sData) {
        const s = sData as {
          explicit_filter_enabled: boolean;
          explicit_keywords: string[];
          max_song_duration_seconds: number;
          max_proposals_per_participant: number;
          max_queue_size: number;
          voting_rounds_enabled?: boolean;
          voting_round_seconds?: number;
          venue_type?: VenueType;
          party_mode?: PartyMode;
          party_votes_per_guest?: number;
          party_min_votes_to_queue?: number;
          allow_dedications?: boolean;
          allow_guest_karaoke?: boolean;
          turbo_cooldown_seconds?: number;
        };
        setExplicitFilter(s.explicit_filter_enabled);
        setKeywords(s.explicit_keywords?.join(", ") || "");
        setMaxDuration(s.max_song_duration_seconds || 480);
        setMaxProposals(s.max_proposals_per_participant || 3);
        setMaxQueue(s.max_queue_size || 30);
        setVotingRoundsEnabled(s.voting_rounds_enabled ?? true);
        setVotingRoundSeconds(s.voting_round_seconds ?? 180);
        if (s.venue_type) {
          setPartyConfig(
            getStoredPartyConfig(slug, {
              venueType: s.venue_type,
              partyMode: s.party_mode,
              votesPerGuest: s.party_votes_per_guest,
              minVotesToQueue: s.party_min_votes_to_queue,
              allowDedications: s.allow_dedications,
              allowGuestKaraoke: s.allow_guest_karaoke,
              turboCooldownSeconds: s.turbo_cooldown_seconds,
            }),
          );
        }
      }

      const { partyConfig: serverPartyCfg } = await fetchServerPartyConfig(slug);
      setPartyConfig(serverPartyCfg);

      const sum = await fetchNightSummary(v.id).catch(() => null);
      if (sum) setSummary(sum);
    }
  }, [slug]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const savedPartyCfg = await updatePartyConfig(slug, partyConfig);
      setPartyConfig(savedPartyCfg);
      saveStoredPartyConfig(slug, savedPartyCfg);

      const splitKeywords = keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);

      const res = await fetch("/api/panel/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          venueName,
          accentColor,
          joinMessage: joinMessage || null,
          explicitFilter,
          keywords: splitKeywords,
          maxDuration,
          maxProposals,
          maxQueue,
          votingRoundsEnabled,
          votingRoundSeconds,
          partyConfig: savedPartyCfg,
        }),
      });

      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error || "No se pudo guardar la configuración");
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al guardar configuración");
    } finally {
      setSaving(false);
    }
  }

  function handleCopy() {
    void navigator.clipboard.writeText(clientUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Top Header & Save Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-[#1E2333] gap-4">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs text-indigo-400 mb-1">
            <span>/panel/{slug}/ajustes</span>
            <span className="text-slate-600">/</span>
            <span className="px-2 py-0.5 rounded-full bg-[#181b25] text-cyan-300 text-[11px] border border-[#232b42]">
              Sincronizado
            </span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            {partyConfig.venueType === "party"
              ? "🎉 Ajustes de la Fiesta / Cumpleaños"
              : "Ajustes y Configuración del Bar"}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {partyConfig.venueType === "party"
              ? "Configurá las reglas democráticas, los Fueguitos Turbo, las dedicatorias en TV y el QR para tus invitados."
              : "Reglas de jukebox, políticas de filtrado acústico y pairing en tiempo real."}
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {saved && (
            <span className="font-mono text-xs text-emerald-400 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">check_circle</span>
              ¡Guardado!
            </span>
          )}
          <button
            type="submit"
            disabled={saving}
            className="w-full sm:w-auto justify-center px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-mono text-xs font-bold flex items-center gap-2 shadow-sm active:scale-95 transition-all disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-base">save</span>
            <span>{saving ? "Guardando..." : "Guardar Configuración"}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/60 p-3 text-xs text-red-200 flex items-center gap-2 font-mono">
          <span className="material-symbols-outlined text-base text-red-400">error</span>
          <span>{error}</span>
        </div>
      )}

      {/* CONFIGURACIÓN DE MODO FIESTA / MODALIDAD DE SALA */}
      <section className="bg-gradient-to-r from-[#181b25] via-[#1c162c] to-[#181b25] rounded-2xl border border-pink-500/30 p-5 shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-pink-400 font-bold">
              <span>✨ Modalidad del Sistema</span>
            </span>
            <h2 className="text-base font-bold text-white mt-0.5">
              {partyConfig.venueType === "party"
                ? "🎉 Modo Fiesta / Joda / Cumpleaños (Todo Desbloqueado)"
                : "🍻 Modo Bar Comercial (Tickets & Mozos)"}
            </h2>
            <p className="text-xs text-slate-400">
              {partyConfig.venueType === "party"
                ? "Tu cabina está configurada en Modo Fiesta: sin códigos de canje, con pedidos libres, dedicatorias en TV y juegos."
                : "Configuración activa para Bares con expedición de códigos de crédito por consumo y rondas automáticas."}
            </p>
          </div>
          {partyConfig.venueType === "party" ? (
            <div className="px-3.5 py-2 rounded-xl font-mono text-xs font-bold bg-gradient-to-r from-pink-600/30 to-purple-600/30 text-pink-200 border border-pink-500/50 shadow-md shrink-0">
              🎉 Modo Fiesta Activo
            </div>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              <span className="px-3.5 py-2 rounded-xl font-mono text-xs font-bold bg-indigo-600 text-white border border-indigo-400 shadow-md">
                🍻 Modo Bar Activo
              </span>
            </div>
          )}
        </div>

        {partyConfig.venueType === "party" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-pink-500/20">
            <div className="bg-[#0d111a]/90 p-3.5 rounded-xl border border-[#232b42]">
              <label className="block text-[11px] font-mono text-pink-300 font-bold uppercase mb-1.5">
                Límite de votos por persona (Modo Democrático)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={partyConfig.votesPerGuest}
                  onChange={(e) =>
                    setPartyConfig((prev) => ({
                      ...prev,
                      votesPerGuest: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                  className="w-24 rounded-lg bg-[#141824] border border-[#232b42] px-3 py-1.5 text-white font-mono text-xs"
                />
                <span className="text-[11px] text-slate-400 font-mono">
                  {partyConfig.votesPerGuest === 0
                    ? "Ilimitado (Todo libre)"
                    : `${partyConfig.votesPerGuest} votos por invitado`}
                </span>
              </div>
            </div>

            <div className="bg-[#0d111a]/90 p-3.5 rounded-xl border border-[#232b42] space-y-2.5">
              <label className="block text-[11px] font-mono text-cyan-300 font-bold uppercase">
                Votos para que la canción suba a la cola
              </label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: "1 (Directo)", val: 1 },
                  { label: "2 votos", val: 2 },
                  { label: "3 votos", val: 3 },
                  { label: "5 votos", val: 5 },
                  { label: "8 votos", val: 8 },
                ].map((preset) => (
                  <button
                    key={preset.val}
                    type="button"
                    onClick={() =>
                      setPartyConfig((prev) => ({
                        ...prev,
                        minVotesToQueue: preset.val,
                      }))
                    }
                    className={`px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold border transition-all ${
                      partyConfig.minVotesToQueue === preset.val
                        ? "bg-cyan-500/25 border-cyan-400 text-cyan-200 shadow-sm"
                        : "bg-[#141824] border-[#232b42] text-slate-400 hover:text-white"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={partyConfig.minVotesToQueue}
                  onChange={(e) =>
                    setPartyConfig((prev) => ({
                      ...prev,
                      minVotesToQueue: Math.max(1, Number(e.target.value) || 1),
                    }))
                  }
                  className="w-24 rounded-lg bg-[#141824] border border-[#232b42] px-3 py-1.5 text-white font-mono text-xs"
                />
                <span className="text-[11px] text-slate-400 font-mono">
                  {partyConfig.minVotesToQueue <= 1
                    ? "Pasa directo a la cola (1 voto)"
                    : `Entra en Pre-Cola y sube con ${partyConfig.minVotesToQueue} votos`}
                </span>
              </div>
            </div>

            <div className="bg-[#0d111a]/90 p-4 rounded-xl border border-[#232b42] flex flex-col gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={partyConfig.allowDedications}
                  onChange={(e) =>
                    setPartyConfig((prev) => ({
                      ...prev,
                      allowDedications: e.target.checked,
                    }))
                  }
                  className="accent-pink-500"
                />
                <span className="font-bold">💬 Permitir Dedicatorias en TV</span>
              </label>

              {partyConfig.allowDedications && (
                <div className="pt-2 border-t border-[#1d2538] space-y-3">
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 font-semibold mb-1">
                      Veces que pasa por pantalla:
                    </label>
                    <select
                      value={partyConfig.dedicationRepeats ?? 2}
                      onChange={(e) =>
                        setPartyConfig((prev) => ({
                          ...prev,
                          dedicationRepeats: Number(e.target.value),
                        }))
                      }
                      className="w-full bg-[#141824] border border-[#232b42] rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-pink-500"
                    >
                      <option value={1}>1 vez (Pasa 1 vez y se oculta para no tapar el video)</option>
                      <option value={2}>2 veces (Recomendado para fiestas)</option>
                      <option value={3}>3 veces</option>
                      <option value={5}>5 veces</option>
                      <option value={0}>Continuo (Pasa sin parar mientras dure la canción)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 font-semibold mb-1.5">
                      Diseño visual de la dedicatoria en pantalla:
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {DEDICATION_STYLES.map((st) => {
                        const isSelected = (partyConfig.dedicationStyle ?? "neon") === st.id;
                        return (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() =>
                              setPartyConfig((prev) => ({
                                ...prev,
                                dedicationStyle: st.id,
                              }))
                            }
                            className={`p-2 rounded-xl border text-center transition-all flex flex-col items-center gap-1 ${
                              isSelected
                                ? "bg-gradient-to-b from-indigo-950/80 to-[#151c33] border-pink-400 text-white shadow-[0_0_15px_rgba(236,72,153,0.3)] ring-1 ring-pink-400/60"
                                : "bg-[#141824] border-[#232b42] text-slate-400 hover:text-white hover:border-slate-500"
                            }`}
                          >
                            <span className="text-xl">{st.icon}</span>
                            <span className="font-mono text-[10px] font-bold">{st.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Live Mini Preview */}
                  {(() => {
                    const st =
                      DEDICATION_STYLES.find(
                        (s) => s.id === (partyConfig.dedicationStyle ?? "neon"),
                      ) || DEDICATION_STYLES[0];
                    return (
                      <div className="mt-2 p-2.5 rounded-xl bg-black/40 border border-[#232b42] flex flex-col gap-1">
                        <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                          Vista previa en pantalla de TV:
                        </span>
                        <div className="overflow-hidden py-1">
                          <div
                            className={`inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl backdrop-blur-md whitespace-nowrap text-xs ${st.containerClass}`}
                          >
                            <span>{st.leadEmoji}</span>
                            <span
                              className={`font-mono text-[10px] uppercase tracking-wider font-black px-2 py-0.5 rounded ${st.badgeClass}`}
                            >
                              MARTIN
                            </span>
                            <span className={`font-bold tracking-tight text-xs ${st.messageClass}`}>
                              &ldquo;¡Feliz cumpleee! ❤️🎉&rdquo;
                            </span>
                            <span>{st.tailEmoji}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer pt-2 border-t border-[#1d2538]">
                <input
                  type="checkbox"
                  checked={partyConfig.allowGuestKaraoke}
                  onChange={(e) =>
                    setPartyConfig((prev) => ({
                      ...prev,
                      allowGuestKaraoke: e.target.checked,
                    }))
                  }
                  className="accent-pink-500"
                />
                <span>🎤 Permitir Karaoke desde el celular</span>
              </label>
            </div>
          </div>
        )}
      </section>

      {/* Grid: Bento Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* SECTION 1: DATOS DEL LOCAL (7 Cols) */}
        <section className="lg:col-span-7 bg-[#181b25] rounded-2xl border border-[#232b42] p-6 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between border-b border-[#232b42] pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <span className="size-9 rounded-xl bg-[#121624] border border-[#232b42] text-indigo-400 flex items-center justify-center">
                  <span className="material-symbols-outlined text-lg">storefront</span>
                </span>
                <div>
                  <h3 className="text-sm font-bold text-white">1. Datos del Local</h3>
                  <p className="text-xs text-slate-400">Identidad visible para los clientes que escanean la terminal QR.</p>
                </div>
              </div>
            </div>

            <div className="space-y-4 font-mono text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Nombre Comercial</label>
                <input
                  type="text"
                  value={venueName}
                  onChange={(e) => setVenueName(e.target.value)}
                  className="w-full bg-[#0a0e17] border border-[#232b42] rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-indigo-400"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Mensaje de Bienvenida al Salón</label>
                <input
                  type="text"
                  value={joinMessage}
                  onChange={(e) => setJoinMessage(e.target.value)}
                  placeholder="Ej: ¡Bienvenidos! Pedí tu tema favorito desde la mesa."
                  className="w-full bg-[#0a0e17] border border-[#232b42] rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-indigo-400"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Color de Acento / Iluminación</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="size-10 rounded-lg bg-transparent border border-[#232b42] cursor-pointer"
                  />
                  <input
                    type="text"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="w-32 bg-[#0a0e17] border border-[#232b42] rounded-lg px-3 py-2 text-white font-mono uppercase"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: QR & ACCESO MESAS (5 Cols) */}
        <section className="lg:col-span-5 bg-[#181b25] rounded-2xl border border-[#232b42] p-6 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2.5 border-b border-[#232b42] pb-3 mb-4">
              <span className="size-9 rounded-xl bg-[#121624] border border-[#232b42] text-cyan-400 flex items-center justify-center">
                <span className="material-symbols-outlined text-lg">qr_code_scanner</span>
              </span>
              <div>
                <h3 className="text-sm font-bold text-white">2. Código QR para Mesas</h3>
                <p className="text-xs text-slate-400">Enlace directo para imprimir y colocar en mesas o barra.</p>
              </div>
            </div>

            <div className="flex flex-col items-center p-4 bg-[#0a0e17] rounded-xl border border-[#232b42]">
              {qrUrl ? (
                <Image
                  src={qrUrl}
                  alt="QR Mesas"
                  width={160}
                  height={160}
                  className="size-36 rounded-lg p-1 bg-white object-contain"
                  unoptimized
                />
              ) : null}

              <p className="font-mono text-xs text-slate-400 mt-3 truncate max-w-xs text-center">
                {clientUrl}
              </p>

              <div className="mt-3 flex items-center gap-2 w-full">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex-1 px-3 py-2 rounded-lg bg-[#181b25] hover:bg-[#202534] border border-[#232b42] text-xs font-mono text-indigo-300 hover:text-white transition-colors flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">content_copy</span>
                  {copied ? "¡Copiado!" : "Copiar"}
                </button>
                <button
                  type="button"
                  onClick={() => setPrintQrOpen(true)}
                  className="flex-1 px-3 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-600 hover:brightness-110 text-white text-xs font-bold font-mono transition-all shadow-md shadow-indigo-900/30 flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">print</span>
                  Imprimir / PDF
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3: REGLAS DEL JUKEBOX (7 Cols) */}
        <section className="lg:col-span-7 bg-[#181b25] rounded-2xl border border-[#232b42] p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 border-b border-[#232b42] pb-3">
            <span className="size-9 rounded-xl bg-[#121624] border border-[#232b42] text-indigo-400 flex items-center justify-center">
              <span className="material-symbols-outlined text-lg">queue_music</span>
            </span>
            <div>
              <h3 className="text-sm font-bold text-white">3. Reglas de Reproducción & Límites</h3>
              <p className="text-xs text-slate-400">Control de longitud de temas y límites de pedidos por mesa.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs pt-1">
            <div className="bg-[#121624] p-3 rounded-xl border border-[#232b42]">
              <label className="text-slate-400 block mb-1">Duración Máx. (Seg)</label>
              <input
                type="number"
                min={60}
                max={900}
                value={maxDuration}
                onChange={(e) => setMaxDuration(Number(e.target.value))}
                className="w-full bg-[#0a0e17] border border-[#232b42] rounded-lg px-2.5 py-2 text-white font-bold"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">{(maxDuration / 60).toFixed(1)} minutos</span>
            </div>

            <div className="bg-[#121624] p-3 rounded-xl border border-[#232b42]">
              <label className="text-slate-400 block mb-1">Máx. Propuestas / Cliente</label>
              <input
                type="number"
                min={1}
                max={20}
                value={maxProposals}
                onChange={(e) => setMaxProposals(Number(e.target.value))}
                className="w-full bg-[#0a0e17] border border-[#232b42] rounded-lg px-2.5 py-2 text-white font-bold"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Por sesión de noche</span>
            </div>

            <div className="bg-[#121624] p-3 rounded-xl border border-[#232b42]">
              <label className="text-slate-400 block mb-1">Tamaño Máx. Cola</label>
              <input
                type="number"
                min={5}
                max={100}
                value={maxQueue}
                onChange={(e) => setMaxQueue(Number(e.target.value))}
                className="w-full bg-[#0a0e17] border border-[#232b42] rounded-lg px-2.5 py-2 text-white font-bold"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Temas simultáneos</span>
            </div>
          </div>

          {/* Vote-to-skip settings for both Bar & Party */}
          <div className="bg-[#121624] p-3.5 rounded-xl border border-[#232b42] flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono text-xs">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={partyConfig.skipVoteEnabled ?? true}
                onChange={(e) =>
                  setPartyConfig((prev) => ({
                    ...prev,
                    skipVoteEnabled: e.target.checked,
                  }))
                }
                className="size-4 accent-rose-500"
              />
              <div>
                <span className="text-white font-bold block">
                  ⏭️ Votación para cambiar canción en reproducción
                </span>
                <span className="text-[10px] text-slate-400">
                  Permite que una persona inicie una votación en vivo para saltar el tema actual
                </span>
              </div>
            </label>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-slate-400 text-[11px]">Votos necesarios:</span>
              <input
                type="number"
                min={1}
                max={50}
                value={partyConfig.skipVotesThreshold ?? 3}
                onChange={(e) =>
                  setPartyConfig((prev) => ({
                    ...prev,
                    skipVotesThreshold: Math.max(1, Number(e.target.value) || 3),
                  }))
                }
                className="w-16 bg-[#0a0e17] border border-[#232b42] rounded-lg px-2.5 py-1.5 text-white font-bold text-center"
              />
            </div>
          </div>
        </section>

        {/* SECTION 4: FILTRO ACÚSTICO & CONTENIDO (5 Cols) */}
        <section className="lg:col-span-5 bg-[#181b25] rounded-2xl border border-[#232b42] p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 border-b border-[#232b42] pb-3">
            <span className="size-9 rounded-xl bg-[#121624] border border-[#232b42] text-cyan-400 flex items-center justify-center">
              <span className="material-symbols-outlined text-lg">shield</span>
            </span>
            <div>
              <h3 className="text-sm font-bold text-white">4. Filtro Acústico & Seguridad</h3>
              <p className="text-xs text-slate-400">Bloqueo automático de tracks explícitos o palabras prohibidas.</p>
            </div>
          </div>

          <div className="space-y-4 font-mono text-xs">
            <label className="flex items-center justify-between p-3 rounded-xl bg-[#121624] border border-[#232b42] cursor-pointer">
              <div>
                <span className="text-white font-bold block">Filtro Explícito Activo</span>
                <span className="text-[10px] text-slate-400">Bloquea videos +18 de YouTube</span>
              </div>
              <input
                type="checkbox"
                checked={explicitFilter}
                onChange={(e) => setExplicitFilter(e.target.checked)}
                className="size-5 rounded bg-[#0a0e17] border-[#232b42] text-indigo-600 focus:ring-0"
              />
            </label>

            <div>
              <label className="block text-slate-400 mb-1">Palabras clave bloqueadas</label>
              <textarea
                rows={2}
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="gemidos, insultos..."
                className="w-full bg-[#0a0e17] border border-[#232b42] rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-indigo-400"
              />
            </div>
          </div>
        </section>

        {/* SECTION 5: RONDAS DE VOTACIÓN AUTOMÁTICAS (12 Cols) */}
        <section className="lg:col-span-12 bg-[#181b25] rounded-2xl border border-[#232b42] p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-[#232b42] pb-3">
            <div className="flex items-center gap-2.5">
              <span className="size-9 rounded-xl bg-[#121624] border border-[#232b42] text-amber-400 flex items-center justify-center">
                <span className="material-symbols-outlined text-lg">timer</span>
              </span>
              <div>
                <h3 className="text-sm font-bold text-white">5. Rondas de Votación (Desempate por Tiempo)</h3>
                <p className="text-xs text-slate-400">
                  Si las canciones propuestas no alcanzan los 5 votos durante la ronda, la más votada (o por orden de llegada) se agrega automáticamente a la TV.
                </p>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer font-mono text-xs text-slate-300">
              <span className={votingRoundsEnabled ? "text-emerald-400 font-bold" : "text-slate-500"}>
                {votingRoundsEnabled ? "Rondas Activas" : "Rondas Desactivadas"}
              </span>
              <input
                type="checkbox"
                checked={votingRoundsEnabled}
                onChange={(e) => setVotingRoundsEnabled(e.target.checked)}
                className="size-5 rounded bg-[#0a0e17] border-[#232b42] text-amber-500 focus:ring-0 cursor-pointer"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs pt-2">
            <div className="bg-[#121624] p-3 rounded-xl border border-[#232b42]">
              <label className="text-slate-400 block mb-1">Duración de la Ronda</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={30}
                  max={1800}
                  step={10}
                  value={votingRoundSeconds}
                  onChange={(e) => setVotingRoundSeconds(Number(e.target.value))}
                  className="w-full bg-[#0a0e17] border border-[#232b42] rounded-lg px-2.5 py-2 text-white font-bold"
                />
                <span className="text-slate-400">seg</span>
              </div>
              <span className="text-[10px] text-amber-400 mt-1 block">
                {(votingRoundSeconds / 60).toFixed(1)} minutos por ronda
              </span>
            </div>

            <div className="bg-[#121624] p-3 rounded-xl border border-[#232b42] sm:col-span-2 flex flex-col justify-between">
              <span className="text-slate-400 block mb-1">Atajos Rápidos de Tiempo:</span>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "1 Minuto (60s)", val: 60 },
                  { label: "2 Minutos (120s)", val: 120 },
                  { label: "3 Minutos (180s - Recomendado)", val: 180 },
                  { label: "5 Minutos (300s)", val: 300 },
                ].map((preset) => (
                  <button
                    key={preset.val}
                    type="button"
                    onClick={() => setVotingRoundSeconds(preset.val)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${
                      votingRoundSeconds === preset.val
                        ? "bg-amber-500/20 border-amber-500/60 text-amber-300"
                        : "bg-[#0a0e17] border-[#232b42] text-slate-400 hover:text-white"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Summary Row */}
      {summary && (
        <section className="card-panel rounded-2xl p-6 shadow-md font-mono text-xs text-slate-400">
          <div className="flex items-center justify-between pb-3 border-b border-[#1E2333]">
            <span className="text-white font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-indigo-400 text-base">insights</span>
              Telemetría Histórica de la Noche
            </span>
            <span className="text-cyan-400">Audit logs OK</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
            <div>
              <span className="text-slate-500 block">Total Votos:</span>
              <span className="text-lg font-bold text-white">{summary.votesCount}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Créditos Emitidos:</span>
              <span className="text-lg font-bold text-white">{summary.creditsIssued}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Códigos Canjeados:</span>
              <span className="text-lg font-bold text-white">{summary.codesRedeemed}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Créditos Gastados:</span>
              <span className="text-lg font-bold text-white">{summary.creditsSpent}</span>
            </div>
          </div>
        </section>
      )}
      <PrintQrModal
        isOpen={printQrOpen}
        onClose={() => setPrintQrOpen(false)}
        slug={slug}
        venueName={venueName || "Billar Aurora"}
      />
    </form>
  );
}
