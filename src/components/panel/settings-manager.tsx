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

  const [origin, setOrigin] = useState("https://poneleplay.app");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const clientUrl = venueQrUrl(origin, slug);

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
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-th-border gap-4">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs text-th-accent mb-1">
            <span>/panel/{slug}/ajustes</span>
            <span className="text-th-muted">/</span>
            <span className="px-2 py-0.5 rounded-full bg-th-recessed text-th-teal text-[11px] font-semibold border border-th-border">
              Sincronizado
            </span>
          </div>
          <h1 className="font-display text-xl font-bold text-th-text tracking-tight">
            {partyConfig.venueType === "party"
              ? "🎉 Ajustes de la Fiesta / Cumpleaños"
              : "Ajustes y Configuración del Bar"}
          </h1>
          <p className="text-xs text-th-muted mt-0.5">
            {partyConfig.venueType === "party"
              ? "Configurá las reglas democráticas, los Fueguitos Turbo, las dedicatorias en TV y el QR para tus invitados."
              : "Reglas de jukebox, políticas de filtrado acústico y pairing en tiempo real."}
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {saved && (
            <span className="font-mono text-xs text-th-emerald font-semibold flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">check_circle</span>
              ¡Guardado!
            </span>
          )}
          <button
            type="submit"
            disabled={saving}
            className="w-full sm:w-auto justify-center px-5 py-2.5 rounded-xl bg-th-accent hover:bg-th-accent-hover text-th-on-accent font-mono text-xs font-bold flex items-center gap-2 shadow-sm active:scale-95 transition-all disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-base">save</span>
            <span>{saving ? "Guardando..." : "Guardar Configuración"}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-th-danger/30 bg-th-danger-soft p-3 text-xs text-th-danger flex items-center gap-2 font-mono">
          <span className="material-symbols-outlined text-base text-th-danger">error</span>
          <span>{error}</span>
        </div>
      )}

      {/* CONFIGURACIÓN DE MODO FIESTA / MODALIDAD DE SALA */}
      <section className="card-panel rounded-2xl border-th-accent/25 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-th-accent font-bold">
              <span>✨ Modalidad del Sistema</span>
            </span>
            <h2 className="font-display text-base font-bold text-th-text mt-0.5">
              {partyConfig.venueType === "party"
                ? "🎉 Modo Fiesta / Joda / Cumpleaños (Todo Desbloqueado)"
                : "🍻 Modo Bar Comercial (Tickets & Mozos)"}
            </h2>
            <p className="text-xs text-th-muted mt-0.5">
              {partyConfig.venueType === "party"
                ? "Tu cabina está configurada en Modo Fiesta: sin códigos de canje, con pedidos libres, dedicatorias en TV y juegos."
                : "Configuración activa para Bares con expedición de códigos de crédito por consumo y rondas automáticas."}
            </p>
          </div>
          {partyConfig.venueType === "party" ? (
            <div className="px-3.5 py-2 rounded-xl font-mono text-xs font-bold bg-th-accent-soft text-th-accent border border-th-accent/30 shrink-0">
              🎉 Modo Fiesta Activo
            </div>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              <span className="px-3.5 py-2 rounded-xl font-mono text-xs font-bold bg-th-accent text-th-on-accent border border-th-accent shadow-sm">
                🍻 Modo Bar Activo
              </span>
            </div>
          )}
        </div>

        {partyConfig.venueType === "party" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-th-border">
            <div className="bg-th-recessed p-4 rounded-xl border border-th-border">
              <label className="ui-label text-th-accent mb-2">
                Límite de votos por persona (Modo Democrático)
              </label>
              <div className="flex items-center gap-2.5">
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
                  className="ui-input w-24 font-mono text-xs font-bold"
                />
                <span className="text-[11px] text-th-muted font-mono">
                  {partyConfig.votesPerGuest === 0
                    ? "Ilimitado (Todo libre)"
                    : `${partyConfig.votesPerGuest} votos por invitado`}
                </span>
              </div>
            </div>

            <div className="bg-th-recessed p-4 rounded-xl border border-th-border space-y-2.5">
              <label className="ui-label text-th-teal">
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
                        ? "bg-th-teal-soft border-th-teal text-th-teal shadow-sm"
                        : "bg-th-card border-th-border text-th-muted hover:text-th-text"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2.5">
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
                  className="ui-input w-24 font-mono text-xs font-bold"
                />
                <span className="text-[11px] text-th-muted font-mono">
                  {partyConfig.minVotesToQueue <= 1
                    ? "Pasa directo a la cola (1 voto)"
                    : `Entra en Pre-Cola y sube con ${partyConfig.minVotesToQueue} votos`}
                </span>
              </div>
            </div>

            <div className="bg-th-recessed p-4 rounded-xl border border-th-border flex flex-col gap-3">
              <label className="flex items-center gap-2.5 text-xs text-th-text cursor-pointer">
                <input
                  type="checkbox"
                  checked={partyConfig.allowDedications}
                  onChange={(e) =>
                    setPartyConfig((prev) => ({
                      ...prev,
                      allowDedications: e.target.checked,
                    }))
                  }
                  className="size-4 accent-th-accent rounded cursor-pointer"
                />
                <span className="font-bold">💬 Permitir Dedicatorias en TV</span>
              </label>

              {partyConfig.allowDedications && (
                <div className="pt-2.5 border-t border-th-border space-y-3">
                  <div>
                    <label className="ui-label mb-1">
                      Veces que pasa por pantalla
                    </label>
                    <select
                      value={partyConfig.dedicationRepeats ?? 2}
                      onChange={(e) =>
                        setPartyConfig((prev) => ({
                          ...prev,
                          dedicationRepeats: Number(e.target.value),
                        }))
                      }
                      className="ui-input font-mono text-xs"
                    >
                      <option value={1}>1 vez (Pasa 1 vez y se oculta para no tapar el video)</option>
                      <option value={2}>2 veces (Recomendado para fiestas)</option>
                      <option value={3}>3 veces</option>
                      <option value={5}>5 veces</option>
                      <option value={0}>Continuo (Pasa sin parar mientras dure la canción)</option>
                    </select>
                  </div>

                  <div>
                    <label className="ui-label mb-1.5">
                      Diseño visual de la dedicatoria en pantalla
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
                                ? "bg-th-accent-soft border-th-accent text-th-accent ring-1 ring-th-accent/40 shadow-sm"
                                : "bg-th-card border-th-border text-th-muted hover:text-th-text hover:border-th-border-strong"
                            }`}
                          >
                            <span className="text-xl">{st.icon}</span>
                            <span className="font-mono text-[10px] font-bold">{st.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Live Mini Preview (TV stage always dark) */}
                  {(() => {
                    const st =
                      DEDICATION_STYLES.find(
                        (s) => s.id === (partyConfig.dedicationStyle ?? "neon"),
                      ) || DEDICATION_STYLES[0];
                    return (
                      <div className="mt-2 p-3 rounded-xl bg-[#090d16] border border-[#232b42] flex flex-col gap-1.5">
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

              <label className="flex items-center gap-2.5 text-xs text-th-text cursor-pointer pt-2.5 border-t border-th-border">
                <input
                  type="checkbox"
                  checked={partyConfig.allowGuestKaraoke}
                  onChange={(e) =>
                    setPartyConfig((prev) => ({
                      ...prev,
                      allowGuestKaraoke: e.target.checked,
                    }))
                  }
                  className="size-4 accent-th-accent rounded cursor-pointer"
                />
                <span className="font-medium">🎤 Permitir Karaoke desde el celular</span>
              </label>
            </div>
          </div>
        )}
      </section>

      {/* Grid: Bento Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* SECTION 1: DATOS DEL LOCAL (7 Cols) */}
        <section className="lg:col-span-7 card-panel rounded-2xl p-6 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between border-b border-th-border pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <span className="size-9 rounded-xl bg-th-recessed border border-th-border text-th-accent flex items-center justify-center">
                  <span className="material-symbols-outlined text-lg">storefront</span>
                </span>
                <div>
                  <h3 className="font-display text-sm font-bold text-th-text">1. Datos del Local</h3>
                  <p className="text-xs text-th-muted">Identidad visible para los clientes que escanean la terminal QR.</p>
                </div>
              </div>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="ui-label">Nombre Comercial</label>
                <input
                  type="text"
                  value={venueName}
                  onChange={(e) => setVenueName(e.target.value)}
                  className="ui-input font-mono"
                />
              </div>

              <div>
                <label className="ui-label">Mensaje de Bienvenida al Salón</label>
                <input
                  type="text"
                  value={joinMessage}
                  onChange={(e) => setJoinMessage(e.target.value)}
                  placeholder="Ej: ¡Bienvenidos! Pedí tu tema favorito desde la mesa."
                  className="ui-input font-mono"
                />
              </div>

              <div>
                <label className="ui-label">Color de Acento / Iluminación</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="size-10 rounded-lg bg-transparent border border-th-border cursor-pointer"
                  />
                  <input
                    type="text"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="ui-input w-36 font-mono uppercase"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: QR & ACCESO MESAS (5 Cols) */}
        <section className="lg:col-span-5 card-panel rounded-2xl p-6 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2.5 border-b border-th-border pb-3 mb-4">
              <span className="size-9 rounded-xl bg-th-recessed border border-th-border text-th-teal flex items-center justify-center">
                <span className="material-symbols-outlined text-lg">qr_code_scanner</span>
              </span>
              <div>
                <h3 className="font-display text-sm font-bold text-th-text">2. Código QR para Mesas</h3>
                <p className="text-xs text-th-muted">Enlace directo para imprimir y colocar en mesas o barra.</p>
              </div>
            </div>

            <div className="flex flex-col items-center p-4 bg-th-recessed rounded-xl border border-th-border">
              {qrUrl ? (
                <Image
                  src={qrUrl}
                  alt="QR Mesas"
                  width={160}
                  height={160}
                  className="size-36 rounded-lg p-1.5 bg-white border border-slate-200 object-contain shadow-xs"
                  unoptimized
                />
              ) : null}

              <p className="font-mono text-xs text-th-muted mt-3 truncate max-w-xs text-center">
                {clientUrl}
              </p>

              <div className="mt-3 flex items-center gap-2 w-full">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex-1 px-3 py-2 rounded-lg bg-th-card hover:bg-th-recessed border border-th-border text-xs font-mono font-semibold text-th-accent transition-colors flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">content_copy</span>
                  {copied ? "¡Copiado!" : "Copiar"}
                </button>
                <button
                  type="button"
                  onClick={() => setPrintQrOpen(true)}
                  className="flex-1 px-3 py-2 rounded-lg bg-th-accent hover:bg-th-accent-hover text-th-on-accent text-xs font-bold font-mono transition-all shadow-sm flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">print</span>
                  Imprimir / PDF
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3: REGLAS DEL JUKEBOX (7 Cols) */}
        <section className="lg:col-span-7 card-panel rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2.5 border-b border-th-border pb-3">
            <span className="size-9 rounded-xl bg-th-recessed border border-th-border text-th-accent flex items-center justify-center">
              <span className="material-symbols-outlined text-lg">queue_music</span>
            </span>
            <div>
              <h3 className="font-display text-sm font-bold text-th-text">3. Reglas de Reproducción & Límites</h3>
              <p className="text-xs text-th-muted">Control de longitud de temas y límites de pedidos por mesa.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs pt-1">
            <div className="bg-th-recessed p-3.5 rounded-xl border border-th-border">
              <label className="ui-label mb-1.5">Duración Máx. (Seg)</label>
              <input
                type="number"
                min={60}
                max={900}
                value={maxDuration}
                onChange={(e) => setMaxDuration(Number(e.target.value))}
                className="ui-input font-mono font-bold"
              />
              <span className="text-[10px] font-mono text-th-muted mt-1.5 block">
                {(maxDuration / 60).toFixed(1)} minutos
              </span>
            </div>

            <div className="bg-th-recessed p-3.5 rounded-xl border border-th-border">
              <label className="ui-label mb-1.5">Máx. Propuestas / Cliente</label>
              <input
                type="number"
                min={1}
                max={20}
                value={maxProposals}
                onChange={(e) => setMaxProposals(Number(e.target.value))}
                className="ui-input font-mono font-bold"
              />
              <span className="text-[10px] font-mono text-th-muted mt-1.5 block">
                Por sesión de noche
              </span>
            </div>

            <div className="bg-th-recessed p-3.5 rounded-xl border border-th-border">
              <label className="ui-label mb-1.5">Tamaño Máx. Cola</label>
              <input
                type="number"
                min={5}
                max={100}
                value={maxQueue}
                onChange={(e) => setMaxQueue(Number(e.target.value))}
                className="ui-input font-mono font-bold"
              />
              <span className="text-[10px] font-mono text-th-muted mt-1.5 block">
                Temas simultáneos
              </span>
            </div>
          </div>

          {/* Vote-to-skip settings for both Bar & Party */}
          <div className="bg-th-recessed p-4 rounded-xl border border-th-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <label className="flex items-start sm:items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={partyConfig.skipVoteEnabled ?? true}
                onChange={(e) =>
                  setPartyConfig((prev) => ({
                    ...prev,
                    skipVoteEnabled: e.target.checked,
                  }))
                }
                className="size-4 mt-0.5 sm:mt-0 accent-th-accent cursor-pointer shrink-0"
              />
              <div>
                <span className="text-th-text font-bold block">
                  ⏭️ Votación para cambiar canción en reproducción
                </span>
                <span className="text-[11px] text-th-muted">
                  Permite que una persona inicie una votación en vivo para saltar el tema actual
                </span>
              </div>
            </label>

            <div className="flex items-center gap-2 shrink-0 font-mono">
              <span className="text-th-muted text-[11px]">Votos necesarios:</span>
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
                className="ui-input w-16 px-2.5 py-1.5 font-bold text-center"
              />
            </div>
          </div>
        </section>

        {/* SECTION 4: FILTRO ACÚSTICO & CONTENIDO (5 Cols) */}
        <section className="lg:col-span-5 card-panel rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2.5 border-b border-th-border pb-3">
            <span className="size-9 rounded-xl bg-th-recessed border border-th-border text-th-teal flex items-center justify-center">
              <span className="material-symbols-outlined text-lg">shield</span>
            </span>
            <div>
              <h3 className="font-display text-sm font-bold text-th-text">4. Filtro Acústico & Seguridad</h3>
              <p className="text-xs text-th-muted">Bloqueo automático de tracks explícitos o palabras prohibidas.</p>
            </div>
          </div>

          <div className="space-y-4 text-xs">
            <label className="flex items-center justify-between p-3.5 rounded-xl bg-th-recessed border border-th-border cursor-pointer">
              <div>
                <span className="text-th-text font-bold block">Filtro Explícito Activo</span>
                <span className="text-[11px] text-th-muted">Bloquea videos +18 de YouTube</span>
              </div>
              <input
                type="checkbox"
                checked={explicitFilter}
                onChange={(e) => setExplicitFilter(e.target.checked)}
                className="size-5 rounded accent-th-accent cursor-pointer"
              />
            </label>

            <div>
              <label className="ui-label mb-1">Palabras clave bloqueadas</label>
              <textarea
                rows={2}
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="gemidos, insultos..."
                className="ui-input font-mono text-xs resize-none"
              />
            </div>
          </div>
        </section>

        {/* SECTION 5: RONDAS DE VOTACIÓN AUTOMÁTICAS (12 Cols) */}
        <section className="lg:col-span-12 card-panel rounded-2xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-th-border pb-3">
            <div className="flex items-center gap-2.5">
              <span className="size-9 rounded-xl bg-th-recessed border border-th-border text-th-amber flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-lg">timer</span>
              </span>
              <div>
                <h3 className="font-display text-sm font-bold text-th-text">
                  5. Rondas de Votación (Desempate por Tiempo)
                </h3>
                <p className="text-xs text-th-muted">
                  Si las canciones propuestas no alcanzan los votos necesarios durante la ronda, la más votada (o por orden de llegada) se agrega automáticamente a la TV.
                </p>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer font-mono text-xs shrink-0">
              <span className={votingRoundsEnabled ? "text-th-emerald font-bold" : "text-th-muted"}>
                {votingRoundsEnabled ? "Rondas Activas" : "Rondas Desactivadas"}
              </span>
              <input
                type="checkbox"
                checked={votingRoundsEnabled}
                onChange={(e) => setVotingRoundsEnabled(e.target.checked)}
                className="size-5 rounded accent-th-amber cursor-pointer"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs pt-1">
            <div className="bg-th-recessed p-3.5 rounded-xl border border-th-border">
              <label className="ui-label mb-1.5">Duración de la Ronda</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={30}
                  max={1800}
                  step={10}
                  value={votingRoundSeconds}
                  onChange={(e) => setVotingRoundSeconds(Number(e.target.value))}
                  className="ui-input font-mono font-bold"
                />
                <span className="font-mono text-th-muted">seg</span>
              </div>
              <span className="text-[10px] font-mono font-semibold text-th-amber mt-1.5 block">
                {(votingRoundSeconds / 60).toFixed(1)} minutos por ronda
              </span>
            </div>

            <div className="bg-th-recessed p-3.5 rounded-xl border border-th-border sm:col-span-2 flex flex-col justify-between gap-2">
              <span className="ui-label">Atajos Rápidos de Tiempo</span>
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
                    className={`px-3 py-1.5 rounded-lg border font-mono text-xs font-bold transition-colors ${
                      votingRoundSeconds === preset.val
                        ? "bg-th-amber-soft border-th-amber text-th-amber shadow-xs"
                        : "bg-th-card border-th-border text-th-muted hover:text-th-text"
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
        <section className="card-panel rounded-2xl p-6 font-mono text-xs text-th-muted">
          <div className="flex items-center justify-between pb-3 border-b border-th-border">
            <span className="text-th-text font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-th-accent text-base">insights</span>
              Telemetría Histórica de la Noche
            </span>
            <span className="text-th-teal font-semibold">Audit logs OK</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
            <div>
              <span className="text-th-muted block">Total Votos:</span>
              <span className="text-lg font-bold text-th-text tabular-nums">{summary.votesCount}</span>
            </div>
            <div>
              <span className="text-th-muted block">Créditos Emitidos:</span>
              <span className="text-lg font-bold text-th-text tabular-nums">{summary.creditsIssued}</span>
            </div>
            <div>
              <span className="text-th-muted block">Códigos Canjeados:</span>
              <span className="text-lg font-bold text-th-text tabular-nums">{summary.codesRedeemed}</span>
            </div>
            <div>
              <span className="text-th-muted block">Créditos Gastados:</span>
              <span className="text-lg font-bold text-th-text tabular-nums">{summary.creditsSpent}</span>
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
