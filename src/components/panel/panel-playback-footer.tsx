"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Image from "next/image";
import {
  Mic,
  Music2,
  Pause,
  Play,
  RotateCcw,
  Search,
  SkipForward,
  Volume2,
  VolumeX,
  ArrowUp,
  ChevronUp,
  Flame,
  ListMusic,
  PlayCircle,
  Plus,
  Sparkles,
  Trash2,
  Tv,
  X,
} from "lucide-react";
import { createNightStateSource } from "@/lib/api/night-state";
import { useNightState } from "@/hooks/use-night-state";
import { partitionQueueAndProposals } from "@/lib/domain/queue";
import {
  DEFAULT_BAR_PARTY_CONFIG,
  resolveEffectiveQueueThreshold,
  type PartyConfig,
} from "@/lib/domain/party";
import { getStoredPartyConfig } from "@/lib/api/party-control";
import { vetoItem } from "@/lib/api/panel-actions";
import { castVote } from "@/lib/api/votes";
import type { QueueItemView } from "@/lib/api/contracts";
import type { PlayerTrack } from "@/lib/api/player";
import { fetchFallback } from "@/lib/api/catalog";
import { updateTvDeviceDisplay } from "@/lib/api/tv-pairing";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  fetchPlaybackState,
  pausePlayback,
  resumePlayback,
  setPlaybackVolume,
  mutePlayback,
  unmutePlayback,
  skipPlayback,
  seekPlayback,
  setKaraokeMode as setKmRemote,
  sendPlaybackCommand,
} from "@/lib/api/master-control";
import { ManualPlaybackModal } from "./manual-playback-modal";
import { TvDevicesManagerModal } from "./tv-devices-manager-modal";
import { PanelAudioEngine, type PanelAudioEngineRef } from "./panel-audio-engine";

interface PanelPlaybackFooterProps {
  slug: string;
  isSidebarCollapsed?: boolean;
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/** Real audio identity of a track (video id / file), independent of queue item ids. */
function trackAudioKey(t: PlayerTrack | null | undefined): string {
  if (!t) return "";
  return String(t.youtubeVideoId || t.storagePath || t.trackId || t.itemId || "");
}

export function PanelPlaybackFooter({
  slug,
  isSidebarCollapsed = false,
}: PanelPlaybackFooterProps) {
  const [currentTrack, setCurrentTrack] = useState<PlayerTrack | null>(null);
  const [fallbackTracks, setFallbackTracks] = useState<PlayerTrack[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [volume, setVolume] = useState(85);
  const [isMuted, setIsMuted] = useState(false);
  const [tvMuted, setTvMuted] = useState(false);
  const [karaokeMode, setKaraokeMode] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [initialSyncDone, setInitialSyncDone] = useState(false);

  // Modals
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [tvManagerOpen, setTvManagerOpen] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  // Expandable Queue & Remote Deck Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"queue" | "candidates">("queue");
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const audioEngineRef = useRef<PanelAudioEngineRef>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const currentTrackRef = useRef<PlayerTrack | null>(currentTrack);
  currentTrackRef.current = currentTrack;
  const lastProgressBroadcastRef = useRef<number>(0);
  const isSkippingRef = useRef(false);
  const hasPreloadedRef = useRef(false);
  const [isAudioBlocked, setIsAudioBlocked] = useState(false);

  const nightSource = useMemo(() => createNightStateSource(slug), [slug]);
  const { state: nightState, loading: nightLoading, refresh: refreshNightState } = useNightState(nightSource);

  // Load venue fallback tracks so cabina and TV always have music playing
  useEffect(() => {
    let active = true;
    async function loadFallback() {
      try {
        const { createBrowserSupabase } = await import("@/lib/api/supabase/browser");
        const supabase = createBrowserSupabase();
        const { data: vData } = await supabase
          .from("venues")
          .select("id")
          .eq("slug", slug)
          .single();
        if (vData && typeof vData === "object" && "id" in vData && active) {
          const venueId = (vData as { id: string }).id;
          const fbs = await fetchFallback(venueId);
          if (active && fbs.length > 0) {
            setFallbackTracks(
              fbs
                .filter((tr) => Boolean(tr.youtubeVideoId))
                .map((tr) => ({
                  itemId: `fb-${tr.id}`,
                  trackId: tr.id,
                  title: tr.title,
                  artist: tr.artist,
                  source: tr.source,
                  durationSeconds: tr.durationSeconds ?? 210,
                  youtubeVideoId: tr.youtubeVideoId ?? undefined,
                  thumbnailUrl: tr.thumbnailUrl ?? null,
                  voteCount: 0,
                }))
            );
          }
        }
      } catch {
        // Fallback
      }
    }
    void loadFallback();
    return () => {
      active = false;
    };
  }, [slug]);

  const [partyConfig, setPartyConfig] = useState<PartyConfig>(DEFAULT_BAR_PARTY_CONFIG);

  useEffect(() => {
    setPartyConfig(getStoredPartyConfig(slug, nightState?.settings?.partyConfig));
    const onPartyChange = (e: Event) => {
      const detail = (e as CustomEvent<{ slug?: string; config?: PartyConfig }>).detail;
      if (!detail?.slug || detail.slug === slug) {
        setPartyConfig(detail?.config ?? getStoredPartyConfig(slug, nightState?.settings?.partyConfig));
      }
    };
    window.addEventListener("poneleplay:party-config-changed", onPartyChange);
    return () => window.removeEventListener("poneleplay:party-config-changed", onPartyChange);
  }, [slug, nightState?.settings?.partyConfig]);

  const effectiveThreshold = useMemo(
    () => resolveEffectiveQueueThreshold(partyConfig),
    [partyConfig],
  );

  const { activeQueue, candidateProposals } = useMemo(() => {
    return partitionQueueAndProposals(
      nightState?.queue ?? [],
      nightState?.candidates ?? [],
      effectiveThreshold,
    );
  }, [nightState?.queue, nightState?.candidates, effectiveThreshold]);

  const effectiveFallbackTracks: PlayerTrack[] = useMemo(() => {
    return fallbackTracks;
  }, [fallbackTracks]);

  // ---------------------------------------------------------------------------
  // SINGLE SOURCE OF TRUTH FOR THE CABINA TRACK
  // The Cabina is the master. Any local track change (skip / play now) takes a
  // short "lock" so that stale echoes from the server (nightState refresh,
  // postgres_changes, loadState) can NEVER revert the audio to the previous song.
  // Tracks are compared by the real audio identity (video id / file), not by
  // itemId, because the server uses different ids (queue uuid vs "manual-…").
  // ---------------------------------------------------------------------------
  const localTrackLockRef = useRef<{ key: string; until: number } | null>(null);
  const lastLiveKeyRef = useRef<string>("");
  const lastCommandSeqRef = useRef<number>(0);

  const setLocalTrack = useCallback((track: PlayerTrack) => {
    localTrackLockRef.current = { key: trackAudioKey(track), until: Date.now() + 12000 };
    currentTrackRef.current = track;
    setCurrentTrack(track);
  }, []);

  const applyExternalTrack = useCallback((track: PlayerTrack | null | undefined) => {
    if (!track) return;
    const key = trackAudioKey(track);
    if (!key) return;
    const lock = localTrackLockRef.current;
    // Ignore stale echoes of a different song while the local change is fresh
    if (lock && Date.now() < lock.until && key !== lock.key) return;
    const cur = currentTrackRef.current;
    // Same audio already playing: never reload / restart it
    if (cur && trackAudioKey(cur) === key) return;
    currentTrackRef.current = track;
    setCurrentTrack(track);
  }, []);

  // Synchronize currentTrack with nightState, queue, or fallback tracks
  useEffect(() => {
    if (nightState?.nowPlaying) {
      const live = nightState.nowPlaying;
      const liveTrack: PlayerTrack = {
        itemId: live.id,
        trackId: live.trackId,
        title: live.title,
        artist: live.artist,
        source: live.source,
        durationSeconds: live.durationSeconds ?? 210,
        youtubeVideoId: live.youtubeVideoId || undefined,
        thumbnailUrl: live.thumbnailUrl ?? null,
        voteCount: live.voteCount,
        guestName: live.guestName ?? null,
        dedication: live.dedication ?? null,
        isKaraoke: live.isKaraoke ?? false,
      };
      // Only react when the SERVER's now-playing actually changes (transition),
      // never re-apply it just because the local track changed.
      const liveKey = trackAudioKey(liveTrack);
      if (liveKey && liveKey !== lastLiveKeyRef.current) {
        lastLiveKeyRef.current = liveKey;
        applyExternalTrack(liveTrack);
      }
      return;
    }

    // Do NOT pick a fallback track before initial server playback state and nightState have resolved
    if (!initialSyncDone || nightLoading) {
      return;
    }

    if (!currentTrack) {
      if (activeQueue.length > 0) {
        const nextFromQueue: PlayerTrack = {
          itemId: activeQueue[0].id,
          trackId: activeQueue[0].trackId,
          title: activeQueue[0].title,
          artist: activeQueue[0].artist,
          source: activeQueue[0].source || "youtube",
          durationSeconds: activeQueue[0].durationSeconds ?? 210,
          youtubeVideoId: activeQueue[0].youtubeVideoId || undefined,
          thumbnailUrl: activeQueue[0].thumbnailUrl ?? null,
          voteCount: activeQueue[0].voteCount,
          guestName: activeQueue[0].guestName ?? null,
          dedication: activeQueue[0].dedication ?? null,
          isKaraoke: activeQueue[0].isKaraoke ?? false,
        };
        setCurrentTrack(nextFromQueue);
        void sendPlaybackCommand(slug, "play_now", { track: nextFromQueue }).catch(() => {});
      } else if (effectiveFallbackTracks.length > 0) {
        setCurrentTrack(effectiveFallbackTracks[0]);
      }
    }
  }, [currentTrack, nightState?.nowPlaying, activeQueue, effectiveFallbackTracks, applyExternalTrack, initialSyncDone, nightLoading, slug]);

  // Drawer Actions: Play now, Veto, Boost vote
  const handlePlayQueueItemNow = async (item: QueueItemView) => {
    setPendingActionId(item.id);
    try {
      const selectedTrack = {
        itemId: item.id,
        trackId: item.trackId,
        title: item.title,
        artist: item.artist,
        youtubeVideoId: item.youtubeVideoId,
        thumbnailUrl: item.thumbnailUrl,
        durationSeconds: item.durationSeconds,
        source: item.source || "youtube",
        voteCount: item.voteCount,
        guestName: item.guestName ?? null,
        dedication: item.dedication ?? null,
        isKaraoke: item.isKaraoke ?? false,
      };
      setIsPaused(false);
      setElapsed(0);
      setVideoDuration(null);
      setLocalTrack(selectedTrack as PlayerTrack);
      audioEngineRef.current?.unlockAudio();
      broadcastControl("play_now", { track: selectedTrack });
      await sendPlaybackCommand(slug, "play_now", {
        track: selectedTrack,
      });
      showToast(`Poniendo en TV: "${item.title}"`);
      await refreshNightState();
      await loadState();
    } catch {
      showToast("Error al reproducir en TV");
    } finally {
      setPendingActionId(null);
    }
  };

  const handleVetoQueueItem = async (item: QueueItemView) => {
    setPendingActionId(item.id);
    try {
      await vetoItem(item.id);
      showToast(`Tema quitado de la cola: "${item.title}"`);
      await refreshNightState();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Error al quitar tema");
    } finally {
      setPendingActionId(null);
    }
  };

  const handleBoostQueueItem = async (item: QueueItemView) => {
    setPendingActionId(item.id);
    try {
      await castVote(item.id, slug);
      showToast(`+1 voto sumado para "${item.title}"`);
      await refreshNightState();
    } catch {
      showToast("Error al sumar voto");
    } finally {
      setPendingActionId(null);
    }
  };

  const showToast = useCallback((msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => setFeedbackToast(null), 2500);
  }, []);

  // 1. Initial State Sync
  const loadState = useCallback(async () => {
    try {
      // First check /api/tv/${slug} for authoritative server state (nowPlaying, positionSeconds, tvMuted, partyConfig)
      try {
        const tvRes = await fetch(`/api/tv/${encodeURIComponent(slug)}`, { cache: "no-store" });
        if (tvRes.ok) {
          const tvData = await tvRes.json();
          if (tvData?.ok) {
            if (typeof tvData.playback?.tvMuted === "boolean") {
              setTvMuted(tvData.playback.tvMuted);
            }
            if (tvData.nowPlaying && tvData.nowPlaying.title) {
              const np = tvData.nowPlaying;
              const restoredTrack: PlayerTrack = {
                itemId: String(np.id || "now"),
                trackId: String(np.trackId || np.id || "now"),
                title: String(np.title),
                artist: String(np.artist || "Artista"),
                source: "youtube",
                durationSeconds: Number(np.durationSeconds ?? 210),
                youtubeVideoId: np.youtubeVideoId || undefined,
                thumbnailUrl: np.thumbnailUrl ?? null,
                voteCount: Number(np.voteCount ?? 0),
                guestName: np.guestName ?? null,
                dedication: np.dedication ?? null,
                isKaraoke: Boolean(np.isKaraoke),
              };
              lastLiveKeyRef.current = trackAudioKey(restoredTrack);
              applyExternalTrack(restoredTrack);
              const pos = Number(tvData.playback?.positionSeconds ?? 0);
              if (pos > 0) {
                setElapsed(Math.floor(pos));
                setTimeout(() => audioEngineRef.current?.seekTo(Math.floor(pos)), 350);
              }
            }
          }
        }
      } catch {
        // Ignore and continue to RPC
      }

      const st = await fetchPlaybackState(slug);
      if (st.currentTrack) {
        lastLiveKeyRef.current = trackAudioKey(st.currentTrack);
        applyExternalTrack(st.currentTrack);
        const pos = Number((st.currentTrack as unknown as Record<string, unknown>).positionSeconds ?? 0);
        if (pos > 0) {
          setElapsed(Math.floor(pos));
          setTimeout(() => audioEngineRef.current?.seekTo(Math.floor(pos)), 350);
        }
      }
      setIsPaused(st.isPaused);
      setVolume(st.volume ?? 85);
      setIsMuted(st.isMuted ?? false);
      setKaraokeMode(st.karaokeMode ?? false);
    } catch {
      // Non-blocking fallback
    } finally {
      setInitialSyncDone(true);
    }
  }, [slug, applyExternalTrack]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  // 2. Realtime listener
  useEffect(() => {
    let active = true;
    let channel: import("@supabase/supabase-js").RealtimeChannel | null = null;

    void import("@/lib/api/supabase/browser").then(({ createBrowserSupabase }) => {
      if (!active) return;
      const supabase = createBrowserSupabase();

      const existing = supabase.getChannels().find(
        (c) =>
          c.topic === `realtime:playback-control:${slug}` ||
          c.topic === `playback-control:${slug}`,
      );
      if (existing) {
        void supabase.removeChannel(existing);
      }

      channel = supabase
        .channel(`playback-control:${slug}`)
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
            else if (cmd === "set_volume") {
              setVolume(Number(p.volume ?? 85));
              setIsMuted(false);
            } else if (cmd === "mute") setIsMuted(true);
            else if (cmd === "unmute") setIsMuted(false);
            else if (cmd === "toggle_mute") setIsMuted((prev) => !prev);
            else if (cmd === "set_tv_mute") setTvMuted(Boolean(p.tvMuted));
            else if (cmd === "set_karaoke_mode") setKaraokeMode(Boolean(p.enabled));
            else if (cmd === "seek" && typeof p.seconds === "number") {
              setElapsed(Math.floor(p.seconds));
            } else if (cmd === "play_now" && p.track) {
              // Explicit play command from another operator: authoritative
              const incoming = p.track as PlayerTrack;
              const cur = currentTrackRef.current;
              if (cur && trackAudioKey(cur) === trackAudioKey(incoming)) {
                setIsPaused(false);
                return;
              }
              lastLiveKeyRef.current = trackAudioKey(incoming);
              setLocalTrack(incoming);
              setIsPaused(false);
              setElapsed(0);
              setVideoDuration(null);
            }
          },
        )
        .on(
          "broadcast",
          { event: "party_event" },
          (msg: { payload?: Record<string, unknown> }) => {
            if (!active || !msg.payload) return;
            const p = msg.payload;
            if (p.type === "party_skip_vote_updated" && p.skipped) {
              const next = p.nextTrack as PlayerTrack | null | undefined;
              if (next && (next.youtubeVideoId || next.itemId)) {
                // The server already advanced the queue: just follow it (never skip twice)
                const nextKey = trackAudioKey(next);
                const cur = currentTrackRef.current;
                if (cur && trackAudioKey(cur) === nextKey) return;
                lastLiveKeyRef.current = nextKey;
                setLocalTrack(next);
                setIsPaused(false);
                setElapsed(0);
                setVideoDuration(null);
                showToast("⏭️ La sala votó cambiar la canción");
              } else {
                void handleSkipNextRef.current();
              }
            }
          },
        )
        .on(
          "broadcast",
          { event: "tv_playback_progress" },
          (msg: {
            payload?: {
              currentTime?: number;
              duration?: number;
              isPaused?: boolean;
              trackId?: string;
              isVideoFullscreen?: boolean;
              isFromAdminAudio?: boolean;
            };
          }) => {
            if (!active || !msg.payload) return;
            // The Cabina is the MASTER audio authority.
            // Under NO circumstance should loopback echo or external TV progress overwrite
            // Cabina's local elapsed slider or pause state!
            if (msg.payload.isFromAdminAudio) return;
            if (currentTrackRef.current) return;

            const { currentTime, duration: d, isPaused: p } = msg.payload;
            if (typeof currentTime === "number" && !isNaN(currentTime)) {
              setElapsed(Math.floor(currentTime));
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
          "postgres_changes",
          { event: "*", schema: "public", table: "venue_playback_state" },
          (payload: { new?: { is_paused?: boolean; volume?: number; is_muted?: boolean; karaoke_mode?: boolean; current_track?: PlayerTrack; command_seq?: number } }) => {
            if (!active || !payload.new) return;
            const st = payload.new;
            // Drop out-of-order (stale) database events
            const seq = Number(st.command_seq ?? 0);
            if (seq > 0) {
              if (seq < lastCommandSeqRef.current) return;
              lastCommandSeqRef.current = seq;
            }
            if (typeof st.is_paused === "boolean") setIsPaused(st.is_paused);
            if (typeof st.volume === "number") setVolume(st.volume);
            if (typeof st.is_muted === "boolean") setIsMuted(st.is_muted);
            if (typeof st.karaoke_mode === "boolean") setKaraokeMode(st.karaoke_mode);
            if (st.current_track) applyExternalTrack(st.current_track);
          },
        )
        .subscribe();
      channelRef.current = channel;
    });

    return () => {
      active = false;
      channelRef.current = null;
      if (channel) {
        void import("@/lib/api/supabase/browser").then(({ createBrowserSupabase }) => {
          const supabase = createBrowserSupabase();
          void supabase.removeChannel(channel!);
        });
      }
    };
  }, [slug]);

  // Elapsed runner
  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isPaused]);

  const broadcastControl = useCallback((command: string, payload: Record<string, unknown> = {}) => {
    if (channelRef.current) {
      void channelRef.current.send({
        type: "broadcast",
        event: "playback_command",
        payload: {
          command,
          payload,
          timestamp: Date.now(),
        },
      });
    }
  }, []);

  // Handlers
  const handleTogglePlay = async () => {
    audioEngineRef.current?.unlockAudio();
    if (!currentTrack && activeQueue.length > 0) {
      void handlePlayQueueItemNow(activeQueue[0]);
      return;
    }
    const next = !isPaused;
    setIsPaused(next);
    showToast(next ? "⏸️ TV Pausada" : "▶️ TV en Reproducción");
    broadcastControl(next ? "pause" : "resume");
    try {
      if (next) {
        await pausePlayback(slug);
      } else {
        await resumePlayback(slug);
      }
    } catch {
      // Revert on failure
      setIsPaused(!next);
    }
  };

  // Reset preloaded tracker on track change
  useEffect(() => {
    hasPreloadedRef.current = false;
  }, [currentTrack?.itemId, currentTrack?.youtubeVideoId]);

  const handleSkipNext = async () => {
    if (isSkippingRef.current) return;
    isSkippingRef.current = true;
    setTimeout(() => {
      isSkippingRef.current = false;
    }, 2500);

    showToast("⏭️ Salteando a la siguiente canción...");
    // Always read the LIVE current track (never a stale render closure)
    const cur = currentTrackRef.current;
    const curKey = trackAudioKey(cur);
    let nextTrack: PlayerTrack | null = null;

    const toTrack = (item: (typeof activeQueue)[number]): PlayerTrack => ({
      itemId: item.id,
      trackId: item.trackId,
      title: item.title,
      artist: item.artist,
      source: item.source || "youtube",
      durationSeconds: item.durationSeconds ?? 210,
      youtubeVideoId: item.youtubeVideoId || undefined,
      thumbnailUrl: item.thumbnailUrl ?? null,
      voteCount: item.voteCount,
      guestName: item.guestName ?? null,
      dedication: item.dedication ?? null,
      isKaraoke: item.isKaraoke ?? false,
    });

    if (activeQueue.length > 0) {
      const curIdx = activeQueue.findIndex(
        (t) =>
          t.id === cur?.itemId ||
          (!!curKey && trackAudioKey(toTrack(t)) === curKey),
      );
      // Next song AFTER the current one; never the one that is ending
      const startIdx = curIdx >= 0 ? curIdx + 1 : 0;
      for (let i = startIdx; i < activeQueue.length; i++) {
        const candidate = toTrack(activeQueue[i]);
        if (trackAudioKey(candidate) !== curKey) {
          nextTrack = candidate;
          break;
        }
      }
    }

    if (!nextTrack && effectiveFallbackTracks.length > 0) {
      const curIdx = effectiveFallbackTracks.findIndex(
        (t) => !!curKey && trackAudioKey(t) === curKey,
      );
      const total = effectiveFallbackTracks.length;
      for (let step = 1; step <= total; step++) {
        const candidate = effectiveFallbackTracks[((curIdx >= 0 ? curIdx : -1) + step + total) % total];
        if (trackAudioKey(candidate) !== curKey) {
          nextTrack = candidate;
          break;
        }
      }
    }

    if (nextTrack) {
      // Lock locally FIRST so no stale server echo can bring back the old song
      lastLiveKeyRef.current = trackAudioKey(nextTrack);
      setLocalTrack(nextTrack);
      setElapsed(0);
      setVideoDuration(null);
      setIsPaused(false);
      audioEngineRef.current?.unlockAudio();
      broadcastControl("play_now", { track: nextTrack });
      try {
        await sendPlaybackCommand(slug, "play_now", { track: nextTrack });
      } catch {
        // Non-blocking
      }
    } else {
      try {
        await skipPlayback(slug);
        setElapsed(0);
        void loadState();
      } catch {
        // Non-blocking
      }
    }
  };

  // Always-fresh refs for global keyboard shortcuts (avoid stale closures that
  // would compute the "next" song from an old render and replay a past song)
  const handleSkipNextRef = useRef(handleSkipNext);
  handleSkipNextRef.current = handleSkipNext;
  const handleTogglePlayRef = useRef(handleTogglePlay);
  handleTogglePlayRef.current = handleTogglePlay;

  // Keyboard shortcuts in Admin panel (Space = Play/Pause, S = Skip)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        void handleSkipNextRef.current();
      } else if (e.code === "Space") {
        e.preventDefault();
        void handleTogglePlayRef.current();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleRestart = async () => {
    if (currentTrack) {
      showToast(`⏮️ Reiniciando: ${currentTrack.title}`);
      setElapsed(0);
      setIsPaused(false);
      audioEngineRef.current?.unlockAudio();
      audioEngineRef.current?.seekTo(0);
      broadcastControl("seek", { seconds: 0 });
      broadcastControl("play_now", { track: currentTrack });
      try {
        await sendPlaybackCommand(slug, "play_now", { track: currentTrack });
      } catch {
        // Ignore
      }
    }
  };

  const handleVolume = async (newVol: number) => {
    setVolume(newVol);
    if (isMuted) setIsMuted(false);
    broadcastControl("set_volume", { volume: newVol });
    try {
      await setPlaybackVolume(slug, newVol);
    } catch {
      // Ignore
    }
  };

  const handleToggleMute = async () => {
    const next = !isMuted;
    setIsMuted(next);
    showToast(next ? "🔇 Audio Cabina Silenciado" : "🔊 Audio Cabina Activo");
    broadcastControl(next ? "mute" : "unmute");
    try {
      if (next) {
        await mutePlayback(slug);
      } else {
        await unmutePlayback(slug);
      }
    } catch {
      setIsMuted(!next);
    }
  };

  const handleToggleTvMute = async () => {
    const next = !tvMuted;
    setTvMuted(next);
    showToast(next ? "🔇 Audio de la TV Silenciado" : "🔊 Audio de la TV Activado");
    broadcastControl("set_tv_mute", { tvMuted: next });
    try {
      await updateTvDeviceDisplay(slug, "all", { tvMuted: next });
    } catch {
      // Non-blocking
    }
  };

  const handleToggleKaraoke = async () => {
    const next = !karaokeMode;
    setKaraokeMode(next);
    showToast(next ? "🎤 Modo Karaoke Activado" : "🎧 Modo Normal");
    try {
      await setKmRemote(slug, next);
    } catch {
      setKaraokeMode(!next);
    }
  };

  const duration = videoDuration ?? currentTrack?.durationSeconds ?? 210;
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (elapsed / duration) * 100)) : 0;

  const handleSeek = async (newSec: number) => {
    const clamped = Math.max(0, Math.min(duration, newSec));
    setElapsed(clamped);
    audioEngineRef.current?.seekTo(clamped);
    showToast(`⏩ Posición: ${formatDuration(clamped)}`);
    broadcastControl("seek", { seconds: clamped });
    try {
      await seekPlayback(slug, clamped);
    } catch {
      // non-blocking
    }
  };

  const handleSeekDelta = async (deltaSec: number) => {
    await handleSeek(elapsed + deltaSec);
  };

  const handleScrubberClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    const targetSec = Math.floor(pct * duration);
    void handleSeek(targetSec);
  };

  return (
    <>
      {/* Toast Feedback */}
      {feedbackToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-[#0A0E17]/95 text-white font-mono text-xs font-bold px-5 py-2 rounded-full border border-indigo-500/50 shadow-2xl backdrop-blur-md animate-fade-in flex items-center gap-2">
          <span>{feedbackToast}</span>
        </div>
      )}

      {/* Sticky Bottom Control Bar */}
      <footer className={`fixed bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] md:bottom-0 left-0 ${
          isSidebarCollapsed ? "md:left-20" : "md:left-64"
        } right-0 z-40 bg-[#080b14] border-t border-[#1E2333] shadow-[0_-8px_30px_rgba(0,0,0,0.8)] px-3 sm:px-4 py-2 sm:py-2.5 flex flex-col gap-1 select-none transition-all duration-300`}>
        {/* Scrubber line */}
        <div className="w-full flex items-center gap-2.5 px-2">
          <span className="font-mono text-[10px] text-cyan-400 font-semibold w-9 text-right">
            {formatDuration(elapsed)}
          </span>
          <div
            onClick={handleScrubberClick}
            className="flex-1 h-2 hover:h-2.5 bg-[#181b25] rounded-full overflow-hidden relative border border-white/5 cursor-pointer group transition-all"
            title="Click para adelantar o retroceder el video en la TV"
          >
            <div
              className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-400 rounded-full transition-all duration-150 pointer-events-none"
              style={{ width: `${progressPercent}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 size-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
              style={{ left: `calc(${progressPercent}% - 6px)` }}
            />
          </div>
          <span className="font-mono text-[10px] text-slate-400 font-semibold w-9">
            {formatDuration(duration)}
          </span>
        </div>

        {/* Main Controls Row */}
                {/* ==================== MOBILE COMPACT DOCK (< md) ==================== */}
        <div className="md:hidden flex items-center justify-between gap-2 px-1 py-0.5">
          {/* Track Info: Clickable to expand full player drawer */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-2 min-w-0 flex-1 text-left p-0.5 rounded-lg hover:bg-white/5 active:scale-[0.98] transition-all"
            title="Tocá para ver y gestionar la cola de canciones"
          >
            <div className="relative size-9 rounded-lg overflow-hidden bg-[#131722] border border-[#283250] shrink-0 shadow-md flex items-center justify-center">
              {currentTrack?.thumbnailUrl ? (
                <Image
                  src={currentTrack.thumbnailUrl}
                  alt={currentTrack.title}
                  width={36}
                  height={36}
                  className="w-full h-full object-cover"
                  unoptimized
                />
              ) : (
                <Music2 className="size-4 text-indigo-400" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-white text-xs font-bold truncate leading-tight">
                {currentTrack?.title || "Sin música activa"}
              </p>
              <p className="text-slate-400 text-[10px] truncate leading-tight mt-0.5">
                {currentTrack?.artist || "Playlist Local"}
              </p>
            </div>
          </button>

          {/* Quick Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Queue Drawer Toggle Pill */}
            <button
              type="button"
              onClick={() => setDrawerOpen((prev) => !prev)}
              className="flex items-center gap-1 bg-gradient-to-r from-indigo-600/30 to-violet-600/30 hover:from-indigo-600/40 text-indigo-300 border border-indigo-500/40 px-2.5 py-1.5 rounded-xl font-mono text-[11px] font-bold active:scale-95 transition-all shrink-0 shadow-sm"
              title="Abrir cola y gestión de temas"
            >
              <ListMusic className="size-3.5 text-cyan-400" />
              <span>Cola ({activeQueue.length})</span>
              <ChevronUp className="size-3 text-indigo-300" />
            </button>

            {/* Search YouTube modal */}
            <button
              type="button"
              onClick={() => setManualModalOpen(true)}
              className="size-8 rounded-lg bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 flex items-center justify-center active:scale-95 transition-all"
              title="Buscar en YouTube y poner en TV"
            >
              <Search className="size-3.5 text-cyan-400" />
            </button>

            {/* TV Audio Mute/Unmute Toggle */}
            <button
              type="button"
              onClick={() => void handleToggleTvMute()}
              className={`size-8 rounded-lg border flex items-center justify-center active:scale-95 transition-all ${
                tvMuted
                  ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                  : "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
              }`}
              title={tvMuted ? "Activar sonido de la TV" : "Silenciar sonido de la TV"}
            >
              {tvMuted ? <VolumeX className="size-3.5 text-rose-400" /> : <Volume2 className="size-3.5 text-cyan-400" />}
            </button>

            {/* Play / Pause */}
            <button
              type="button"
              onClick={() => void handleTogglePlay()}
              className="size-9 rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/30 active:scale-95 transition-all"
              title={isPaused ? "Reanudar música en TV" : "Pausar música en TV"}
            >
              {isPaused ? <Play className="size-4 fill-white ml-0.5" /> : <Pause className="size-4 fill-white" />}
            </button>

            {/* Skip */}
            <button
              type="button"
              onClick={() => void handleSkipNext()}
              className="size-8 rounded-lg bg-[#131722] border border-[#232b42] flex items-center justify-center text-slate-300 hover:text-white active:scale-90 transition-all"
              title="Saltear tema actual"
            >
              <SkipForward className="size-4" />
            </button>
          </div>
        </div>

        {/* ==================== DESKTOP CONTROLS ROW (>= md) ==================== */}
        <div className="hidden md:flex items-center justify-between gap-3 lg:gap-6 w-full px-4">
          {/* LEFT: Currently Playing Track Details + Cola Trigger + Poner Tema */}
          <div className="flex items-center gap-2.5 min-w-0 max-w-[320px] lg:max-w-[380px] shrink justify-start">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="flex items-center gap-2.5 min-w-0 max-w-[200px] xl:max-w-[260px] text-left p-1 rounded-xl hover:bg-white/5 active:scale-[0.99] transition-all cursor-pointer group shrink-0"
              title="Click para abrir la cola de reproducción y gestionar temas"
            >
              <div className="relative size-10 rounded-lg overflow-hidden bg-[#131722] border border-[#283250] group-hover:border-indigo-500/50 shrink-0 shadow-md flex items-center justify-center transition-colors">
                {currentTrack?.thumbnailUrl ? (
                  <Image
                    src={currentTrack.thumbnailUrl}
                    alt={currentTrack.title}
                    width={40}
                    height={40}
                    className="w-full h-full object-cover"
                    unoptimized
                  />
                ) : (
                  <Music2 className="size-4 text-indigo-400" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-white text-xs font-bold truncate leading-tight group-hover:text-cyan-300 transition-colors">
                    {currentTrack?.title || "Sin música activa"}
                  </span>
                  {karaokeMode || currentTrack?.isKaraoke ? (
                    <span className="shrink-0 bg-pink-500/20 text-pink-300 border border-pink-500/30 font-mono text-[9px] font-bold px-1.5 py-0.2 rounded-full uppercase">
                      Karaoke
                    </span>
                  ) : null}
                </div>
                <p className="text-slate-400 text-[10px] truncate mt-0.5 group-hover:text-slate-300 transition-colors">
                  {currentTrack?.artist || "Billar & Bar Playlist"}
                </p>
              </div>
            </button>

            {/* Quick Button: Abrir Cola */}
            <button
              type="button"
              onClick={() => setDrawerOpen((prev) => !prev)}
              className="shrink-0 flex items-center gap-1.5 bg-gradient-to-r from-indigo-600/25 to-violet-600/25 hover:from-indigo-600/35 hover:to-violet-600/35 text-indigo-300 hover:text-white px-2.5 py-1.5 rounded-xl border border-indigo-500/40 font-mono text-[11px] font-bold transition-all active:scale-95 shadow-sm whitespace-nowrap"
              title="Abrir la cola de reproducción y gestionar temas"
            >
              <ListMusic className="size-3.5 text-cyan-400 shrink-0" />
              <span>Cola ({activeQueue.length})</span>
              <ChevronUp className="size-3 text-indigo-400 shrink-0" />
            </button>

            {/* Quick Button: Elegir Canción (YouTube) */}
            <button
              type="button"
              onClick={() => setManualModalOpen(true)}
              className="shrink-0 size-8 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 hover:text-white border border-indigo-500/30 flex items-center justify-center transition-all active:scale-95"
              title="Buscar en YouTube y poner tema en TV"
            >
              <Search className="size-3.5 text-cyan-400" />
            </button>
          </div>

          {/* CENTER: Main Playback Transport Buttons */}
          <div className="flex items-center justify-center gap-1.5 lg:gap-2 shrink-0">
            {/* Prev / Restart */}
            <button
              type="button"
              onClick={() => void handleRestart()}
              className="size-8 rounded-lg bg-[#131722] hover:bg-[#1c2234] border border-[#232b42] flex items-center justify-center text-slate-300 hover:text-white transition-all active:scale-90"
              title="Reiniciar tema actual"
            >
              <RotateCcw className="size-4" />
            </button>

            {/* Seek -10s */}
            <button
              type="button"
              onClick={() => void handleSeekDelta(-10)}
              className="h-8 px-2 rounded-lg bg-[#131722] hover:bg-[#1c2234] border border-[#232b42] flex items-center justify-center text-slate-300 hover:text-cyan-400 transition-all active:scale-90 font-mono text-[11px] font-bold"
              title="Retroceder 10 segundos"
            >
              -10s
            </button>

            {/* Play / Pause Primary Button */}
            <button
              type="button"
              onClick={() => void handleTogglePlay()}
              className="size-10 rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white flex items-center justify-center shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
              title={isPaused ? "Reanudar música (Espacio)" : "Pausar música (Espacio)"}
            >
              {isPaused ? <Play className="size-5 fill-white ml-0.5" /> : <Pause className="size-5 fill-white" />}
            </button>

            {/* Seek +10s */}
            <button
              type="button"
              onClick={() => void handleSeekDelta(10)}
              className="h-8 px-2 rounded-lg bg-[#131722] hover:bg-[#1c2234] border border-[#232b42] flex items-center justify-center text-slate-300 hover:text-cyan-400 transition-all active:scale-90 font-mono text-[11px] font-bold"
              title="Adelantar 10 segundos"
            >
              +10s
            </button>

            {/* Skip Next */}
            <button
              type="button"
              onClick={() => void handleSkipNext()}
              className="size-8 rounded-lg bg-[#131722] hover:bg-[#1c2234] border border-[#232b42] flex items-center justify-center text-slate-300 hover:text-white transition-all active:scale-90"
              title="Saltear al siguiente tema (S)"
            >
              <SkipForward className="size-4" />
            </button>
          </div>

          {/* RIGHT: Volume & Display Remote Manager */}
          <div className="flex items-center justify-end gap-2 lg:gap-2.5 shrink-0">
            {/* TV Screen & Display Remote Manager */}
            <button
              type="button"
              onClick={() => setTvManagerOpen(true)}
              className="h-8 shrink-0 flex items-center gap-1.5 px-2.5 rounded-lg border border-[#232b42] bg-[#131722] hover:bg-[#1a2030] text-slate-300 hover:text-white font-mono text-[11px] font-bold transition-all active:scale-95 shadow-sm whitespace-nowrap"
              title="Administrar pantallas TV: cambiar modos, ocultar/mostrar listas, temas y tamaños desde la cabina"
            >
              <Tv className="size-3.5 text-cyan-400 shrink-0" />
              <span>Pantallas TV</span>
            </button>

            {/* Remote TV Audio Mute/Unmute Button */}
            <button
              type="button"
              onClick={() => void handleToggleTvMute()}
              className={`h-8 shrink-0 flex items-center gap-1.5 px-2.5 rounded-lg border font-mono text-[11px] font-bold transition-all active:scale-95 whitespace-nowrap ${
                tvMuted
                  ? "bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-sm"
                  : "bg-[#131722] text-cyan-300 border-[#232b42] hover:text-white"
              }`}
              title={tvMuted ? "Sonido de la TV silenciado — Clic para activar sonido en la TV" : "Sonido de la TV activo — Clic para silenciar la TV desde la cabina"}
            >
              {tvMuted ? (
                <>
                  <VolumeX className="size-3.5 text-rose-400 shrink-0" />
                  <span>TV Silenciada</span>
                </>
              ) : (
                <>
                  <Volume2 className="size-3.5 text-cyan-400 shrink-0" />
                  <span>Audio TV</span>
                </>
              )}
            </button>

            {/* Karaoke Mode Toggle Button */}
            <button
              type="button"
              onClick={() => void handleToggleKaraoke()}
              className={`h-8 shrink-0 flex items-center gap-1.5 px-2.5 rounded-lg border font-mono text-[11px] font-bold transition-all whitespace-nowrap ${
                karaokeMode
                  ? "bg-gradient-to-r from-pink-500/25 to-purple-500/25 text-pink-300 border-pink-500/50 shadow-[0_0_12px_rgba(236,72,153,0.3)] animate-pulse"
                  : "bg-[#131722] text-slate-400 border-[#232b42] hover:text-white"
              }`}
              title="Alternar Modo Karaoke en el salón"
            >
              <Mic className="size-3.5 text-pink-400 shrink-0" />
              <span>{karaokeMode ? "Karaoke ON" : "Karaoke"}</span>
            </button>

            {/* Cabina Audio Output Badge & Autoplay Unlocker */}
            {isAudioBlocked ? (
              <button
                type="button"
                onClick={() => audioEngineRef.current?.unlockAudio()}
                className="h-8 shrink-0 flex items-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 px-2.5 rounded-lg font-mono text-[11px] font-bold active:scale-95 transition-all shadow-sm whitespace-nowrap"
                title="Clic para habilitar sonido en la cabina del local"
              >
                <VolumeX className="size-3.5 text-amber-400 animate-pulse shrink-0" />
                <span>Habilitar Sonido</span>
              </button>
            ) : (
              <div
                className="hidden 2xl:flex h-8 shrink-0 items-center gap-1.5 bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 px-2 rounded-lg font-mono text-[11px] font-bold whitespace-nowrap"
                title="Sonido principal del salón activo desde esta cabina (Solo sonido, sin video)"
              >
                <span className="size-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span>Audio Cabina</span>
              </div>
            )}

            {/* Volume Control */}
            <div className="h-8 shrink-0 flex items-center gap-2 bg-[#131722] px-2.5 rounded-lg border border-[#232b42]">
              <button
                type="button"
                onClick={() => void handleToggleMute()}
                className="text-slate-400 hover:text-white transition-colors shrink-0"
                title="Silenciar / Activar sonido (M)"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="size-4 text-rose-400" />
                ) : (
                  <Volume2 className="size-4 text-cyan-400" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="100"
                value={isMuted ? 0 : volume}
                onChange={(e) => void handleVolume(Number(e.target.value))}
                className="w-16 lg:w-20 xl:w-24 h-1.5 accent-indigo-500 bg-[#232b42] rounded-lg appearance-none cursor-pointer"
                title={`Volumen cabina: ${volume}%`}
              />
              <span className="text-[10px] font-mono text-slate-400 w-7 text-right shrink-0">
                {isMuted ? "0%" : `${volume}%`}
              </span>
            </div>
          </div>
        </div>
      </footer>

      {/* Off-screen Admin Cabina Audio Playback Engine (Solo sonido, sin video) */}
      <PanelAudioEngine
        ref={audioEngineRef}
        slug={slug}
        currentTrack={currentTrack}
        isPaused={isPaused}
        volume={volume}
        isMuted={isMuted}
        onTrackEnded={() => void handleSkipNextRef.current()}
        onProgress={(curr, dur) => {
          setElapsed(Math.floor(curr));
          if (dur) setVideoDuration(dur);

          // Preload next track 10-15 seconds before current track ends
          const remaining = dur && dur > 0 ? dur - curr : 999;
          if (remaining <= 15 && remaining > 0 && !hasPreloadedRef.current) {
            hasPreloadedRef.current = true;
            let nextTrack: PlayerTrack | null = null;
            if (activeQueue.length > 0) {
              const curIdx = activeQueue.findIndex(
                (t) =>
                  t.id === currentTrack?.itemId ||
                  t.trackId === currentTrack?.trackId ||
                  t.youtubeVideoId === currentTrack?.youtubeVideoId ||
                  t.title.toLowerCase() === currentTrack?.title.toLowerCase(),
              );
              if (curIdx >= 0 && curIdx < activeQueue.length - 1) {
                const item = activeQueue[curIdx + 1];
                nextTrack = {
                  itemId: item.id,
                  trackId: item.trackId,
                  title: item.title,
                  artist: item.artist,
                  source: item.source || "catalog",
                  durationSeconds: item.durationSeconds ?? 210,
                  youtubeVideoId: item.youtubeVideoId || undefined,
                  thumbnailUrl: item.thumbnailUrl ?? null,
                  voteCount: item.voteCount,
                };
              } else if (curIdx === -1 && activeQueue.length > 0) {
                const item = activeQueue[0];
                nextTrack = {
                  itemId: item.id,
                  trackId: item.trackId,
                  title: item.title,
                  artist: item.artist,
                  source: item.source || "catalog",
                  durationSeconds: item.durationSeconds ?? 210,
                  youtubeVideoId: item.youtubeVideoId || undefined,
                  thumbnailUrl: item.thumbnailUrl ?? null,
                  voteCount: item.voteCount,
                };
              }
            }
            if (!nextTrack && effectiveFallbackTracks.length > 0) {
              const curIdx = effectiveFallbackTracks.findIndex(
                (t) =>
                  t.trackId === currentTrack?.trackId ||
                  t.youtubeVideoId === currentTrack?.youtubeVideoId ||
                  t.title.toLowerCase() === currentTrack?.title.toLowerCase(),
              );
              const nextIdx = curIdx >= 0 ? (curIdx + 1) % effectiveFallbackTracks.length : 0;
              nextTrack = effectiveFallbackTracks[nextIdx];
            }
            if (nextTrack && channelRef.current) {
              void channelRef.current.send({
                type: "broadcast",
                event: "track_preloading",
                payload: {
                  nextTrack,
                  remainingSeconds: Math.round(remaining),
                },
              });
            }
          }

          const now = Date.now();
          if (channelRef.current && currentTrack && now - lastProgressBroadcastRef.current >= 1800) {
            lastProgressBroadcastRef.current = now;
            void channelRef.current.send({
              type: "broadcast",
              event: "tv_playback_progress",
              payload: {
                currentTime: curr,
                duration: dur ?? currentTrack.durationSeconds ?? 210,
                isPaused,
                trackId: currentTrack.trackId,
                track: currentTrack,
                volume,
                isMuted,
                isFromAdminAudio: true,
                sentAt: now,
              },
            });
          }
        }}
        onAudioBlockedChange={(blocked) => setIsAudioBlocked(blocked)}
      />

      {/* Manual Track Selection Modal */}
      <ManualPlaybackModal
        isOpen={manualModalOpen}
        onClose={() => setManualModalOpen(false)}
        slug={slug}
        defaultKaraoke={karaokeMode}
        onActionComplete={() => void loadState()}
      />

      {/* Modern Smart TV Devices & Display Manager Modal */}
      <TvDevicesManagerModal
        isOpen={tvManagerOpen}
        onClose={() => setTvManagerOpen(false)}
        slug={slug}
      />

      {/* ==================== EXPANDABLE QUEUE & REMOTE PLAYER DRAWER ==================== */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end md:justify-center md:items-end animate-in fade-in duration-200">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
            onClick={() => setDrawerOpen(false)}
          />

          {/* Drawer Body Sheet */}
          <div className="relative w-full md:max-w-xl md:h-[92vh] max-h-[85vh] bg-[#0c101c] border-t md:border-l md:border-t-0 border-[#1E2538] rounded-t-3xl md:rounded-l-3xl md:rounded-tr-none shadow-[0_-15px_40px_rgba(0,0,0,0.9)] flex flex-col z-10 overflow-hidden pb-[env(safe-area-inset-bottom,0px)]">
            {/* Top Drag Handle (Mobile) */}
            <div className="pt-3 pb-1 flex justify-center md:hidden cursor-pointer" onClick={() => setDrawerOpen(false)}>
              <div className="w-12 h-1.5 bg-slate-700/60 rounded-full" />
            </div>

            {/* Drawer Header */}
            <div className="px-5 py-3 border-b border-[#1E2538] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="size-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/40">
                  <ListMusic className="size-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight">
                    Control Maestro & Cola de Salón
                  </h3>
                  <p className="font-mono text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                    <span className="size-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    <span>TV Conectada</span>
                    <span className="text-slate-600">·</span>
                    <span>{activeQueue.length} temas en cola</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setManualModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-mono text-xs font-bold transition-all shadow-md flex items-center gap-1.5 active:scale-95"
                >
                  <Plus className="size-3.5" />
                  <span>Poner Tema</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="size-8 rounded-lg bg-[#181F33] text-slate-400 hover:text-white flex items-center justify-center transition-colors"
                  aria-label="Cerrar panel de cola"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* Now Playing Banner in Drawer */}
            <div className="p-4 bg-[#101524] border-b border-[#1E2538]">
              {isAudioBlocked && (
                <button
                  type="button"
                  onClick={() => audioEngineRef.current?.unlockAudio()}
                  className="w-full mb-3 flex items-center justify-center gap-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 py-2 px-3 rounded-xl font-mono text-xs font-bold active:scale-95 transition-all shadow-md"
                >
                  <VolumeX className="size-4 text-amber-400 animate-pulse" />
                  <span>Toca aquí para habilitar el sonido en la cabina</span>
                </button>
              )}
              <div className="flex items-center gap-3">
                <div className="size-12 rounded-xl bg-[#090D16] border border-[#232B42] shrink-0 overflow-hidden flex items-center justify-center relative shadow-md">
                  {currentTrack?.thumbnailUrl ? (
                    <Image
                      src={currentTrack.thumbnailUrl}
                      alt={currentTrack.title}
                      width={48}
                      height={48}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <Music2 className="size-6 text-indigo-400" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.2 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 font-bold">
                      Sonando Ahora
                    </span>
                    {karaokeMode && (
                      <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.2 rounded bg-pink-500/20 text-pink-300 font-bold">
                        Karaoke
                      </span>
                    )}
                  </div>
                  <h4 className="text-white text-sm font-bold truncate mt-0.5">
                    {currentTrack?.title || "Sin música activa"}
                  </h4>
                  <p className="text-slate-400 text-xs truncate">
                    {currentTrack?.artist || "Playlist del Bar"}
                  </p>
                </div>

                {/* Quick Play/Pause & Skip */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleTogglePlay()}
                    className="size-10 rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white flex items-center justify-center shadow-lg active:scale-95"
                    title={isPaused ? "Reanudar" : "Pausar"}
                  >
                    {isPaused ? <Play className="size-4 fill-white ml-0.5" /> : <Pause className="size-4 fill-white" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSkipNext()}
                    className="size-9 rounded-xl bg-[#181F33] border border-[#232B42] flex items-center justify-center text-slate-300 hover:text-white active:scale-90"
                    title="Saltear al siguiente"
                  >
                    <SkipForward className="size-4" />
                  </button>
                </div>
              </div>

              {/* Scrubber inside drawer */}
              <div className="mt-3 pt-2 border-t border-[#1C2336] flex items-center gap-2.5">
                <span className="font-mono text-[10px] text-cyan-400 font-semibold w-8 text-right">
                  {formatDuration(elapsed)}
                </span>
                <div
                  onClick={handleScrubberClick}
                  className="flex-1 h-2 bg-[#181b25] rounded-full overflow-hidden relative border border-white/5 cursor-pointer"
                >
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-400 rounded-full"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <span className="font-mono text-[10px] text-slate-400 font-semibold w-8">
                  {formatDuration(duration)}
                </span>
              </div>
            </div>

            {/* Drawer Tabs: Cola Activa vs Candidatos */}
            <div className="px-5 pt-3 pb-2 flex gap-2 border-b border-[#1E2538] bg-[#0c101c]">
              <button
                type="button"
                onClick={() => setDrawerTab("queue")}
                className={`flex-1 py-2 px-3 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  drawerTab === "queue"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "bg-[#181F33] text-slate-400 hover:text-white border border-[#232B42]"
                }`}
              >
                <ListMusic className="size-3.5" />
                <span>Cola Activa ({activeQueue.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setDrawerTab("candidates")}
                className={`flex-1 py-2 px-3 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  drawerTab === "candidates"
                    ? "bg-amber-600 text-white shadow-md shadow-amber-600/30"
                    : "bg-[#181F33] text-slate-400 hover:text-white border border-[#232B42]"
                }`}
              >
                <Sparkles className="size-3.5 text-amber-400" />
                <span>Candidatas ({candidateProposals.length})</span>
              </button>
            </div>

            {/* Drawer Queue Scrollable List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {drawerTab === "queue" && (
                <>
                  {activeQueue.length === 0 ? (
                    <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-[#232B42] bg-[#101524]/60">
                      <Music2 className="size-8 mx-auto text-slate-600 mb-2" />
                      <p className="text-sm font-bold text-white">No hay canciones en la cola de la TV</p>
                      <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                        Buscá un tema en YouTube o aprobá propuestas candidatas para llenar la cola.
                      </p>
                      <button
                        type="button"
                        onClick={() => setManualModalOpen(true)}
                        className="mt-3.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold shadow-md"
                      >
                        Buscar y Poner Canción
                      </button>
                    </div>
                  ) : (
                    activeQueue.map((item, index) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-xl bg-[#121626] border border-[#232B42] hover:border-[#2f3b5c] transition-all flex items-center justify-between gap-3 shadow-sm"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="size-7 rounded-lg bg-[#181F33] border border-[#283250] text-indigo-300 font-mono text-xs font-bold flex items-center justify-center shrink-0">
                            #{index + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h5 className="text-xs font-bold text-white truncate">{item.title}</h5>
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">
                              {item.artist} {item.durationSeconds ? `· ${formatDuration(item.durationSeconds)}` : ""}
                            </p>
                            <span className="inline-flex items-center gap-1 font-mono text-[10px] text-indigo-400 font-semibold mt-1">
                              <Flame className="size-3 text-amber-400" />
                              {item.voteCount >= 9999 || item.voteCount === 0 ? "⭐ Selección Bar" : `${item.voteCount} votos`}
                            </span>
                          </div>
                        </div>

                        {/* Actions for this song */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Play Now */}
                          <button
                            type="button"
                            onClick={() => void handlePlayQueueItemNow(item)}
                            disabled={pendingActionId === item.id}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 font-mono text-[11px] font-bold flex items-center gap-1 active:scale-95 transition-all"
                            title="Reproducir inmediatamente en TV"
                          >
                            <PlayCircle className="size-3.5" />
                            <span className="hidden sm:inline">Poner Ya</span>
                          </button>

                          {/* Boost / +1 Voto */}
                          <button
                            type="button"
                            onClick={() => void handleBoostQueueItem(item)}
                            disabled={pendingActionId === item.id}
                            className="size-8 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 flex items-center justify-center active:scale-95 transition-all"
                            title="Subir de puesto (+1 voto)"
                          >
                            <ArrowUp className="size-3.5" />
                          </button>

                          {/* Veto */}
                          <button
                            type="button"
                            onClick={() => void handleVetoQueueItem(item)}
                            disabled={pendingActionId === item.id}
                            className="size-8 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 flex items-center justify-center active:scale-95 transition-all"
                            title="Vetar / Quitar de la cola"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}

              {drawerTab === "candidates" && (
                <>
                  {candidateProposals.length === 0 ? (
                    <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-[#232B42] bg-[#101524]/60">
                      <Sparkles className="size-8 mx-auto text-amber-500 mb-2" />
                      <p className="text-sm font-bold text-white">No hay propuestas esperando votos</p>
                      <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                        Cuando los clientes propongan canciones desde sus mesas, aparecerán aquí hasta juntar 5 votos.
                      </p>
                    </div>
                  ) : (
                    candidateProposals.map((item, index) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-xl bg-[#121626] border border-[#232B42] hover:border-[#2f3b5c] transition-all flex items-center justify-between gap-3 shadow-sm"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="size-7 rounded-lg bg-[#181F33] border border-[#283250] text-amber-400 font-mono text-xs font-bold flex items-center justify-center shrink-0">
                            #{index + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h5 className="text-xs font-bold text-white truncate">{item.title}</h5>
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">{item.artist}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="font-mono text-[10px] text-amber-300 font-bold">
                                {item.voteCount}/{effectiveThreshold} votos
                              </span>
                              <div className="w-16 h-1.5 rounded-full bg-[#181F33] overflow-hidden">
                                <div
                                  className="h-full bg-amber-400 rounded-full"
                                  style={{ width: `${Math.min(100, (item.voteCount / effectiveThreshold) * 100)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Actions for candidate */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Play Now directly */}
                          <button
                            type="button"
                            onClick={() => void handlePlayQueueItemNow(item)}
                            disabled={pendingActionId === item.id}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 font-mono text-[11px] font-bold flex items-center gap-1 active:scale-95"
                            title="Aprobar y reproducir directamente en TV"
                          >
                            <PlayCircle className="size-3.5" />
                            <span className="hidden sm:inline">Poner Ya</span>
                          </button>

                          {/* Add vote */}
                          <button
                            type="button"
                            onClick={() => void handleBoostQueueItem(item)}
                            disabled={pendingActionId === item.id}
                            className="size-8 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 flex items-center justify-center active:scale-95"
                            title="Sumar voto (+1)"
                          >
                            <ArrowUp className="size-3.5" />
                          </button>

                          {/* Veto */}
                          <button
                            type="button"
                            onClick={() => void handleVetoQueueItem(item)}
                            disabled={pendingActionId === item.id}
                            className="size-8 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 flex items-center justify-center active:scale-95"
                            title="Rechazar propuesta"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
