"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Music2, SkipForward } from "lucide-react";
import type { QueueItemView } from "@/lib/api/contracts";
import type { PartySkipVoteState } from "@/lib/domain/party";
import { acquireSyncClient, releaseSyncClient } from "@/lib/sync/client";
import { computeTargetPositionSec, type PlaybackAnchor } from "@/lib/sync/protocol";

interface NowPlayingCardProps {
  item: QueueItemView | null;
  slug?: string;
  skipVoteEnabled?: boolean;
  skipVotesThreshold?: number;
  activeSkipVote?: PartySkipVoteState | null;
  hasVotedSkip?: boolean;
  skipPending?: boolean;
  onVoteSkip?: () => void;
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function NowPlayingCard({
  item,
  slug,
  skipVoteEnabled = true,
  skipVotesThreshold = 3,
  activeSkipVote,
  hasVotedSkip = false,
  skipPending = false,
  onVoteSkip,
}: NowPlayingCardProps) {
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
    const syncClient = acquireSyncClient({ slug, role: "client" });

    const applyAnchor = (anchor: PlaybackAnchor) => {
      if (!active) return;
      const pos = computeTargetPositionSec(anchor, syncClient.estimatedServerMs());
      setElapsed(Math.floor(pos));
      if (anchor.track?.durationSeconds && anchor.track.durationSeconds > 0) {
        setVideoDuration(Math.floor(anchor.track.durationSeconds));
      }
      setIsPaused(anchor.isPaused);
      setIsLiveSynced(true);
    };

    if (syncClient.hasTargetsConfigured()) {
      const latest = syncClient.getLatestSnapshot();
      if (latest?.anchor) applyAnchor(latest.anchor);

      const unsubAnchor = syncClient.on("sync:anchor", ({ anchor }) => {
        applyAnchor(anchor);
      });
      const unsubGo = syncClient.on("sync:go", ({ anchor }) => {
        applyAnchor(anchor);
      });
      const unsubSnap = syncClient.on("room:snapshot", ({ snapshot }) => {
        applyAnchor(snapshot.anchor);
      });

      return () => {
        active = false;
        unsubAnchor();
        unsubGo();
        unsubSnap();
        releaseSyncClient(syncClient);
      };
    }

    releaseSyncClient(syncClient);
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
    <section className="card-panel relative rounded-2xl p-4 sm:p-5 overflow-hidden">
      {/* Header Row */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="px-2 py-0.5 rounded-full bg-th-danger-soft text-th-danger border border-th-danger/30 font-mono text-[10px] font-bold tracking-widest flex items-center gap-1.5 whitespace-nowrap shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-th-danger animate-pulse" />
            ON AIR
          </span>
          <span className="font-mono text-[11px] text-th-muted uppercase tracking-wide whitespace-nowrap truncate">
            Sonando Ahora
          </span>
        </div>

        {/* Total Votes Pill Badge */}
        <div className="flex items-center gap-1 bg-th-recessed px-2.5 py-0.5 rounded-full border border-th-border shrink-0">
          <span className="material-symbols-outlined text-th-amber text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            local_fire_department
          </span>
          <span className="font-mono text-xs text-th-text font-bold tabular-nums whitespace-nowrap">
            {(item.voteCount >= 9999 || item.voteCount === 0) ? "Selección Bar" : `${item.voteCount} ${item.voteCount === 1 ? "voto" : "votos"}`}
          </span>
        </div>
      </div>

      {/* Song Metadata and Sleeve Presentation */}
      <div className="flex items-center gap-3.5 my-3">
        {/* Vinyl & Cover Setup */}
        <div className="relative w-20 h-20 flex-shrink-0">
          {/* Vinyl Record Grooves (intentional dark disc) */}
          <div className="absolute top-0 right-0 w-20 h-20 rounded-full bg-[#0f172a] border border-slate-700/60 flex items-center justify-center rotate-vinyl shadow-md">
            <div className="w-16 h-16 rounded-full border border-slate-700/80 flex items-center justify-center">
              <div className="w-11 h-11 rounded-full border border-slate-700/60 flex items-center justify-center">
                <div className="w-6 h-6 rounded-full bg-th-accent flex items-center justify-center shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-slate-950" />
                </div>
              </div>
            </div>
          </div>

          {/* Album Cover Front */}
          <div className="absolute inset-y-0 left-0 w-16 h-20 rounded-xl overflow-hidden border border-th-border-strong shadow-md bg-slate-900 z-10 flex items-center justify-center">
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
              <div className="w-full h-full bg-th-accent-soft flex items-center justify-center text-th-accent">
                <Music2 className="size-6" />
              </div>
            )}
          </div>
        </div>

        {/* Track Details */}
        <div className="flex-1 min-w-0 pr-1">
          <h2 className="font-display text-lg font-bold text-th-text truncate tracking-tight">
            {item.title}
          </h2>
          <p className="text-sm text-th-secondary truncate font-medium mt-0.5">
            {item.artist}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className="material-symbols-outlined text-th-accent text-[14px]">
              table_restaurant
            </span>
            <span className="font-mono text-[11px] text-th-muted font-medium">
              Pedido por{" "}
              <strong className="text-th-text font-semibold">
                {item.guestName ? `🎉 ${item.guestName}` : "Salón Principal"}
              </strong>
            </span>
            {item.isKaraoke && (
              <span className="px-1.5 py-0.5 rounded bg-th-accent-soft text-th-accent border border-th-accent/30 font-mono text-[9px] uppercase font-bold">
                🎤 Karaoke
              </span>
            )}
          </div>
          {item.dedication && (
            <p className="mt-1.5 text-[11px] text-th-accent bg-th-accent-soft border border-th-accent/25 rounded-lg px-2 py-1 truncate">
              💬 &ldquo;{item.dedication}&rdquo;
            </p>
          )}
        </div>
      </div>

      {/* Progress Bar & Elapsed Time */}
      <div className="space-y-1.5 mt-3 pt-2.5 border-t border-th-border">
        <div className="w-full bg-th-recessed h-2 rounded-full overflow-hidden p-0.5 border border-th-border">
          <div
            className="bg-th-accent h-full rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex justify-between items-center font-mono text-xs text-th-muted tabular-nums">
          <span>{formatDuration(elapsed)}</span>
          <span className="flex items-center gap-1 text-th-teal font-semibold text-[11px]">
            <span className="material-symbols-outlined text-[13px]">
              {isPaused ? "pause" : "graphic_eq"}
            </span>
            {isPaused ? "En Pausa" : isLiveSynced ? "Sincronizado" : "En Vivo"}
          </span>
          <span>{formatDuration(duration)}</span>
        </div>

        {/* Vote-to-Skip Live Section */}
        {skipVoteEnabled && onVoteSkip && (
          <div className="pt-2.5 mt-2 border-t border-th-border">
            {(() => {
              const currentKey = item.trackId || item.id;
              const isMatchingSkip =
                activeSkipVote &&
                (activeSkipVote.trackId === currentKey ||
                  activeSkipVote.trackId === item.id ||
                  activeSkipVote.title === item.title);
              const votes = isMatchingSkip ? activeSkipVote.votes : 0;
              const threshold = Math.max(
                1,
                isMatchingSkip ? activeSkipVote.threshold : skipVotesThreshold,
              );
              const skipPct = Math.min(100, Math.round((votes / threshold) * 100));

              return (
                <div className="rounded-xl bg-th-recessed border border-th-danger/30 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="block font-mono text-[11px] font-bold text-th-danger truncate">
                        {votes > 0
                          ? `🗳️ Votación para cambiar tema: ${votes}/${threshold}`
                          : "⏭️ ¿Querés cambiar la canción actual?"}
                      </span>
                      <span className="block text-[10px] text-th-muted">
                        {votes > 0
                          ? `Con ${threshold} votos pasa automáticamente al siguiente tema`
                          : `Iniciá una votación en vivo (${threshold} votos para saltar)`}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={skipPending || hasVotedSkip}
                      onClick={onVoteSkip}
                      className={`shrink-0 px-3 py-1.5 rounded-lg font-mono text-[11px] font-extrabold flex items-center gap-1.5 transition-all active:scale-95 ${
                        hasVotedSkip
                          ? "bg-th-emerald-soft text-th-emerald border border-th-emerald/35 cursor-default"
                          : "bg-th-danger hover:brightness-105 text-white shadow-xs"
                      }`}
                    >
                      <SkipForward className="size-3.5" />
                      <span>
                        {hasVotedSkip
                          ? "✓ Votado"
                          : votes > 0
                          ? "+1 Cambiar"
                          : "Iniciar Votación"}
                      </span>
                    </button>
                  </div>
                  {votes > 0 && (
                    <div className="w-full h-1.5 rounded-full bg-th-card overflow-hidden border border-th-border">
                      <div
                        className="h-full bg-th-danger transition-all duration-300"
                        style={{ width: `${skipPct}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </section>
  );
}
