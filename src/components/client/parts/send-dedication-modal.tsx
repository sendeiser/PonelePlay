"use client";

import React, { useState } from "react";
import { MessageSquareHeart, Sparkles, X, Send, Heart, PartyPopper } from "lucide-react";

interface SendDedicationModalProps {
  isOpen: boolean;
  slug: string;
  defaultGuestName?: string;
  nowPlayingTitle?: string | null;
  onClose: () => void;
  onSuccess: (dedication: string) => void;
  onNotify: (msg: string, type?: "success" | "error" | "info") => void;
}

const QUICK_EMOJIS = ["🎉", "🎂", "❤️", "🔥", "🥂", "🎵", "✨", "🥳"];

export function SendDedicationModal({
  isOpen,
  slug,
  defaultGuestName = "",
  nowPlayingTitle,
  onClose,
  onSuccess,
  onNotify,
}: SendDedicationModalProps) {
  const [guestName, setGuestName] = useState(() => {
    if (defaultGuestName) return defaultGuestName;
    if (typeof window !== "undefined") {
      return localStorage.getItem(`poneleplay.guestName.${slug}`) || "";
    }
    return "";
  });
  const [dedication, setDedication] = useState("");
  const [sending, setSending] = useState(false);

  if (!isOpen) return null;

  const handleAddEmoji = (emoji: string) => {
    if ((dedication + emoji).length <= 90) {
      setDedication((prev) => prev + emoji);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanDed = dedication.trim();
    if (!cleanDed) {
      onNotify("Por favor escribí un mensaje para dedicar", "error");
      return;
    }

    setSending(true);
    try {
      if (typeof window !== "undefined" && guestName.trim()) {
        localStorage.setItem(`poneleplay.guestName.${slug}`, guestName.trim());
      }

      const res = await fetch("/api/party/dedicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          guestName: guestName.trim() || undefined,
          dedication: cleanDed,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "No se pudo enviar la dedicatoria");
      }

      onNotify("¡Dedicatoria enviada! Aparecerá en vivo en la pantalla 🎉", "success");
      onSuccess(cleanDed);
      setDedication("");
      onClose();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Error al enviar", "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-md animate-fade-in select-none">
      <div className="card-panel relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-th-border bg-th-shell">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-th-accent flex items-center justify-center text-th-on-accent shadow-xs">
              <MessageSquareHeart className="size-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-th-text tracking-tight flex items-center gap-1.5">
                <span>Enviar Dedicatoria a la TV</span>
                <Sparkles className="size-3.5 text-th-accent" />
              </h2>
              <p className="text-[11px] text-th-muted">
                Se mostrará cruzando la pantalla del salón en vivo
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="size-8 rounded-full bg-th-recessed hover:bg-th-card border border-th-border text-th-muted hover:text-th-text flex items-center justify-center transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4 overflow-y-auto ui-scroll-container">
          {nowPlayingTitle && (
            <div className="px-3.5 py-2.5 rounded-xl bg-th-accent-soft border border-th-accent/25 flex items-center gap-2 text-xs text-th-secondary">
              <PartyPopper className="size-4 text-th-accent shrink-0" />
              <div className="truncate">
                <span className="font-semibold text-th-muted">Sonando ahora: </span>
                <span className="font-bold text-th-text">{nowPlayingTitle}</span>
              </div>
            </div>
          )}

          {/* Guest Name input */}
          <div>
            <label className="ui-label">
              Tu nombre o apodo (opcional)
            </label>
            <input
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value.slice(0, 40))}
              placeholder="Ej: Franco, Los pibes de la mesa 4..."
              className="ui-input text-sm"
            />
          </div>

          {/* Dedication Text input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="ui-label mb-0">
                Tu mensaje de dedicatoria
              </label>
              <span className={`text-[11px] font-mono font-bold tabular-nums ${dedication.length >= 85 ? "text-th-amber" : "text-th-muted"}`}>
                {dedication.length}/90
              </span>
            </div>
            <textarea
              rows={3}
              value={dedication}
              onChange={(e) => setDedication(e.target.value.slice(0, 90))}
              placeholder="¡Feliz cumpleaños Sofi! Te amamos, que la pases increíble esta noche 🎂🎉"
              className="ui-input p-3.5 text-sm resize-none"
            />

            {/* Quick emoji pills */}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <span className="text-[10px] font-mono text-th-muted mr-1 flex items-center gap-0.5">
                <Heart className="size-3 text-th-accent" /> Emojis:
              </span>
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleAddEmoji(emoji)}
                  className="px-2 py-0.5 rounded-lg bg-th-recessed hover:bg-th-card border border-th-border text-sm hover:scale-110 active:scale-95 transition-all"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Live Preview on Screen (TV stage stays dark) */}
          <div className="rounded-xl bg-[#090d16] border border-[#232b42] p-3 shadow-inner">
            <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
              <span>Vista previa en la pantalla de la TV:</span>
            </div>
            <div className="text-xs text-white font-medium italic truncate">
              💬 &ldquo;{dedication || "Tu dedicatoria aparecerá aquí cruzando la pantalla en grande..."}&rdquo;
            </div>
            {guestName.trim() && (
              <div className="text-[10px] font-mono text-sky-300 mt-1">
                — {guestName.trim()}
              </div>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={sending || !dedication.trim()}
            className="w-full mt-1 py-3 px-4 rounded-xl bg-th-accent hover:bg-th-accent-hover text-th-on-accent font-bold text-sm shadow-sm active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {sending ? (
              <span>Enviando dedicatoria...</span>
            ) : (
              <>
                <Send className="size-4" />
                <span>Enviar Dedicatoria a la TV</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

