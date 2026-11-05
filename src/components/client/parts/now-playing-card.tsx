"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Music2 } from "lucide-react";
import type { QueueItemView } from "@/lib/api/contracts";

interface NowPlayingCardProps {
  item: QueueItemView | null;
  slug?: string;
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function NowPlayingCard({ item, slug }: NowPlayingCardProps) {
  const [elapsed, setElapsed] = useState(0);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isLiveSynced, setIsLiveSynced] = useState(false);

  // Reset counters when track changes
  useEffect(() => {
    setElapsed(0);
    setVideoDuration(item?.durationSeconds ?? null);
    setIsPaused(false);
  }, [item?.id, item?.trackId, item?.durationSeconds]);

  // Realtime synchronization with TV player & Admin controls
  useEffect(() => {
    if (!slug) return;
    let active = true;
    let channel: import("@supabase/supabase-js").RealtimeChannel | null = null;

    void import("@/lib/api/supabase/browser").then(({ createBrowserSupabase }) => {
      if (!active) return;
      try {
        const supabase = createBrowserSupabase();
        const existing = supabase.getChannels().find(
          (c) => c.topic === `playback-control:${slug}` || c.topic === `realtime:playback-control:${slug}`
        );
        if (existing) {
          void supabase.removeChannel(existing);
        }

        channel = supabase
          .channel(`playback-control:${slug}`)
          .on(
            "broadcast",
            { event: "tv_playback_progress" },
            (msg: {
              payload?: {
                currentTime?: number;
                duration?: number;
                isPaused?: boolean;
                trackId?: string;
              };
            }) => {
              if (!active || !msg.payload) return;
              const { currentTime, duration: d, isPaused: p } = msg.payload;
              if (typeof currentTime === "number" && !isNaN(currentTime)) {
                setElapsed(Math.floor(currentTime));
                setIsLiveSynced(true);
              }
              if (typeof d === "number" && !isNaN(d) && d > 0) {
                setVideoDuration(Math.floor(d));
              }
              if (typeof p === "boolean") {
                setIsPaused(p);
              }
            },
          )
          .on(
            "broadcast",
            { event: "playback_command" },
            (msg: { payload?: { command?: string; payload?: Record<string, unknown> } }) => {
              if (!active) return;
              const cmd = msg.payload?.command;
              const p = msg.payload?.payload || {};
              if (cmd === "pause") setIsPaused(true);
              else if (cmd === "resume") setIsPaused(false);
              else if (cmd === "toggle_pause") setIsPaused((prev) => !prev);
              else if (cmd === "seek" && typeof p.seconds === "number") {
                setElapsed(Math.floor(p.seconds));
              } else if (cmd === "play_now") {
                setElapsed(0);
                setIsPaused(false);
              }
            },
          )
          .subscribe();
      } catch {
        // Safe fallback in test or SSR environments without Supabase credentials
      }
    });

    return () => {
      active = false;
      if (channel) {
        void import("@/lib/api/supabase/browser").then(({ createBrowserSupabase }) => {
          try {
            const supabase = createBrowserSupabase();
            void supabase.removeChannel(channel!);
          } catch {
            // Ignore in test or unconfigured env
          }
        });
      }
    };
  }, [slug]);

  // Smooth local ticker between 1s TV progress broadcasts
  useEffect(() => {
    if (!item) return;
    if (isPaused) return;

    const timer = setInterval(() => {
      setElapsed((prev) => {
        const maxDur = videoDuration ?? item.durationSeconds ?? 210;
        if (prev >= maxDur) return maxDur;
        return prev + 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [item, isPaused, videoDuration]);

  if (!item) {
    return (
      <section className="relative bg-gradient-to-b from-[#161C2E] to-[#121626] rounded-2xl border border-[#232B42] p-4 sm:p-5 shadow-2xl overflow-hidden glow-indigo">
        <div className="absolute -top-16 -right-16 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-center justify-between mb-3 relative z-10">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-[#181b25] text-slate-400 border border-[#232b42] font-mono text-[10px] font-bold tracking-widest flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
              FONDO
            </span>
            <span className="font-mono text-[11px] text-slate-400 uppercase tracking-wide">
              Playlist del Bar
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 my-2 relative z-10">
          <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-slate-800/60 border border-slate-700/40 text-slate-400 shadow-inner">
            <Music2 className="size-7" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-white tracking-tight">
              Playlist del local en curso
            </h2>
            <p className="mt-1 text-xs text-slate-400 leading-relaxed">
              Votá una canción de la cola o proponé una nueva para que empiece a sonar.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const duration = item.durationSeconds ?? 210;
  const progressPercent = Math.min(100, Math.max(5, (elapsed / duration) * 100));

  return (
    <section className="relative bg-gradient-to-b from-[#161C2E] to-[#121626] rounded-2xl border border-[#232B42] p-4 sm:p-5 shadow-2xl overflow-hidden glow-indigo">
      {/* Ambient backdrop glow */}
      <div className="absolute -top-16 -right-16 w-48 h-48 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />

      {/* Header Row */}
      <div className="flex items-center justify-between mb-3 relative z-10">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30 font-mono text-[10px] font-bold tracking-widest flex items-center gap-1.5 glow-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            ON AIR
          </span>
          <span className="font-mono text-[11px] text-slate-400 uppercase tracking-wide">
            Sonando Ahora
          </span>
        </div>

        {/* Total Votes Pill Badge */}
        <div className="flex items-center gap-1 bg-[#0D1220]/90 px-2.5 py-0.5 rounded-full border border-[#1E2538] shadow-sm">
          <span className="material-symbols-outlined text-amber-400 text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            local_fire_department
          </span>
          <span className="font-mono text-xs text-indigo-200 font-bold">
            {(item.voteCount >= 9999 || item.voteCount === 0) ? "⭐ Selección Bar" : `${item.voteCount} ${item.voteCount === 1 ? "voto" : "votos"}`}
          </span>
        </div>
      </div>

      {/* Song Metadata and Sleeve Presentation */}
      <div className="flex items-center gap-3.5 my-3 relative z-10">
        {/* Vinyl & Cover Setup */}
        <div className="relative w-20 h-20 flex-shrink-0">
          {/* Vinyl Record Grooves */}
          <div className="absolute top-0 right-0 w-20 h-20 rounded-full bg-[#0a0a0f] border border-slate-700/50 flex items-center justify-center rotate-vinyl shadow-md">
            <div className="w-16 h-16 rounded-full border border-slate-800/90 flex items-center justify-center">
              <div className="w-11 h-11 rounded-full border border-slate-800/60 flex items-center justify-center">
                <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-[#090D16]" />
                </div>
              </div>
            </div>
          </div>

          {/* Album Cover Front */}
          <div className="absolute inset-y-0 left-0 w-16 h-20 rounded-xl overflow-hidden border border-white/10 shadow-xl bg-slate-900 z-10 flex items-center justify-center">
            {item.thumbnailUrl ? (
              <Image
                src={item.thumbnailUrl}
                alt={item.title}
                width={64}
                height={80}
                className="w-full h-full object-cover"
                unoptimized
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-indigo-900 to-slate-900 flex items-center justify-center text-indigo-300">
                <Music2 className="size-6" />
              </div>
            )}
          </div>
        </div>

        {/* Track Details */}
        <div className="flex-1 min-w-0 pr-1">
          <h2 className="text-lg font-bold text-white truncate tracking-tight">
            {item.title}
          </h2>
          <p className="text-sm text-slate-300 truncate font-medium mt-0.5">
            {item.artist}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className="material-symbols-outlined text-indigo-400 text-[14px]">
              table_restaurant
            </span>
            <span className="font-mono text-[11px] text-slate-400 font-medium">
              Pedido por{" "}
              <strong className="text-white font-semibold">
                {item.guestName ? `🎉 ${item.guestName}` : "Salón Principal"}
              </strong>
            </span>
            {item.isKaraoke && (
              <span className="px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-200 border border-pink-400/40 font-mono text-[9px] uppercase font-bold">
                🎤 Karaoke
              </span>
            )}
          </div>
          {item.dedication && (
            <p className="mt-1.5 text-[11px] text-fuchsia-200 bg-fuchsia-950/40 border border-fuchsia-500/30 rounded-lg px-2 py-1 truncate">
              💬 &ldquo;{item.dedication}&rdquo;
            </p>
          )}
        </div>
      </div>

      {/* Progress Bar & Elapsed Time */}
      <div className="space-y-1.5 mt-3 pt-2.5 border-t border-[#1E2538]/80 relative z-10">
        <div className="w-full bg-[#0A0E1A] h-2 rounded-full overflow-hidden p-0.5 border border-[#1E2538]">
          <div
            className="bg-gradient-to-r from-indigo-500 via-indigo-400 to-violet-400 h-full rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(99,102,241,0.6)]"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex justify-between items-center font-mono text-xs text-slate-400">
          <span>{formatDuration(elapsed)}</span>
          <span className="flex items-center gap-1 text-indigo-400 font-semibold text-[11px]">
            <span className="material-symbols-outlined text-[13px]">
              {isPaused ? "pause" : "graphic_eq"}
            </span>
            {isPaused ? "En Pausa" : isLiveSynced ? "Sincronizado" : "En Vivo"}
          </span>
          <span>{formatDuration(duration)}</span>
        </div>
      </div>
    </section>
  );
}
