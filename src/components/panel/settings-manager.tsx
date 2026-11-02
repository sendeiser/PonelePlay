"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import { createBrowserSupabase } from "@/lib/api/supabase/browser";
import { fetchNightSummary, venueQrUrl, type NightSummary } from "@/lib/api/owner-ops";
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

  // Load venue and settings
  const loadSettings = useCallback(async () => {
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
        };
        setExplicitFilter(s.explicit_filter_enabled);
        setKeywords(s.explicit_keywords?.join(", ") || "");
        setMaxDuration(s.max_song_duration_seconds || 480);
        setMaxProposals(s.max_proposals_per_participant || 3);
        setMaxQueue(s.max_queue_size || 30);
        setVotingRoundsEnabled(s.voting_rounds_enabled ?? true);
        setVotingRoundSeconds(s.voting_round_seconds ?? 180);
      }

      const sum = await fetchNightSummary(v.id).catch(() => null);
      if (sum) setSummary(sum);
    }
  }, [slug]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!venueId) return;

    setSaving(true);
    setError(null);
    try {
      const supabase = createBrowserSupabase();
      await supabase
        .from("venues")
        .update({
          name: venueName,
          accent_color: accentColor,
          join_message: joinMessage || null,
        })
        .eq("id", venueId);

      const splitKeywords = keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);

      await supabase
        .from("venue_settings")
        .update({
          explicit_filter_enabled: explicitFilter,
          explicit_keywords: splitKeywords,
          max_song_duration_seconds: maxDuration,
          max_proposals_per_participant: maxProposals,
          max_queue_size: maxQueue,
          voting_rounds_enabled: votingRoundsEnabled,
          voting_round_seconds: votingRoundSeconds,
        })
        .eq("venue_id", venueId);

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
            Ajustes y Configuración del Bar
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Reglas de jukebox, políticas de filtrado acústico y pairing en tiempo real.
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
