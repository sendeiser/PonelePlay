"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import { Check, Copy, QrCode, RefreshCw, Save, Sliders, Sparkles } from "lucide-react";
import { createBrowserSupabase } from "@/lib/api/supabase/browser";
import { fetchNightSummary, venueQrUrl, type NightSummary } from "@/lib/api/owner-ops";

interface SettingsManagerProps {
  slug: string;
}

export function SettingsManager({ slug }: SettingsManagerProps) {
  const [venueId, setVenueId] = useState<string | null>(null);
  const [venueName, setVenueName] = useState("");
  const [accentColor, setAccentColor] = useState("#f5c542");
  const [joinMessage, setJoinMessage] = useState("");

  const [explicitFilter, setExplicitFilter] = useState(true);
  const [keywords, setKeywords] = useState("gemidos, insultos");
  const [maxDuration, setMaxDuration] = useState(480);
  const [maxProposals, setMaxProposals] = useState(3);
  const [maxQueue, setMaxQueue] = useState(30);

  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [summary, setSummary] = useState<NightSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
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
      color: { dark: "#041611", light: "#f5e9d6" },
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
      setAccentColor(v.accent_color || "#f5c542");
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
        };
        setExplicitFilter(s.explicit_filter_enabled);
        setKeywords(s.explicit_keywords?.join(", ") || "");
        setMaxDuration(s.max_song_duration_seconds || 480);
        setMaxProposals(s.max_proposals_per_participant || 3);
        setMaxQueue(s.max_queue_size || 30);
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
          name: venueName.trim(),
          accent_color: accentColor,
          join_message: joinMessage.trim() || null,
        } as never)
        .eq("id", venueId);

      const parsedKeywords = keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);

      await supabase
        .from("venue_settings")
        .update({
          explicit_filter_enabled: explicitFilter,
          explicit_keywords: parsedKeywords,
          max_song_duration_seconds: maxDuration,
          max_proposals_per_participant: maxProposals,
          max_queue_size: maxQueue,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("venue_id", venueId);

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Error al guardar ajustes",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleCopyUrl() {
    navigator.clipboard.writeText(clientUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-cream/10 pb-5">
        <div>
          <h1 className="text-2xl font-display font-bold text-cream">
            Ajustes del Local
          </h1>
          <p className="mt-1 text-xs text-cream/50">
            Identidad del bar, reglas de propuestas y código QR del salón
          </p>
        </div>

        <button
          type="button"
          disabled={saving || !venueId}
          onClick={handleSave}
          className="flex items-center gap-1.5 rounded-xl bg-amber px-4 py-2 font-display text-xs font-bold text-[#041611] hover:bg-amber/90 disabled:opacity-50"
        >
          {saving ? (
            <RefreshCw className="size-3.5 animate-spin" />
          ) : saved ? (
            <Check className="size-3.5" />
          ) : (
            <Save className="size-3.5" />
          )}
          {saved ? "Guardado" : "Guardar cambios"}
        </button>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-coral/30 bg-coral/10 p-3 text-xs text-coral"
        >
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Settings Form */}
        <form onSubmit={handleSave} className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-cream/10 bg-white/[0.02] p-5 space-y-4">
            <h3 className="font-display text-sm font-bold text-cream border-b border-cream/10 pb-3">
              Identidad del Local
            </h3>

            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-cream/50">
                Nombre del bar
              </label>
              <input
                type="text"
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-cream/15 bg-white/5 px-3.5 py-2.5 text-xs text-cream focus:border-amber focus:outline-none"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-cream/50">
                  Slug (URL pública)
                </label>
                <input
                  type="text"
                  value={slug}
                  disabled
                  className="mt-1 w-full rounded-xl border border-cream/10 bg-white/[0.02] px-3.5 py-2.5 font-mono text-xs text-cream/50 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-cream/50">
                  Color de acento
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="size-9 rounded-lg border border-cream/15 bg-transparent cursor-pointer"
                  />
                  <input
                    type="text"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="w-full rounded-xl border border-cream/15 bg-white/5 px-3 py-2 font-mono text-xs text-cream uppercase focus:border-amber focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-cream/50">
                Mensaje de bienvenida al escanear
              </label>
              <input
                type="text"
                value={joinMessage}
                onChange={(e) => setJoinMessage(e.target.value)}
                placeholder="ej: ¡Bienvenidos a Billar Aurora! Votá y pedí tus temas."
                className="mt-1 w-full rounded-xl border border-cream/15 bg-white/5 px-3.5 py-2.5 text-xs text-cream focus:border-amber focus:outline-none"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-cream/10 bg-white/[0.02] p-5 space-y-4">
            <h3 className="font-display text-sm font-bold text-cream border-b border-cream/10 pb-3 flex items-center gap-2">
              <Sliders className="size-4 text-amber" />
              Reglas de Propuestas y Votación
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-cream/50">
                  Máx. propuestas por persona
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={maxProposals}
                  onChange={(e) => setMaxProposals(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-cream/15 bg-white/5 px-3 py-2 font-mono text-xs text-cream focus:border-amber focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-cream/50">
                  Duración máx. (segundos)
                </label>
                <input
                  type="number"
                  min={60}
                  max={1200}
                  value={maxDuration}
                  onChange={(e) => setMaxDuration(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-cream/15 bg-white/5 px-3 py-2 font-mono text-xs text-cream focus:border-amber focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-cream/50">
                  Límite de temas en cola
                </label>
                <input
                  type="number"
                  min={5}
                  max={100}
                  value={maxQueue}
                  onChange={(e) => setMaxQueue(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-cream/15 bg-white/5 px-3 py-2 font-mono text-xs text-cream focus:border-amber focus:outline-none"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer pt-2">
              <input
                type="checkbox"
                checked={explicitFilter}
                onChange={(e) => setExplicitFilter(e.target.checked)}
                className="size-4 rounded border-cream/20 bg-white/5 text-amber focus:ring-0"
              />
              <span className="text-xs text-cream/80 font-medium">
                Activar filtro de contenido explícito y palabras prohibidas
              </span>
            </label>

            {explicitFilter ? (
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-cream/50">
                  Palabras prohibidas (separadas por coma)
                </label>
                <input
                  type="text"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-cream/15 bg-white/5 px-3.5 py-2 text-xs text-cream focus:border-amber focus:outline-none"
                />
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-dashed border-cream/15 bg-white/[0.01] p-5">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-display text-sm font-bold text-cream/50">
                  Spotify Connect (Fase 2)
                </h4>
                <p className="text-xs text-cream/40">
                  La integración con catálogo de Spotify está prevista para la siguiente versión.
                </p>
              </div>
              <span className="rounded-full border border-cream/10 bg-cream/5 px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-cream/40">
                Próximamente
              </span>
            </div>
          </div>
        </form>

        {/* QR Code & Night Summary Sidecards */}
        <div className="space-y-6">
          {/* QR Code Card */}
          <div className="rounded-2xl border border-cream/10 bg-white/[0.02] p-5 text-center">
            <h3 className="font-display text-sm font-bold text-cream flex items-center justify-center gap-2">
              <QrCode className="size-4 text-mint" />
              QR de las Mesas
            </h3>
            <p className="mt-1 text-xs text-cream/50">
              Imprimí o mostrá este QR en las mesas del bar
            </p>

            {qrUrl ? (
              <div className="mt-4 flex justify-center">
                <Image
                  src={qrUrl}
                  alt="QR del Bar"
                  width={180}
                  height={180}
                  className="rounded-xl border border-cream/10"
                  unoptimized
                />
              </div>
            ) : null}

            <p className="mt-3 truncate font-mono text-[10px] text-cream/40">
              {clientUrl}
            </p>

            <button
              type="button"
              onClick={handleCopyUrl}
              className="mt-4 flex items-center justify-center gap-1.5 w-full rounded-xl border border-cream/15 bg-cream/5 py-2 text-xs font-semibold text-cream/80 hover:bg-cream/10"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copiado" : "Copiar enlace del bar"}
            </button>
          </div>

          {/* Night Summary Card */}
          {summary ? (
            <div className="rounded-2xl border border-cream/10 bg-white/[0.02] p-5 space-y-3">
              <h3 className="font-display text-sm font-bold text-cream flex items-center gap-2">
                <Sparkles className="size-4 text-amber" />
                Resumen de la Noche
              </h3>

              <div className="grid grid-cols-2 gap-2 text-center pt-1">
                <div className="rounded-xl border border-cream/5 bg-black/20 p-2.5">
                  <p className="font-display text-lg font-bold text-amber">
                    {summary.votesCount}
                  </p>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-cream/40">
                    Votos
                  </p>
                </div>
                <div className="rounded-xl border border-cream/5 bg-black/20 p-2.5">
                  <p className="font-display text-lg font-bold text-mint">
                    {summary.codesRedeemed} / {summary.codesGenerated}
                  </p>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-cream/40">
                    Canjes
                  </p>
                </div>
              </div>

              {summary.topTracks.length > 0 ? (
                <div className="border-t border-cream/5 pt-2">
                  <p className="font-mono text-[9px] uppercase tracking-wider text-cream/40 mb-1.5">
                    Más votados
                  </p>
                  <ul className="space-y-1 text-xs">
                    {summary.topTracks.slice(0, 3).map((track, i) => (
                      <li key={i} className="flex justify-between text-cream/70">
                        <span className="truncate">{track.title}</span>
                        <span className="font-mono text-amber font-bold shrink-0 ml-2">
                          {track.votes}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

