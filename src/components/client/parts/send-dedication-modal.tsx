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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in select-none">
      <div className="relative w-full max-w-lg bg-[#0E121E] border border-[#232B42] rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E2333] bg-[#0A0E17]/90">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-pink-500/25">
              <MessageSquareHeart className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
                <span>Enviar Dedicatoria a la TV</span>
                <Sparkles className="size-3.5 text-pink-400 animate-pulse" />
              </h2>
              <p className="text-[11px] text-slate-400">
                Se mostrará cruzando la pantalla del salón en vivo
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="size-8 rounded-full bg-[#1A2030] hover:bg-[#252E46] text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4 overflow-y-auto">
          {nowPlayingTitle && (
            <div className="px-3.5 py-2 rounded-xl bg-indigo-950/40 border border-indigo-500/30 flex items-center gap-2 text-xs text-indigo-200">
              <PartyPopper className="size-4 text-indigo-400 shrink-0" />
              <div className="truncate">
                <span className="font-semibold text-slate-400">Sonando ahora: </span>
                <span className="font-bold text-white">{nowPlayingTitle}</span>
              </div>
            </div>
          )}

          {/* Guest Name input */}
          <div>
            <label className="block text-xs font-mono font-bold text-slate-300 mb-1.5">
              TU NOMBRE O APODO (OPCIONAL)
            </label>
            <input
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value.slice(0, 40))}
              placeholder="Ej: Franco, Los pibes de la mesa 4..."
              className="w-full bg-[#141A2E] border border-[#232F4E] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-pink-500/70 transition-colors"
            />
          </div>

          {/* Dedication Text input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-mono font-bold text-slate-300">
                TU MENSAJE DE DEDICATORIA
              </label>
              <span className={`text-[11px] font-mono font-bold ${dedication.length >= 85 ? "text-amber-400" : "text-slate-400"}`}>
                {dedication.length}/90
              </span>
            </div>
            <textarea
              rows={3}
              value={dedication}
              onChange={(e) => setDedication(e.target.value.slice(0, 90))}
              placeholder="¡Feliz cumpleaños Sofi! Te amamos, que la pases increíble esta noche 🎂🎉"
              className="w-full bg-[#141A2E] border border-[#232F4E] rounded-xl p-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-pink-500/70 transition-colors resize-none"
            />

            {/* Quick emoji pills */}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <span className="text-[10px] font-mono text-slate-400 mr-1 flex items-center gap-0.5">
                <Heart className="size-3 text-pink-400" /> Emojis:
              </span>
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleAddEmoji(emoji)}
                  className="px-2 py-0.5 rounded-lg bg-[#182036] hover:bg-[#222C4A] border border-[#263252] text-sm hover:scale-110 active:scale-95 transition-all"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Live Preview on Screen */}
          <div className="rounded-xl bg-gradient-to-r from-purple-950/70 via-pink-950/70 to-purple-950/70 border border-pink-500/40 p-3 shadow-inner">
            <div className="text-[10px] font-mono font-bold text-pink-300 uppercase tracking-wider mb-1 flex items-center gap-1">
              <span>Vista previa en la pantalla de la TV:</span>
            </div>
            <div className="text-xs text-white font-medium italic truncate">
              💬 &ldquo;{dedication || "Tu dedicatoria aparecerá aquí cruzando la pantalla en grande..."}&rdquo;
            </div>
            {guestName.trim() && (
              <div className="text-[10px] font-mono text-pink-300 mt-1">
                — {guestName.trim()}
              </div>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={sending || !dedication.trim()}
            className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-pink-600 via-fuchsia-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-pink-600/30 active:scale-98 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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

