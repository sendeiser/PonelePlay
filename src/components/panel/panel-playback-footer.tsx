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
import {
  acquireSyncClient,
  releaseSyncClient,
  type PoneleSyncClient,
  type SyncStatusState,
} from "@/lib/sync/client";
import type { PlaybackAnchor, SyncTrack } from "@/lib/sync/protocol";

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
  // 3-way audio routing: BOTH = audio in cabina + TV, CABINA_ONLY = only cabina, TV_ONLY = only TV
  const [audioRouting, setAudioRouting] = useState<"BOTH" | "CABINA_ONLY" | "TV_ONLY">("BOTH");
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
  const syncClientRef = useRef<PoneleSyncClient | null>(null);
  const activeBarrierIdRef = useRef<string | null>(null);
  const activeBarrierVideoIdRef = useRef<string | null>(null);
  const startBarrierTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatusState>({
    transport: "offline",
    connected: false,
    rttMs: null,
    offsetMs: 0,
    presence: null,
  });
  const currentTrackRef = useRef<PlayerTrack | null>(currentTrack);
  currentTrackRef.current = currentTrack;
  const lastProgressBroadcastRef = useRef<number>(0);
  const isSkippingRef = useRef(false);
  const hasPreloadedRef = useRef(false);
  const [isAudioBlocked, setIsAudioBlocked] = useState(false);

  const nightSource = useMemo(() => createNightStateSource(slug, "master"), [slug]);
  const { state: nightState, loading: nightLoading, refresh: refreshNightState } = useNightState(
    nightSource,
    { pollMs: 25_000, connectedPollMs: 45_000 },
  );

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

  const handleBoostQueueItem = async (
    item: QueueItemView,
    mode: "queue" | "candidate" = "queue",
  ) => {
    setPendingActionId(item.id);
    try {
      try {
        const res = await fetch("/api/panel/queue/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "boost",
            itemId: item.id,
            slug,
            mode,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            ok?: boolean;
            promotedToQueue?: boolean;
            voteCount?: number;
          };
          if (data?.ok) {
            if (mode === "queue") {
              showToast(`⬆ Subida al tope de la cola: "${item.title}"`);
            } else if (data.promotedToQueue) {
              showToast(`🎉 "${item.title}" subió a la Cola Activa`);
            } else {
              showToast(`+1 voto sumado para "${item.title}"`);
            }
            await refreshNightState();
            return;
          }
        }
      } catch {
        // Fallback to castVote below
      }
      await castVote(item.id, slug);
      showToast(`+1 voto sumado para "${item.title}"`);
      await refreshNightState();
    } catch {
      showToast("Error al subir canción");
    } finally {
      setPendingActionId(null);
    }
  };

  const handlePromoteCandidateToQueue = async (item: QueueItemView) => {
    setPendingActionId(item.id);
    try {
      const res = await fetch("/api/panel/queue/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "promote",
          itemId: item.id,
          slug,
        }),
      });
      if (res.ok) {
        showToast(`✅ "${item.title}" aprobada y pasada a la Cola Activa`);
        await refreshNightState();
      } else {
        showToast("Error al pasar a la cola");
      }
    } catch {
      showToast("Error al pasar a la cola");
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

  // Listen to same-tab playback/playlist commands (e.g. from PlaylistManager or CatalogManager)
  useEffect(() => {
    const onLocalPlaybackCommand = (e: Event) => {
      const detail = (
        e as CustomEvent<{
          slug?: string;
          command?: string;
          payload?: Record<string, unknown>;
          state?: { currentTrack?: PlayerTrack | null; isPaused?: boolean };
        }>
      ).detail;
      if (!detail || (detail.slug && detail.slug !== slug)) return;

      const cmd = detail.command;
      if (cmd === "play_now" || cmd === "play_playlist") {
        const nextTrack = (detail.state?.currentTrack ||
          detail.payload?.track) as PlayerTrack | undefined;
        if (nextTrack && (nextTrack.youtubeVideoId || nextTrack.title)) {
          lastLiveKeyRef.current = trackAudioKey(nextTrack);
          setLocalTrack(nextTrack);
          setIsPaused(false);
          setElapsed(0);
          setVideoDuration(null);
          audioEngineRef.current?.unlockAudio();
        }
        void refreshNightState();
      } else if (
        cmd === "enqueue_top" ||
        cmd === "enqueue_playlist" ||
        cmd === "activate_playlist"
      ) {
        void refreshNightState();
      }
    };

    window.addEventListener("poneleplay:playback-command", onLocalPlaybackCommand);
    return () =>
      window.removeEventListener("poneleplay:playback-command", onLocalPlaybackCommand);
  }, [slug, setLocalTrack, refreshNightState]);

  // 2. Unified LAN / Cloud WebSocket Sync (with Supabase fallback when unconfigured)
  useEffect(() => {
    let active = true;
    let channel: import("@supabase/supabase-js").RealtimeChannel | null = null;
    const syncClient = acquireSyncClient({ slug, role: "master" });

    const toPlayerTrack = (t: SyncTrack): PlayerTrack => ({
      itemId: t.itemId,
      trackId: t.trackId,
      title: t.title,
      artist: t.artist,
      source: t.source || "youtube",
      durationSeconds: t.durationSeconds ?? 210,
      youtubeVideoId: t.youtubeVideoId || undefined,
      thumbnailUrl: t.thumbnailUrl ?? null,
      voteCount: t.voteCount ?? 0,
      guestName: t.guestName ?? null,
      dedication: t.dedication ?? null,
      isKaraoke: Boolean(t.isKaraoke),
    });

    const applyIncomingAnchor = (anchor: PlaybackAnchor) => {
      if (!active) return;
      if (anchor.seq > 0) {
        if (anchor.seq < lastCommandSeqRef.current) return;
        lastCommandSeqRef.current = anchor.seq;
      }
      setIsPaused(anchor.isPaused);
      setVolume(anchor.volume);
      setIsMuted(anchor.cabinaMuted);
      setTvMuted(anchor.tvMuted);
      setKaraokeMode(anchor.karaokeMode);
      if (anchor.track) {
        applyExternalTrack(toPlayerTrack(anchor.track));
      }
    };

    const unsubStatus = syncClient.onStatus((st) => {
      if (active) setSyncStatus(st);
    });

    let unsubSnap: (() => void) | null = null;
    let unsubAnchor: (() => void) | null = null;
    let unsubPreload: (() => void) | null = null;
    let unsubGo: (() => void) | null = null;
    let unsubParty: (() => void) | null = null;

    if (syncClient.hasTargetsConfigured()) {
      syncClientRef.current = syncClient;

      const latest = syncClient.getLatestSnapshot();
      if (latest?.anchor) applyIncomingAnchor(latest.anchor);

      unsubSnap = syncClient.on("room:snapshot", ({ snapshot }) => {
        applyIncomingAnchor(snapshot.anchor);
      });

      unsubAnchor = syncClient.on("sync:anchor", ({ anchor, forceSeek }) => {
        applyIncomingAnchor(anchor);
        if (forceSeek) {
          setElapsed(Math.floor(anchor.anchorPositionSec));
        }
      });

      unsubPreload = syncClient.on("sync:preload", ({ barrierId, track, startPositionSec }) => {
        if (!active) return;
        const incoming = toPlayerTrack(track);
        activeBarrierIdRef.current = barrierId;
        activeBarrierVideoIdRef.current = track.youtubeVideoId ?? null;
        lastLiveKeyRef.current = trackAudioKey(incoming);
        setLocalTrack(incoming);
        setIsPaused(false);
        setElapsed(Math.floor(startPositionSec));
        setVideoDuration(track.durationSeconds ?? null);
        audioEngineRef.current?.holdUntilSynced(2200);
        // Send master readiness after iframe cue settle or immediately for cached/local audio
        setTimeout(() => {
          if (active && activeBarrierIdRef.current === barrierId) {
            syncClient.sendReady(barrierId);
          }
        }, 140);
      });

      unsubGo = syncClient.on("sync:go", ({ barrierId, startPositionSec, startAtServerMs, anchor }) => {
        if (!active) return;
        if (activeBarrierIdRef.current === barrierId) {
          activeBarrierIdRef.current = null;
        }
        applyIncomingAnchor(anchor);
        if (startBarrierTimerRef.current) {
          clearTimeout(startBarrierTimerRef.current);
          startBarrierTimerRef.current = null;
        }
        const delayMs = syncClient.msUntilServerTime(startAtServerMs);
        audioEngineRef.current?.scheduleStartAt(delayMs, startPositionSec);
      });

      unsubParty = syncClient.on("party:event", ({ payload }) => {
        if (!active || !payload) return;
        if (payload.type === "party_skip_vote_updated" && payload.skipped) {
          const next = payload.nextTrack as PlayerTrack | null | undefined;
          if (next && (next.youtubeVideoId || next.itemId)) {
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
      });
    } else {
      releaseSyncClient(syncClient);
      syncClientRef.current = null;

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
            "broadcast",
            { event: "tv_ready" },
            () => {
              if (!active) return;
              audioEngineRef.current?.releaseStartHold();
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "venue_playback_state" },
            (payload: { new?: { is_paused?: boolean; volume?: number; is_muted?: boolean; karaoke_mode?: boolean; current_track?: PlayerTrack; command_seq?: number } }) => {
              if (!active || !payload.new) return;
              const st = payload.new;
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
    }

    return () => {
      active = false;
      unsubStatus();
      unsubSnap?.();
      unsubAnchor?.();
      unsubPreload?.();
      unsubGo?.();
      unsubParty?.();
      if (startBarrierTimerRef.current) {
        clearTimeout(startBarrierTimerRef.current);
        startBarrierTimerRef.current = null;
      }
      if (syncClientRef.current) {
        releaseSyncClient(syncClientRef.current);
        syncClientRef.current = null;
      }
      channelRef.current = null;
      if (channel) {
        void import("@/lib/api/supabase/browser").then(({ createBrowserSupabase }) => {
          const supabase = createBrowserSupabase();
          void supabase.removeChannel(channel!);
        });
      }
    };
  }, [slug, applyExternalTrack, setLocalTrack]);

  const broadcastControl = useCallback((command: string, payload: Record<string, unknown> = {}) => {
    if (syncClientRef.current?.isConnected()) {
      syncClientRef.current.sendCommand(command, payload, {
        useBarrier:
          command === "play_now" || command === "skip" || command === "play_playlist",
      });
      return;
    }
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
      setIsPaused(false);
      audioEngineRef.current?.unlockAudio();
      await handleSeek(0);
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
    broadcastControl("set_tv_mute", { tvMuted: next, cabinaMuted: isMuted });
    try {
      await sendPlaybackCommand(slug, "set_tv_mute", { tvMuted: next });
      await updateTvDeviceDisplay(slug, "all", { tvMuted: next });
    } catch {
      // Non-blocking
    }
  };

  /**
   * 3-way audio routing selector:
   * BOTH         → Audio en Cabina Y en TV (mute=false, tvMuted=false)
   * CABINA_ONLY  → Audio SOLO en Cabina (mute=false, tvMuted=true)
   * TV_ONLY      → Audio SOLO en TV (mute=true, tvMuted=false)
   */
  const handleSetAudioRouting = async (routing: "BOTH" | "CABINA_ONLY" | "TV_ONLY") => {
    setAudioRouting(routing);
    const nextCabinaMuted = routing === "TV_ONLY";
    const nextTvMuted = routing === "CABINA_ONLY";

    // Update cabina mute locally and in DB (never broadcast "mute" to TV when muting only Cabina!)
    if (nextCabinaMuted !== isMuted) {
      setIsMuted(nextCabinaMuted);
      try {
        if (nextCabinaMuted) await mutePlayback(slug);
        else await unmutePlayback(slug);
      } catch { /* non-blocking */ }
    }

    // Always broadcast and persist explicit TV mute state
    setTvMuted(nextTvMuted);
    broadcastControl("set_tv_mute", {
      tvMuted: nextTvMuted,
      cabinaMuted: nextCabinaMuted,
      audioRouting: routing,
    });
    try {
      await sendPlaybackCommand(slug, "set_tv_mute", { tvMuted: nextTvMuted });
      await updateTvDeviceDisplay(slug, "all", { tvMuted: nextTvMuted });
    } catch { /* non-blocking */ }

    const labels = {
      BOTH: "🔊 Audio en Cabina + TV",
      CABINA_ONLY: "🎧 Audio Solo en Cabina",
      TV_ONLY: "📺 Audio Solo en TV",
    };
    showToast(labels[routing]);
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
    const clamped = Math.max(0, Math.min(duration, Math.floor(newSec)));
    const seekSeq = Date.now();
    setElapsed(clamped);
    audioEngineRef.current?.seekTo(clamped);
    showToast(`⏩ Posición: ${formatDuration(clamped)}`);
    broadcastControl("seek", { seconds: clamped, seekSeq });
    if (channelRef.current && currentTrack) {
      lastProgressBroadcastRef.current = seekSeq;
      void channelRef.current.send({
        type: "broadcast",
        event: "tv_playback_progress",
        payload: {
          currentTime: clamped,
          duration: duration,
          isPaused,
          trackId: currentTrack.trackId,
          track: currentTrack,
          volume,
          isMuted,
          tvMuted,
          forceSeek: true,
          seekSeq,
          isFromAdminAudio: true,
          sentAt: seekSeq,
        },
      });
    }
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
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[90] card-panel text-th-text font-mono text-xs font-bold px-5 py-2.5 rounded-full border-th-accent/40 shadow-xl backdrop-blur-md animate-fade-in flex items-center gap-2">
          <span>{feedbackToast}</span>
        </div>
      )}

      {/* Sticky Bottom Control Bar */}
      <footer className={`fixed bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] md:bottom-0 left-0 ${
          isSidebarCollapsed ? "md:left-[74px]" : "md:left-60"
        } right-0 z-40 bg-th-shell/95 backdrop-blur-md border-t border-th-border shadow-lg px-3 sm:px-5 py-2 flex flex-col gap-1.5 select-none transition-all duration-200`}>
        {/* Scrubber line */}
        <div className="w-full flex items-center gap-2.5 px-1">
          <span className="font-mono text-[10px] text-th-accent font-bold w-9 text-right tabular-nums">
            {formatDuration(elapsed)}
          </span>
          <div
            onClick={handleScrubberClick}
            className="flex-1 h-2 hover:h-2.5 bg-th-recessed rounded-full overflow-hidden relative border border-th-border cursor-pointer group transition-all"
            title="Click para adelantar o retroceder el video en la TV"
          >
            <div
              className="h-full bg-th-accent rounded-full transition-all duration-150 pointer-events-none"
              style={{ width: `${progressPercent}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 size-3 bg-white border border-th-accent rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
              style={{ left: `calc(${progressPercent}% - 6px)` }}
            />
          </div>
          <span className="font-mono text-[10px] text-th-muted font-bold w-9 tabular-nums">
            {formatDuration(duration)}
          </span>
        </div>

        {/* ==================== MOBILE COMPACT DOCK (< md) ==================== */}
        <div className="md:hidden flex items-center justify-between gap-2 px-1 py-0.5">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-2 min-w-0 flex-1 text-left p-0.5 rounded-xl hover:bg-th-recessed active:scale-[0.98] transition-all cursor-pointer"
            title="Tocá para ver y gestionar la cola de canciones"
          >
            <div className="relative size-9 rounded-lg overflow-hidden bg-th-recessed border border-th-border shrink-0 flex items-center justify-center">
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
                <Music2 className="size-4 text-th-accent" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-th-text text-xs font-display font-bold truncate leading-tight">
                {currentTrack?.title || "Sin música activa"}
              </p>
              <p className="text-th-muted text-[10px] truncate leading-tight mt-0.5">
                {currentTrack?.artist || "Playlist Local"}
              </p>
            </div>
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setDrawerOpen((prev) => !prev)}
              className="flex items-center gap-1 bg-th-accent-soft hover:bg-th-accent hover:text-white text-th-accent border border-th-accent/30 px-2.5 h-8 rounded-xl font-mono text-[11px] font-bold active:scale-95 transition-all shrink-0 cursor-pointer"
              title="Abrir cola y gestión de temas"
            >
              <ListMusic className="size-3.5" />
              <span>({activeQueue.length})</span>
              <ChevronUp className="size-3" />
            </button>

            <button
              type="button"
              onClick={() => setManualModalOpen(true)}
              className="size-8 rounded-xl bg-th-recessed text-th-text-2 hover:text-th-text border border-th-border flex items-center justify-center active:scale-95 transition-all cursor-pointer"
              title="Buscar en YouTube y poner en TV"
            >
              <Search className="size-3.5" />
            </button>

            <div className="flex items-center gap-0.5 bg-th-recessed rounded-xl border border-th-border overflow-hidden p-0.5" title="Audio: Cabina / Ambos / Solo TV">
              <button
                type="button"
                onClick={() => void handleSetAudioRouting("CABINA_ONLY")}
                className={`size-7 rounded-lg flex items-center justify-center transition-all text-xs cursor-pointer ${
                  audioRouting === "CABINA_ONLY" ? "bg-th-accent text-white" : "text-th-muted"
                }`}
                title="Audio solo Cabina"
              >🎧</button>
              <button
                type="button"
                onClick={() => void handleSetAudioRouting("BOTH")}
                className={`size-7 rounded-lg flex items-center justify-center transition-all text-xs cursor-pointer ${
                  audioRouting === "BOTH" ? "bg-th-emerald text-white" : "text-th-muted"
                }`}
                title="Audio en Cabina y TV"
              >🔊</button>
              <button
                type="button"
                onClick={() => void handleSetAudioRouting("TV_ONLY")}
                className={`size-7 rounded-lg flex items-center justify-center transition-all text-xs cursor-pointer ${
                  audioRouting === "TV_ONLY" ? "bg-th-teal text-white" : "text-th-muted"
                }`}
                title="Audio solo TV"
              >📺</button>
            </div>

            <button
              type="button"
              onClick={() => void handleTogglePlay()}
              className="size-9 rounded-full bg-th-accent hover:bg-th-accent-hover text-white flex items-center justify-center shadow-sm active:scale-95 transition-all cursor-pointer"
              title={isPaused ? "Reanudar música en TV" : "Pausar música en TV"}
            >
              {isPaused ? <Play className="size-4 fill-white ml-0.5" /> : <Pause className="size-4 fill-white" />}
            </button>

            <button
              type="button"
              onClick={() => void handleSkipNext()}
              className="size-8 rounded-xl bg-th-recessed border border-th-border flex items-center justify-center text-th-text-2 hover:text-th-text active:scale-90 transition-all cursor-pointer"
              title="Saltear tema actual"
            >
              <SkipForward className="size-4" />
            </button>
          </div>
        </div>

        {/* ==================== DESKTOP CONTROLS ROW (>= md) ==================== */}
        <div className="hidden md:flex items-center justify-between gap-3 xl:gap-5 w-full">
          {/* LEFT: Currently Playing Track Details + Cola Trigger */}
          <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="flex items-center gap-2.5 min-w-0 max-w-[230px] xl:max-w-[280px] text-left p-1 rounded-xl hover:bg-th-recessed transition-colors cursor-pointer group"
              title="Click para abrir la cola de reproducción y gestionar temas"
            >
              <div className="relative size-10 rounded-lg overflow-hidden bg-th-recessed border border-th-border group-hover:border-th-accent/40 shrink-0 flex items-center justify-center transition-colors">
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
                  <Music2 className="size-4 text-th-accent" />
                )}
              </div>

              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-th-text text-xs font-display font-bold truncate leading-tight group-hover:text-th-accent transition-colors">
                    {currentTrack?.title || "Sin música activa"}
                  </span>
                  {karaokeMode || currentTrack?.isKaraoke ? (
                    <span className="shrink-0 bg-th-accent-soft text-th-accent font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase">
                      Karaoke
                    </span>
                  ) : null}
                </div>
                <p className="text-th-text-2 text-[11px] truncate mt-0.5">
                  {currentTrack?.artist || "Playlist del Bar"}
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setDrawerOpen((prev) => !prev)}
              className="shrink-0 inline-flex items-center gap-1.5 h-8 bg-th-accent-soft hover:bg-th-accent text-th-accent hover:text-white px-2.5 rounded-xl border border-th-accent/25 font-mono text-[11px] font-bold transition-all active:scale-95 whitespace-nowrap cursor-pointer"
              title="Abrir la cola de reproducción y gestionar temas"
            >
              <ListMusic className="size-3.5 shrink-0" />
              <span>Cola ({activeQueue.length})</span>
              <ChevronUp className="size-3 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => setManualModalOpen(true)}
              className="shrink-0 size-8 rounded-xl bg-th-recessed hover:bg-th-hover text-th-text-2 hover:text-th-accent border border-th-border flex items-center justify-center transition-colors active:scale-95 cursor-pointer"
              title="Buscar en YouTube y poner tema en TV"
            >
              <Search className="size-3.5" />
            </button>
          </div>

          {/* CENTER: Main Playback Transport Buttons */}
          <div className="flex items-center justify-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => void handleRestart()}
              className="size-8 rounded-xl bg-th-recessed hover:bg-th-hover border border-th-border flex items-center justify-center text-th-text-2 hover:text-th-text transition-colors active:scale-90 cursor-pointer"
              title="Reiniciar tema actual"
            >
              <RotateCcw className="size-3.5" />
            </button>

            <button
              type="button"
              onClick={() => void handleSeekDelta(-10)}
              className="h-8 px-2.5 rounded-xl bg-th-recessed hover:bg-th-hover border border-th-border flex items-center justify-center text-th-text-2 hover:text-th-accent transition-colors active:scale-90 font-mono text-[11px] font-bold cursor-pointer"
              title="Retroceder 10 segundos"
            >
              -10s
            </button>

            <button
              type="button"
              onClick={() => void handleTogglePlay()}
              className="size-10 rounded-full bg-th-accent hover:bg-th-accent-hover text-white flex items-center justify-center shadow-md transition-all active:scale-95 cursor-pointer"
              title={isPaused ? "Reanudar música (Espacio)" : "Pausar música (Espacio)"}
            >
              {isPaused ? <Play className="size-4 fill-white ml-0.5" /> : <Pause className="size-4 fill-white" />}
            </button>

            <button
              type="button"
              onClick={() => void handleSeekDelta(10)}
              className="h-8 px-2.5 rounded-xl bg-th-recessed hover:bg-th-hover border border-th-border flex items-center justify-center text-th-text-2 hover:text-th-accent transition-colors active:scale-90 font-mono text-[11px] font-bold cursor-pointer"
              title="Adelantar 10 segundos"
            >
              +10s
            </button>

            <button
              type="button"
              onClick={() => void handleSkipNext()}
              className="size-8 rounded-xl bg-th-recessed hover:bg-th-hover border border-th-border flex items-center justify-center text-th-text-2 hover:text-th-text transition-colors active:scale-90 cursor-pointer"
              title="Saltear al siguiente tema (S)"
            >
              <SkipForward className="size-3.5" />
            </button>
          </div>

          {/* RIGHT: TV Display Manager, Audio Routing & Volume */}
          <div className="flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setTvManagerOpen(true)}
              className="h-8 shrink-0 inline-flex items-center gap-1.5 px-2.5 rounded-xl border border-th-border bg-th-recessed hover:bg-th-hover text-th-text-2 hover:text-th-text text-xs font-semibold transition-colors active:scale-95 whitespace-nowrap cursor-pointer"
              title="Administrar pantallas TV: cambiar modos, ocultar/mostrar listas, temas y tamaños desde la cabina"
            >
              <Tv className="size-3.5 text-th-teal shrink-0" />
              <span className="hidden xl:inline">Pantallas TV</span>
              <span className="xl:hidden">TV</span>
            </button>

            <div className="h-8 shrink-0 flex items-center gap-0.5 bg-th-recessed rounded-xl border border-th-border p-0.5" title="Enrutamiento de audio: elegí dónde se escucha la música">
              <button
                type="button"
                onClick={() => void handleSetAudioRouting("CABINA_ONLY")}
                className={`h-full px-2 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                  audioRouting === "CABINA_ONLY"
                    ? "bg-th-accent text-white"
                    : "text-th-text-2 hover:text-th-text"
                }`}
                title="Audio solo en Cabina (TV silenciada)"
              >
                <span className="hidden xl:inline">Cabina</span>
                <span className="xl:hidden">🎧</span>
              </button>
              <button
                type="button"
                onClick={() => void handleSetAudioRouting("BOTH")}
                className={`h-full px-2 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                  audioRouting === "BOTH"
                    ? "bg-th-emerald text-white"
                    : "text-th-text-2 hover:text-th-text"
                }`}
                title="Audio en Cabina y en TV"
              >
                <span className="hidden xl:inline">Ambos</span>
                <span className="xl:hidden">🔊</span>
              </button>
              <button
                type="button"
                onClick={() => void handleSetAudioRouting("TV_ONLY")}
                className={`h-full px-2 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                  audioRouting === "TV_ONLY"
                    ? "bg-th-teal text-white"
                    : "text-th-text-2 hover:text-th-text"
                }`}
                title="Audio solo en TV (cabina silenciada)"
              >
                <span className="hidden xl:inline">Solo TV</span>
                <span className="xl:hidden">📺</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => void handleToggleKaraoke()}
              className={`h-8 shrink-0 inline-flex items-center gap-1.5 px-2.5 rounded-xl border text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                karaokeMode
                  ? "bg-th-accent text-white border-th-accent"
                  : "bg-th-recessed text-th-text-2 border-th-border hover:text-th-text hover:bg-th-hover"
              }`}
              title="Alternar Modo Karaoke en el salón"
            >
              <Mic className="size-3.5 shrink-0" />
              <span className="hidden lg:inline">{karaokeMode ? "Karaoke ON" : "Karaoke"}</span>
            </button>

            {isAudioBlocked ? (
              <button
                type="button"
                onClick={() => audioEngineRef.current?.unlockAudio()}
                className="h-8 shrink-0 flex items-center gap-1.5 bg-th-amber-soft hover:bg-th-amber text-th-amber hover:text-white border border-th-amber/40 px-2.5 rounded-xl text-xs font-semibold active:scale-95 transition-all whitespace-nowrap cursor-pointer"
                title="Clic para habilitar sonido en la cabina del local"
              >
                <VolumeX className="size-3.5 shrink-0" />
                <span>Habilitar Sonido</span>
              </button>
            ) : (
              <div
                className="hidden 2xl:flex h-8 shrink-0 items-center gap-1.5 bg-th-emerald-soft border border-th-emerald/30 text-th-emerald px-2.5 rounded-xl text-[11px] font-semibold whitespace-nowrap"
                title={
                  syncStatus.transport === "lan"
                    ? `Sincronización LAN ultrarrápida (${syncStatus.rttMs ?? "<2"}ms)`
                    : syncStatus.transport === "cloud"
                      ? `Sincronización Cloud Edge (${syncStatus.rttMs ?? "--"}ms)`
                      : "Sonido principal del salón activo desde esta cabina"
                }
              >
                <span className="size-2 rounded-full bg-th-emerald animate-pulse shrink-0" />
                <span>
                  {syncStatus.transport === "lan"
                    ? `LAN${syncStatus.rttMs !== null ? ` ${syncStatus.rttMs}ms` : ""}`
                    : syncStatus.transport === "cloud"
                      ? `Sync${syncStatus.rttMs !== null ? ` ${syncStatus.rttMs}ms` : " OK"}`
                      : "Cabina ON"}
                </span>
              </div>
            )}

            <div className="h-8 shrink-0 flex items-center gap-2 bg-th-recessed px-2.5 rounded-xl border border-th-border">
              <button
                type="button"
                onClick={() => void handleToggleMute()}
                className="text-th-text-2 hover:text-th-text transition-colors shrink-0 cursor-pointer"
                title="Silenciar / Activar sonido (M)"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="size-4 text-th-danger" />
                ) : (
                  <Volume2 className="size-4 text-th-accent" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="100"
                value={isMuted ? 0 : volume}
                onChange={(e) => void handleVolume(Number(e.target.value))}
                className="w-16 lg:w-20 h-1.5 accent-th-accent bg-th-border rounded-lg cursor-pointer"
                title={`Volumen cabina: ${volume}%`}
              />
              <span className="text-[11px] font-mono text-th-text-2 w-8 text-right shrink-0 tabular-nums">
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
          if (syncClientRef.current?.isConnected() && currentTrack && now - lastProgressBroadcastRef.current >= 2500) {
            lastProgressBroadcastRef.current = now;
            syncClientRef.current.sendProgress({
              currentTime: curr,
              duration: dur ?? currentTrack.durationSeconds ?? 210,
              isPaused,
              tvMuted,
              volume,
              isFromAdminAudio: true,
              track: {
                itemId: currentTrack.itemId,
                trackId: currentTrack.trackId,
                title: currentTrack.title,
                artist: currentTrack.artist,
                source: currentTrack.source === "upload" || currentTrack.source === "spotify" ? currentTrack.source : "youtube",
                durationSeconds: dur ?? currentTrack.durationSeconds ?? 210,
                youtubeVideoId: currentTrack.youtubeVideoId ?? null,
                thumbnailUrl: currentTrack.thumbnailUrl ?? null,
                voteCount: currentTrack.voteCount,
                guestName: currentTrack.guestName ?? null,
                dedication: currentTrack.dedication ?? null,
                isKaraoke: currentTrack.isKaraoke ?? false,
              },
            });
          } else if (channelRef.current && currentTrack && now - lastProgressBroadcastRef.current >= 1500) {
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
                tvMuted,
                isFromAdminAudio: true,
                sentAt: now,
              },
            });
          }
        }}
        onTrackBuffered={(videoId) => {
          if (
            activeBarrierIdRef.current &&
            syncClientRef.current?.isConnected() &&
            (!activeBarrierVideoIdRef.current || activeBarrierVideoIdRef.current === videoId)
          ) {
            syncClientRef.current.sendReady(activeBarrierIdRef.current);
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
        onActionComplete={() => {
          void refreshNightState();
          void loadState();
        }}
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
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setDrawerOpen(false)}
          />

          <div className="relative w-full md:max-w-xl md:h-[92vh] max-h-[85vh] bg-th-card border-t md:border-l md:border-t-0 border-th-border rounded-t-3xl md:rounded-l-3xl md:rounded-tr-none shadow-2xl flex flex-col z-10 overflow-hidden pb-[env(safe-area-inset-bottom,0px)]">
            <div className="pt-3 pb-1 flex justify-center md:hidden cursor-pointer" onClick={() => setDrawerOpen(false)}>
              <div className="w-12 h-1.5 bg-th-border-strong rounded-full" />
            </div>

            {/* Drawer Header */}
            <div className="px-5 py-3.5 border-b border-th-border flex items-center justify-between gap-2 bg-th-shell">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="size-9 rounded-xl bg-th-accent text-white flex items-center justify-center shrink-0">
                  <ListMusic className="size-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-display font-bold text-th-text tracking-tight truncate">
                    Control Maestro & Cola de Salón
                  </h3>
                  <p className="font-mono text-[10px] text-th-text-2 flex items-center gap-1.5 mt-0.5">
                    <span className="size-1.5 rounded-full bg-th-teal animate-pulse" />
                    <span>TV Conectada</span>
                    <span className="text-th-muted">·</span>
                    <span>{activeQueue.length} temas en cola</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setManualModalOpen(true)}
                  className="h-8 px-3 rounded-xl bg-th-accent hover:bg-th-accent-hover text-white text-xs font-semibold transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
                >
                  <Plus className="size-3.5" />
                  <span>Poner Tema</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="size-8 rounded-xl bg-th-recessed border border-th-border text-th-text-2 hover:text-th-text flex items-center justify-center transition-colors cursor-pointer"
                  aria-label="Cerrar panel de cola"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* Now Playing Banner in Drawer */}
            <div className="p-4 bg-th-recessed border-b border-th-border">
              {isAudioBlocked && (
                <button
                  type="button"
                  onClick={() => audioEngineRef.current?.unlockAudio()}
                  className="w-full mb-3 flex items-center justify-center gap-2 bg-th-amber-soft hover:bg-th-amber text-th-amber hover:text-white border border-th-amber/40 py-2 px-3 rounded-xl text-xs font-semibold active:scale-95 transition-all cursor-pointer"
                >
                  <VolumeX className="size-4" />
                  <span>Toca aquí para habilitar el sonido en la cabina</span>
                </button>
              )}
              <div className="flex items-center gap-3">
                <div className="size-12 rounded-xl bg-th-card border border-th-border shrink-0 overflow-hidden flex items-center justify-center">
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
                    <Music2 className="size-6 text-th-accent" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-th-danger-soft text-th-danger font-bold">
                      Sonando Ahora
                    </span>
                    {karaokeMode && (
                      <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-th-accent-soft text-th-accent font-bold">
                        Karaoke
                      </span>
                    )}
                  </div>
                  <h4 className="text-th-text text-sm font-display font-bold truncate mt-1">
                    {currentTrack?.title || "Sin música activa"}
                  </h4>
                  <p className="text-th-text-2 text-xs truncate">
                    {currentTrack?.artist || "Playlist del Bar"}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleTogglePlay()}
                    className="size-10 rounded-full bg-th-accent hover:bg-th-accent-hover text-white flex items-center justify-center shadow-sm active:scale-95 cursor-pointer"
                    title={isPaused ? "Reanudar" : "Pausar"}
                  >
                    {isPaused ? <Play className="size-4 fill-white ml-0.5" /> : <Pause className="size-4 fill-white" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSkipNext()}
                    className="size-9 rounded-xl bg-th-card border border-th-border flex items-center justify-center text-th-text-2 hover:text-th-text active:scale-90 cursor-pointer"
                    title="Saltear al siguiente"
                  >
                    <SkipForward className="size-4" />
                  </button>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-th-border flex items-center gap-2.5">
                <span className="font-mono text-[10px] text-th-accent font-bold w-9 text-right tabular-nums">
                  {formatDuration(elapsed)}
                </span>
                <div
                  onClick={handleScrubberClick}
                  className="flex-1 h-2 bg-th-card rounded-full overflow-hidden relative border border-th-border cursor-pointer"
                >
                  <div
                    className="h-full bg-th-accent rounded-full"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <span className="font-mono text-[10px] text-th-muted font-bold w-9 tabular-nums">
                  {formatDuration(duration)}
                </span>
              </div>
            </div>

            {/* Drawer Tabs */}
            <div className="px-5 py-2.5 flex gap-2 border-b border-th-border bg-th-shell">
              <button
                type="button"
                onClick={() => setDrawerTab("queue")}
                className={`flex-1 h-9 px-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  drawerTab === "queue"
                    ? "bg-th-accent text-white"
                    : "bg-th-recessed text-th-text-2 hover:text-th-text border border-th-border"
                }`}
              >
                <ListMusic className="size-3.5" />
                <span>Cola Activa ({activeQueue.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setDrawerTab("candidates")}
                className={`flex-1 h-9 px-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  drawerTab === "candidates"
                    ? "bg-th-amber text-white"
                    : "bg-th-recessed text-th-text-2 hover:text-th-text border border-th-border"
                }`}
              >
                <Sparkles className="size-3.5" />
                <span>Candidatas ({candidateProposals.length})</span>
              </button>
            </div>

            {/* Bounded Internal Scrollable Queue List */}
            <div className="flex-1 min-h-0 ui-scroll-container p-4 space-y-2 bg-th-recessed">
              {drawerTab === "queue" && (
                <>
                  {activeQueue.length === 0 ? (
                    <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-th-border bg-th-card">
                      <Music2 className="size-8 mx-auto text-th-muted mb-2" />
                      <p className="text-sm font-display font-bold text-th-text">No hay canciones en la cola de la TV</p>
                      <p className="text-xs text-th-text-2 mt-1 max-w-xs mx-auto">
                        Buscá un tema en YouTube o aprobá propuestas candidatas para llenar la cola.
                      </p>
                      <button
                        type="button"
                        onClick={() => setManualModalOpen(true)}
                        className="mt-4 h-9 px-4 rounded-xl bg-th-accent hover:bg-th-accent-hover text-white text-xs font-semibold cursor-pointer"
                      >
                        Buscar y Poner Canción
                      </button>
                    </div>
                  ) : (
                    activeQueue.map((item, index) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-xl bg-th-card border border-th-border hover:border-th-border-strong transition-colors flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="size-7 rounded-lg bg-th-recessed border border-th-border text-th-accent font-mono text-xs font-bold flex items-center justify-center shrink-0 tabular-nums">
                            #{index + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h5 className="text-xs font-display font-bold text-th-text truncate">{item.title}</h5>
                            <p className="text-[11px] text-th-text-2 truncate mt-0.5">
                              {item.artist} {item.durationSeconds ? `· ${formatDuration(item.durationSeconds)}` : ""}
                            </p>
                            <span className="inline-flex items-center gap-1 font-mono text-[10px] text-th-accent font-semibold mt-1">
                              <Flame className="size-3 text-th-amber" />
                              {item.voteCount >= 9999 || item.voteCount === 0 ? "Selección Bar" : `${item.voteCount} votos`}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => void handlePlayQueueItemNow(item)}
                            disabled={pendingActionId === item.id}
                            className="h-8 px-2.5 rounded-lg bg-th-emerald-soft hover:bg-th-emerald text-th-emerald hover:text-white border border-th-emerald/30 text-[11px] font-semibold flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                            title="Reproducir inmediatamente en TV"
                          >
                            <PlayCircle className="size-3.5" />
                            <span>Poner Ya</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleBoostQueueItem(item, "queue")}
                            disabled={pendingActionId === item.id}
                            className="h-8 px-2 rounded-lg bg-th-accent-soft hover:bg-th-accent text-th-accent hover:text-white border border-th-accent/30 text-[11px] font-semibold flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                            title="Subir al tope de la cola"
                          >
                            <ArrowUp className="size-3.5" />
                            <span className="hidden sm:inline">Subir</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleVetoQueueItem(item)}
                            disabled={pendingActionId === item.id}
                            className="size-8 rounded-lg bg-th-danger-soft hover:bg-th-danger text-th-danger hover:text-white border border-th-danger/30 flex items-center justify-center active:scale-95 transition-all cursor-pointer"
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
                    <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-th-border bg-th-card">
                      <Sparkles className="size-8 mx-auto text-th-amber mb-2" />
                      <p className="text-sm font-display font-bold text-th-text">No hay propuestas esperando votos</p>
                      <p className="text-xs text-th-text-2 mt-1 max-w-xs mx-auto">
                        Cuando los invitados propongan canciones desde sus celulares, aparecerán aquí hasta juntar {effectiveThreshold} votos.
                      </p>
                    </div>
                  ) : (
                    candidateProposals.map((item, index) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-xl bg-th-card border border-th-border hover:border-th-border-strong transition-colors flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="size-7 rounded-lg bg-th-recessed border border-th-border text-th-amber font-mono text-xs font-bold flex items-center justify-center shrink-0 tabular-nums">
                            #{index + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h5 className="text-xs font-display font-bold text-th-text truncate">{item.title}</h5>
                            <p className="text-[11px] text-th-text-2 truncate mt-0.5">{item.artist}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="font-mono text-[10px] text-th-amber font-bold tabular-nums">
                                {item.voteCount}/{effectiveThreshold} votos
                              </span>
                              <div className="w-16 h-1.5 rounded-full bg-th-recessed overflow-hidden">
                                <div
                                  className="h-full bg-th-amber rounded-full"
                                  style={{ width: `${Math.min(100, (item.voteCount / effectiveThreshold) * 100)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => void handlePromoteCandidateToQueue(item)}
                            disabled={pendingActionId === item.id}
                            className="h-8 px-2.5 rounded-lg bg-th-accent-soft hover:bg-th-accent text-th-accent hover:text-white border border-th-accent/30 text-[11px] font-semibold flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                            title="Aprobar y subir a la Cola Principal"
                          >
                            <ArrowUp className="size-3.5" />
                            <span>Subir a Cola</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => void handlePlayQueueItemNow(item)}
                            disabled={pendingActionId === item.id}
                            className="h-8 px-2.5 rounded-lg bg-th-emerald-soft hover:bg-th-emerald text-th-emerald hover:text-white border border-th-emerald/30 text-[11px] font-semibold flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                            title="Reproducir inmediatamente en TV"
                          >
                            <PlayCircle className="size-3.5" />
                            <span className="hidden sm:inline">Poner Ya</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleBoostQueueItem(item, "candidate")}
                            disabled={pendingActionId === item.id}
                            className="h-8 px-2 rounded-lg bg-th-amber-soft hover:bg-th-amber text-th-amber hover:text-white border border-th-amber/30 font-mono text-[11px] font-bold flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                            title="Sumar +1 voto"
                          >
                            +1
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleVetoQueueItem(item)}
                            disabled={pendingActionId === item.id}
                            className="size-8 rounded-lg bg-th-danger-soft hover:bg-th-danger text-th-danger hover:text-white border border-th-danger/30 flex items-center justify-center active:scale-95 transition-all cursor-pointer"
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
