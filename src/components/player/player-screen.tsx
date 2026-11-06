"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { Flame, HelpCircle, Maximize2, Mic, Minimize2, Music2, Settings, Volume2, VolumeX, X } from "lucide-react";
import { BallChip } from "@/components/ball-chip";
import { PlayerRuntime } from "@/components/player/player-runtime";
import {
  createIframeEngine,
  resolveVideoId,
  type IframePlaybackEngine,
} from "@/components/player/iframe-engine";
import type { PlayerStateResponse, PlayerTrack } from "@/lib/api/player";
import { demoNowPlaying, demoQueue } from "@/lib/demo-data";
import { fetchFallback } from "@/lib/api/catalog";
import { TvPairingModal } from "@/components/player/tv-pairing-modal";
import { TvStandbyScreen } from "@/components/player/tv-standby-screen";
import { TvSettingsModal } from "@/components/player/tv-settings-modal";
import { createNightStateSource } from "@/lib/api/night-state";
import { useNightState } from "@/hooks/use-night-state";
import {
  DEFAULT_BAR_PARTY_CONFIG,
  DEDICATION_STYLES,
  resolveActiveSkipVoteForTrack,
  resolveEffectiveQueueThreshold,
  type DedicationStyle,
  type PartyConfig,
  type PartySkipVoteState,
} from "@/lib/domain/party";
import {
  fetchServerPartyConfig,
  getStoredPartyConfig,
  updatePartyConfig,
  type PartyDuelState,
  type PartyRouletteState,
} from "@/lib/api/party-control";

interface PlayerScreenProps {
  slug: string;
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function decodeHtml(text: string): string {
  if (!text) return "";
  return text
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function PlayerScreen({ slug }: PlayerScreenProps) {
  const searchParams = useSearchParams();
  const [token, setToken] = useState<string | null>(null);
  const [pairModalOpen, setPairModalOpen] = useState(false);
  const [playerState, setPlayerState] = useState<PlayerStateResponse | null>(null);
  const [liveFallbackTracks, setLiveFallbackTracks] = useState<PlayerTrack[]>([]);

  // Continuous Night State Realtime Sync (Live Queue & Now Playing)
  const nightSource = useMemo(() => createNightStateSource(slug), [slug]);
  const { state: nightState, refresh: refreshNightState } = useNightState(nightSource, { pollMs: 3000 });
  const [partyConfig, setPartyConfig] = useState<PartyConfig>(DEFAULT_BAR_PARTY_CONFIG);
  const [activeDuel, setActiveDuel] = useState<PartyDuelState | null>(null);
  const [activeRoulette, setActiveRoulette] = useState<PartyRouletteState | null>(null);
  const [rouletteSpinIndex, setRouletteSpinIndex] = useState(0);
  const [rouletteSpinFinished, setRouletteSpinFinished] = useState(false);
  const [activeSkipVote, setActiveSkipVote] = useState<PartySkipVoteState | null>(null);
  const [maxQueueFit, setMaxQueueFit] = useState(8);
  const [maxCandidatesFit, setMaxCandidatesFit] = useState(6);
  // Screen mode: VIDEO (Video+Cola), PLAYLIST (Solo Playlist & Votos), CLEAN (Video 100% puro)
  const [screenMode, setScreenMode] = useState<"VIDEO" | "PLAYLIST" | "CLEAN">("VIDEO");
  // Video Mode: default to true so video is always visible
  const [videoMode, setVideoMode] = useState<boolean>(true);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [liveDedicationOverride, setLiveDedicationOverride] = useState<{
    dedication: string;
    guestName: string | null;
    timestamp: number;
  } | null>(null);
  const [dedicationFinished, setDedicationFinished] = useState(false);

  // Compute how many songs fit dynamically inside the screen's max height
  useEffect(() => {
    const updateMaxFit = () => {
      if (typeof window === "undefined") return;
      const vh = window.innerHeight;
      // Reserve header (~52px), footer (~36px), and card headers (~150px)
      const availableForQueue = Math.max(240, vh - (videoMode ? 290 : 185));
      const availableForCands = Math.max(220, vh - (videoMode ? 310 : 215));
      setMaxQueueFit(Math.max(4, Math.floor(availableForQueue / 56)));
      setMaxCandidatesFit(Math.max(4, Math.floor(availableForCands / 74)));
    };
    updateMaxFit();
    window.addEventListener("resize", updateMaxFit);
    return () => window.removeEventListener("resize", updateMaxFit);
  }, [videoMode]);

  // Sync partyConfig + activeDuel + activeRoulette + activeSkipVote from server
  useEffect(() => {
    let active = true;
    setPartyConfig(getStoredPartyConfig(slug, nightState?.settings?.partyConfig));

    const pollPartyState = async () => {
      try {
        const { partyConfig: serverCfg } = await fetchServerPartyConfig(slug);
        if (!active) return;
        setPartyConfig(serverCfg);
        setActiveSkipVote(serverCfg.activeSkipVote ?? null);

        if (serverCfg.activeDuel) {
          const duelObj = serverCfg.activeDuel as unknown as PartyDuelState;
          const elapsedDuel = (Date.now() - new Date(duelObj.startedAt).getTime()) / 1000;
          if (elapsedDuel < (duelObj.durationSeconds || 30)) {
            setActiveDuel(duelObj);
          }
        }
        if (serverCfg.activeRoulette) {
          const roulObj = serverCfg.activeRoulette as unknown as PartyRouletteState;
          const elapsedRoul = (Date.now() - new Date(roulObj.startedAt).getTime()) / 1000;
          if (elapsedRoul < 12) {
            setActiveRoulette((prev) => {
              const prevId = prev?.spinId || prev?.rouletteId;
              const nextId = roulObj.spinId || roulObj.rouletteId;
              if (prevId && prevId === nextId) return prev;
              setRouletteSpinFinished(false);
              setRouletteSpinIndex(0);
              return roulObj;
            });
          }
        }
      } catch {
        // Ignore
      }
    };

    void pollPartyState();
    const pollInterval = setInterval(() => void pollPartyState(), 3000);

    const onPartyChange = (e: Event) => {
      const detail = (e as CustomEvent<{ slug?: string; config?: PartyConfig }>).detail;
      if (!detail?.slug || detail.slug === slug) {
        setPartyConfig(detail?.config ?? getStoredPartyConfig(slug, nightState?.settings?.partyConfig));
      }
    };
    const onPartyEvent = (e: Event) => {
      const detail = (e as CustomEvent<{
        type?: string;
        duel?: PartyDuelState;
        roulette?: PartyRouletteState;
      }>).detail;
      if (detail?.type === "party_duel_start" && detail.duel) {
        setActiveDuel(detail.duel);
      } else if (detail?.type === "party_roulette_spin" && detail.roulette) {
        setRouletteSpinFinished(false);
        setRouletteSpinIndex(0);
        setActiveRoulette(detail.roulette);
      }
    };
    window.addEventListener("poneleplay:party-config-changed", onPartyChange);
    window.addEventListener("poneleplay:party-event", onPartyEvent);
    return () => {
      active = false;
      clearInterval(pollInterval);
      window.removeEventListener("poneleplay:party-config-changed", onPartyChange);
      window.removeEventListener("poneleplay:party-event", onPartyEvent);
    };
  }, [slug, nightState?.settings?.partyConfig]);

  useEffect(() => {
    if (!activeDuel) return;
    const timer = setTimeout(() => setActiveDuel(null), (activeDuel.durationSeconds || 30) * 1000);
    return () => clearTimeout(timer);
  }, [activeDuel]);

  // Animate Roulette wheel cycling through candidates for 3.2s before revealing winner
  useEffect(() => {
    if (!activeRoulette) return;
    setRouletteSpinFinished(false);
    const poolLen = Math.max(1, activeRoulette.candidates?.length || 1);
    const spinInterval = setInterval(() => {
      setRouletteSpinIndex((prev) => (prev + 1) % poolLen);
    }, 110);
    const stopSpinTimer = setTimeout(() => {
      clearInterval(spinInterval);
      setRouletteSpinFinished(true);
    }, 3200);
    const closeTimer = setTimeout(() => {
      setActiveRoulette(null);
      void refreshNightState();
    }, 11000);
    return () => {
      clearInterval(spinInterval);
      clearTimeout(stopSpinTimer);
      clearTimeout(closeTimer);
    };
  }, [activeRoulette?.spinId, activeRoulette, refreshNightState]);

  const effectiveThreshold = useMemo(
    () => resolveEffectiveQueueThreshold(partyConfig),
    [partyConfig],
  );

  const liveNightQueue: PlayerTrack[] = useMemo(() => {
    if (nightState?.queue && nightState.queue.length > 0) {
      return nightState.queue
        .filter((item) => item.status === "queued" || item.voteCount >= effectiveThreshold)
        .map((item) => ({
        itemId: item.id,
        trackId: item.trackId,
        title: item.title,
        artist: item.artist,
        source: item.source,
        durationSeconds: item.durationSeconds ?? 210,
        youtubeVideoId: item.youtubeVideoId || undefined,
        thumbnailUrl: item.thumbnailUrl ?? null,
        voteCount: item.voteCount,
        isKaraoke: item.isKaraoke,
        guestName: item.guestName ?? null,
        dedication: item.dedication ?? null,
      }));
    }
    return [];
  }, [nightState, effectiveThreshold]);

  const liveNightNowPlaying: PlayerTrack | null = useMemo(() => {
    if (nightState?.nowPlaying) {
      return {
        itemId: nightState.nowPlaying.id,
        trackId: nightState.nowPlaying.trackId,
        title: nightState.nowPlaying.title,
        artist: nightState.nowPlaying.artist,
        source: nightState.nowPlaying.source,
        durationSeconds: nightState.nowPlaying.durationSeconds ?? 210,
        youtubeVideoId: nightState.nowPlaying.youtubeVideoId || undefined,
        thumbnailUrl: nightState.nowPlaying.thumbnailUrl ?? null,
        voteCount: nightState.nowPlaying.voteCount,
        isKaraoke: nightState.nowPlaying.isKaraoke,
        guestName: nightState.nowPlaying.guestName ?? null,
        dedication: nightState.nowPlaying.dedication ?? null,
      };
    }
    return null;
  }, [nightState]);

  const [clock, setClock] = useState("23:48");
  const [qr, setQr] = useState<string | null>(null);
  const [qrModal, setQrModal] = useState(false);
  const [qrModalTimer, setQrModalTimer] = useState(25);
  const [sidebarTab, setSidebarTab] = useState<"queue" | "candidates">("queue");
  const [showHotkeysHelp, setShowHotkeysHelp] = useState(false);
  const [liveToast, setLiveToast] = useState<{ icon: string; message: string } | null>(null);
  const [roundSecondsLeft, setRoundSecondsLeft] = useState<number>(180);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isVideoFullscreen, setIsVideoFullscreen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);

  const [mounted, setMounted] = useState<boolean>(false);
  const [origin, setOrigin] = useState<string>(() =>
    typeof window !== "undefined" ? window.location.origin : "",
  );

  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as unknown as { toggleTvScreenMode?: () => void }).toggleTvScreenMode = () => {
        toggleVideoMode();
      };
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
      const savedMode = localStorage.getItem("poneleplay.player.screenMode");
      if (savedMode === "PLAYLIST" || savedMode === "CLEAN" || savedMode === "VIDEO") {
        setScreenMode(savedMode);
        setVideoMode(savedMode !== "PLAYLIST");
        if (savedMode === "CLEAN") setIsVideoFullscreen(true);
      } else {
        const saved = localStorage.getItem("poneleplay.player.videoMode");
        if (saved !== null) {
          const vm = saved === "true";
          setVideoMode(vm);
          setScreenMode(vm ? "VIDEO" : "PLAYLIST");
        }
      }
    }
  }, []);

  const [volume, setVolume] = useState(85);
  const [isMuted, setIsMuted] = useState(false);
  // audioRouting: derived from Cabina commands — BOTH | CABINA_ONLY | TV_ONLY
  const [audioRouting, setAudioRouting] = useState<"BOTH" | "CABINA_ONLY" | "TV_ONLY">("BOTH");
  const [isPlaying, setIsPlaying] = useState(true);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [karaokeMode, setKaraokeMode] = useState(false);
  const [hudMessage, setHudMessage] = useState<string | null>(null);
  const [manualNowPlaying, setManualNowPlaying] = useState<PlayerTrack | null>(null);

  // Auto-cycle sidebar between upcoming queue and candidate proposals every 14 seconds
  useEffect(() => {
    const candidateCount = nightState?.candidates?.length || 0;
    if (candidateCount === 0) {
      setSidebarTab("queue");
      return;
    }
    const timer = setInterval(() => {
      setSidebarTab((prev) => (prev === "queue" ? "candidates" : "queue"));
    }, 14000);
    return () => clearInterval(timer);
  }, [nightState?.candidates?.length]);

  // Auto-close Large QR modal after 25s
  useEffect(() => {
    if (!qrModal) {
      setQrModalTimer(25);
      return;
    }
    const interval = setInterval(() => {
      setQrModalTimer((prev) => {
        if (prev <= 1) {
          setQrModal(false);
          return 25;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [qrModal]);

  // Sync voting round countdown on TV
  useEffect(() => {
    if (nightState?.votingRound?.remainingSeconds !== undefined) {
      setRoundSecondsLeft(nightState.votingRound.remainingSeconds);
    }
  }, [nightState?.votingRound?.remainingSeconds]);

  useEffect(() => {
    if (!nightState?.votingRound?.enabled) return;
    const timer = setInterval(() => {
      setRoundSecondsLeft((prev) => {
        if (prev <= 1) {
          void refreshNightState();
          return nightState?.votingRound?.durationSeconds ?? 180;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [nightState?.votingRound?.enabled, nightState?.votingRound?.durationSeconds, refreshNightState]);


  const videoContainerRef = useRef<HTMLDivElement>(null);
  const isVideoFullscreenRef = useRef(isVideoFullscreen);
  isVideoFullscreenRef.current = isVideoFullscreen;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const handleSeekRef = useRef<(sec: number) => void>(() => {});
  const elapsedRef = useRef(0);
  elapsedRef.current = elapsed;
  const controlChannelRef = useRef<import("@supabase/supabase-js").RealtimeChannel | null>(null);
  const masterTargetTimeRef = useRef<{ seconds: number; updatedAtMs: number; isPaused: boolean }>({
    seconds: 0,
    updatedAtMs: 0,
    isPaused: false,
  });
  const lastSeekSeqRef = useRef<number>(0);

  // Single playback engine: controls the ONE visible YouTube iframe (no hidden 2nd player)
  const engine: IframePlaybackEngine = useMemo(
    () =>
      createIframeEngine(
        () => iframeRef.current,
        (playing) => setIsPlaying(playing),
        (videoId) => {
          // 1. Notify Cabina that TV finished buffering the new video so both start at 0:00 in lockstep
          if (controlChannelRef.current) {
            void controlChannelRef.current.send({
              type: "broadcast",
              event: "tv_ready",
              payload: { videoId, timestamp: Date.now() },
            });
          }
          // 2. If Cabina is already ahead when TV finishes buffering its first frame, catch up immediately
          const mt = masterTargetTimeRef.current;
          if (!mt.isPaused && mt.updatedAtMs > 0 && Date.now() - mt.updatedAtMs < 8000) {
            const liveMasterSec = mt.seconds + Math.max(0, (Date.now() - mt.updatedAtMs) / 1000);
            const tvCur = engine.getCurrentTime?.() ?? 0;
            if (liveMasterSec > 0.35 && Math.abs(tvCur - liveMasterSec) > 0.35) {
              engine.seekTo?.(liveMasterSec);
              setElapsed(Math.floor(liveMasterSec));
              elapsedRef.current = Math.floor(liveMasterSec);
            }
          }
        },
      ),
    [],
  );

  // Listen to the iframe's messages (time, duration, state, ended, errors)
  useEffect(() => engine.attach(), [engine]);

  // YouTube embed handshake, repeated so every newly mounted iframe (new song) answers
  useEffect(() => {
    const timer = setInterval(() => engine.handshake(), 1000);
    return () => clearInterval(timer);
  }, [engine]);

  const [checkedStorage, setCheckedStorage] = useState(false);

  // Check token from search params or localStorage
  useEffect(() => {
    const fromParam = searchParams.get("token");
    if (fromParam) {
      setToken(fromParam);
      localStorage.setItem(`poneleplay.player.${slug}`, fromParam);
      setCheckedStorage(true);
      return;
    }

    const saved = localStorage.getItem(`poneleplay.player.${slug}`);
    if (saved) {
      setToken(saved);
    }
    setCheckedStorage(true);
  }, [searchParams, slug]);

  const handleUnpair = useCallback(() => {
    if (typeof window !== "undefined" && window.confirm("¿Deseás desvincular esta pantalla TV del salón?")) {
      setToken(null);
      localStorage.removeItem(`poneleplay.player.${slug}`);
      localStorage.removeItem("poneleplay.player.screenMode");
      localStorage.removeItem("poneleplay.player.videoMode");
      engine.pause?.();
      setIsPlaying(false);
      window.location.href = "/tv";
    }
  }, [slug, engine]);

  // Fetch venue fallback tracks directly from Supabase & listen for playlist updates
  useEffect(() => {
    if (!token) return;
    let active = true;

    async function fetchVenueTracks() {
      try {
        const { createBrowserSupabase } = await import("@/lib/api/supabase/browser");
        const supabase = createBrowserSupabase();
        const { data: vData } = await supabase
          .from("venues")
          .select("id")
          .eq("slug", slug)
          .single();

        if (vData && typeof vData === "object" && "id" in vData) {
          const venueId = (vData as { id: string }).id;
          const fbTracks = await fetchFallback(venueId);
          if (active && fbTracks.length > 0) {
            setLiveFallbackTracks(
              fbTracks.map((tr) => ({
                itemId: `fb-${tr.id}`,
                trackId: tr.id,
                title: tr.title,
                artist: tr.artist,
                source: tr.source,
                durationSeconds: tr.durationSeconds ?? 210,
                youtubeVideoId: tr.youtubeVideoId ?? "T_FkEw27XJ0",
                thumbnailUrl: tr.thumbnailUrl ?? null,
                voteCount: 0,
              })),
            );
          }
        }
      } catch {
        // Fallback to demo tracks
      }
    }

    void fetchVenueTracks();

    let channel: import("@supabase/supabase-js").RealtimeChannel | null = null;
    void import("@/lib/api/supabase/browser").then(({ createBrowserSupabase }) => {
      if (!active) return;
      const supabase = createBrowserSupabase();
      const existingFallback = supabase.getChannels().find(
        (c) => c.topic === `tv-fallback-sync:${slug}` || c.topic === `realtime:tv-fallback-sync:${slug}`
      );
      if (existingFallback) {
        void supabase.removeChannel(existingFallback);
      }

      channel = supabase
        .channel(`tv-fallback-sync:${slug}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "fallback_tracks" },
          () => {
            void fetchVenueTracks();
          },
        )
        .subscribe();
    });

    return () => {
      active = false;
      if (channel) {
        void import("@/lib/api/supabase/browser").then(({ createBrowserSupabase }) => {
          const supabase = createBrowserSupabase();
          void supabase.removeChannel(channel!);
        });
      }
    };
  }, [slug, token]);

  // Live clock
  useEffect(() => {
    const update = () =>
      setClock(
        new Intl.DateTimeFormat("es-AR", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(new Date()),
      );

    update();
    const interval = window.setInterval(update, 10000);
    return () => window.clearInterval(interval);
  }, []);

  // Elapsed runner: real position/duration reported by the single YouTube iframe
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      const d = Math.floor(engine.getDuration());
      if (d > 0) setVideoDuration(d);
      if (engine.hasLiveTime()) {
        const ct = Math.floor(engine.getCurrentTime());
        setElapsed(ct);
        elapsedRef.current = ct;
        return;
      }
      setElapsed((prev) => {
        const next = prev + 1;
        elapsedRef.current = next;
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [engine, isPlaying]);

  // QR Code generator
  useEffect(() => {
    let active = true;
    const clientUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/p/${slug}`
        : `https://poneleplay.app/p/${slug}`;

    QRCode.toDataURL(clientUrl, {
      margin: 1,
      width: 520,
      errorCorrectionLevel: "M",
      color: { dark: "#0a0e17", light: "#ffffff" },
    })
      .then((url) => {
        if (active) setQr(url);
      })
      .catch(() => {
        if (active) setQr(null);
      });

    return () => {
      active = false;
    };
  }, [slug]);

  const nativeFsActiveRef = useRef(false);

  // Fullscreen state listener (window or dedicated video container)
  useEffect(() => {
    const onFsChange = () => {
      const isFs = Boolean(document.fullscreenElement);
      setIsFullscreen(isFs);
      if (isFs) {
        nativeFsActiveRef.current = true;
      } else if (nativeFsActiveRef.current) {
        // User exited native browser fullscreen via Esc
        nativeFsActiveRef.current = false;
        setIsVideoFullscreen(false);
        isVideoFullscreenRef.current = false;
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleVideoFullscreen = useCallback(() => {
    setIsVideoFullscreen((prev) => {
      const next = !prev;
      isVideoFullscreenRef.current = next;
      if (next) {
        setVideoMode(true);
      }
      return next;
    });
  }, []);

  const toggleFullscreen = useCallback(() => {
    toggleVideoFullscreen();
  }, [toggleVideoFullscreen]);

  const toggleScreenMode = useCallback(() => {
    setScreenMode((prev) => {
      const next = prev === "VIDEO" ? "PLAYLIST" : prev === "PLAYLIST" ? "CLEAN" : "VIDEO";
      if (typeof window !== "undefined") {
        localStorage.setItem("poneleplay.player.screenMode", next);
        localStorage.setItem("poneleplay.player.videoMode", String(next !== "PLAYLIST"));
      }
      setVideoMode(next !== "PLAYLIST");
      setIsVideoFullscreen(next === "CLEAN");
      setLiveToast({
        icon: next === "VIDEO" ? "smart_display" : next === "PLAYLIST" ? "queue_music" : "fullscreen",
        message:
          next === "VIDEO"
            ? "Modo: Video Salón + Playlist"
            : next === "PLAYLIST"
              ? "Modo: Solo Playlist & Votos"
              : "Modo: Video Limpio 100%",
      });
      setTimeout(() => setLiveToast(null), 3000);
      return next;
    });
  }, []);

  function toggleVideoMode() {
    toggleScreenMode();
  }

  const handleUnlockAudio = useCallback(() => {
    void engine.play();
    setAudioUnlocked(true);
    if (isMuted) {
      engine.mute?.();
    } else {
      engine.unMute?.();
      engine.setVolume?.(volume);
    }
  }, [engine, isMuted, volume]);

  // Sync isPlaying with the player
  useEffect(() => {
    if (isPlaying) {
      void engine.play();
    } else {
      engine.pause?.();
    }
  }, [isPlaying, engine]);

  // Sync volume and mute with the TV engine
  useEffect(() => {
    engine.setVolume?.(volume);
    if (isMuted) {
      engine.mute?.();
    } else {
      engine.unMute?.();
    }
  }, [volume, isMuted, engine]);

  // Global click anywhere to ensure video playback begins smoothly
  useEffect(() => {
    const onFirstClick = () => {
      if (!audioUnlocked) {
        handleUnlockAudio();
      }
    };
    window.addEventListener("click", onFirstClick, { once: true });
    return () => window.removeEventListener("click", onFirstClick);
  }, [audioUnlocked, handleUnlockAudio]);

  // TV Screen Remote Navigation & Hotkeys
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement) return;

      const key = event.key.toLowerCase();

      // Space: Toggle Play / Pause
      if (key === " " || event.code === "Space") {
        event.preventDefault();
        setIsPlaying((prev) => {
          const next = !prev;
          if (next) void engine.play?.();
          else engine.pause?.();
          setLiveToast({
            icon: next ? "play_arrow" : "pause",
            message: next ? "▶️ Reproducción Reanudada" : "⏸️ Reproducción Pausada",
          });
          setTimeout(() => setLiveToast(null), 2500);
          return next;
        });
      }
      if (key === "f" || key === "enter") {
        toggleVideoFullscreen();
      }
      if (key === "v" || key === "p") {
        toggleScreenMode();
      }
      // M key — mute is now cabina-only. Keep for local testing but show a toast hint.
      if (key === "m") {
        setLiveToast({ icon: "volume_off", message: "El audio se controla desde la Cabina" });
        setTimeout(() => setLiveToast(null), 3000);
      }
      if (key === "h" || key === "?") {
        setShowHotkeysHelp((prev) => !prev);
      }
      if (key === "q") {
        setQrModal((val) => !val);
      }
      if (key === "o" || key === "s" || key === "f2" || key === "menu") {
        setShowSettingsModal((prev) => !prev);
      }
      if (key === "escape") {
        if (showSettingsModal) {
          setShowSettingsModal(false);
          return;
        }
        if (showHotkeysHelp) {
          setShowHotkeysHelp(false);
          return;
        }
        if (qrModal) {
          setQrModal(false);
          return;
        }
        if (pairModalOpen) {
          setPairModalOpen(false);
          return;
        }
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
          return;
        }
        // Esc opens Settings menu when no modal is active (mirroring Android TV Back button!)
        setShowSettingsModal(true);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screenMode, toggleScreenMode, toggleVideoFullscreen, showSettingsModal, showHotkeysHelp, qrModal, pairModalOpen, engine]);

  // Unified track list (live night queue -> runtime queue -> venue fallback -> demo)
  const allTracks: PlayerTrack[] = useMemo(() => {
    if (!token) return [];
    if (liveNightQueue.length > 0) {
      if (
        liveNightNowPlaying &&
        !liveNightQueue.some((t) => t.itemId === liveNightNowPlaying.itemId)
      ) {
        return [liveNightNowPlaying, ...liveNightQueue];
      }
      return liveNightQueue;
    }
    if (playerState?.queue && playerState.queue.length > 0) {
      if (
        playerState.nowPlaying &&
        !playerState.queue.some((t) => t.itemId === playerState.nowPlaying?.itemId)
      ) {
        return [playerState.nowPlaying, ...playerState.queue];
      }
      return playerState.queue;
    }
    if (playerState?.fallback && playerState.fallback.length > 0) {
      return playerState.fallback;
    }
    if (liveFallbackTracks.length > 0) {
      return liveFallbackTracks;
    }
    return [
      {
        itemId: demoNowPlaying.id,
        trackId: demoNowPlaying.id,
        title: demoNowPlaying.title,
        artist: demoNowPlaying.artist,
        source: demoNowPlaying.source,
        durationSeconds: 332,
        youtubeVideoId: demoNowPlaying.youtubeVideoId ?? "T_FkEw27XJ0",
        thumbnailUrl: null,
        voteCount: demoNowPlaying.votes,
      },
      ...demoQueue.map((item) => ({
        itemId: item.id,
        trackId: item.id,
        title: item.title,
        artist: item.artist,
        source: item.source,
        durationSeconds: 252,
        youtubeVideoId: item.youtubeVideoId,
        thumbnailUrl: null,
        voteCount: item.votes,
      })),
    ];
  }, [token, liveNightQueue, liveNightNowPlaying, playerState, liveFallbackTracks]);

  // Now playing: prioritizing manualNowPlaying -> liveNightNowPlaying -> playerState.nowPlaying -> allTracks[0]
  // Always enrich with guestName, dedication, and isKaraoke from liveNightNowPlaying / liveNightQueue
  const nowPlaying: PlayerTrack | null = useMemo(() => {
    if (!token) return null;
    const base =
      manualNowPlaying ||
      liveNightNowPlaying ||
      playerState?.nowPlaying ||
      allTracks[0] ||
      null;
    if (!base) return null;

    const match =
      (liveNightNowPlaying &&
      (liveNightNowPlaying.trackId === base.trackId ||
        (liveNightNowPlaying.youtubeVideoId &&
          liveNightNowPlaying.youtubeVideoId === base.youtubeVideoId) ||
        liveNightNowPlaying.title.toLowerCase() === base.title.toLowerCase())
        ? liveNightNowPlaying
        : null) ||
      liveNightQueue.find(
        (q) =>
          (q.trackId && q.trackId === base.trackId) ||
          (q.youtubeVideoId && q.youtubeVideoId === base.youtubeVideoId) ||
          q.title.toLowerCase() === base.title.toLowerCase(),
      );

    const liveDed =
      liveDedicationOverride && Date.now() - liveDedicationOverride.timestamp < 120000
        ? liveDedicationOverride
        : null;

    return {
      ...base,
      guestName: liveDed?.guestName ?? (base.guestName || match?.guestName || null),
      dedication: liveDed?.dedication ?? (base.dedication || match?.dedication || null),
      isKaraoke: base.isKaraoke ?? match?.isKaraoke ?? false,
    };
  }, [token, manualNowPlaying, liveNightNowPlaying, liveNightQueue, playerState, allTracks, liveDedicationOverride]);

  // Reset dedication animation when track or dedication changes
  useEffect(() => {
    setDedicationFinished(false);
  }, [
    nowPlaying?.itemId,
    nowPlaying?.trackId,
    nowPlaying?.dedication,
    liveDedicationOverride?.timestamp,
  ]);

  // Rotated queue: tracks coming after nowPlaying so every Skip genuinely advances to the next track
  const queue: PlayerTrack[] = useMemo(() => {
    if (!nowPlaying || allTracks.length === 0) return allTracks;
    const idx = allTracks.findIndex(
      (t) =>
        t.itemId === nowPlaying.itemId ||
        (t.trackId && t.trackId === nowPlaying.trackId) ||
        (t.youtubeVideoId && t.youtubeVideoId === nowPlaying.youtubeVideoId),
    );
    if (idx === -1) return allTracks;
    return [...allTracks.slice(idx + 1), ...allTracks.slice(0, idx)];
  }, [allTracks, nowPlaying]);

  // Load new track into the single YouTube iframe whenever nowPlaying changes
  useEffect(() => {
    if (token && nowPlaying && mounted) {
      void engine.load(nowPlaying);
    }
  }, [token, nowPlaying, mounted, engine]);

  const venueName =
    nightState?.venue.name ||
    playerState?.venue.name ||
    "Billar Aurora";
  const isParty = partyConfig?.venueType === "party";
  const candidateProposals = nightState?.candidates || [];
  const duration = videoDuration ?? nowPlaying?.durationSeconds ?? 210;
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (elapsed / duration) * 100)) : 0;

  // Refs for stable access inside Realtime callbacks & broadcast interval
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const nowPlayingRef = useRef(nowPlaying);
  nowPlayingRef.current = nowPlaying;
  const lastCommandSeqRef = useRef<number | null>(null);
  const lastAdminProgressAtRef = useRef<number>(0);
  const lastTvSeekAtRef = useRef<number>(0);


  const handleSeek = useCallback(
    (targetSec: number) => {
      const maxDur = durationRef.current || 210;
      const clamped = Math.max(0, Math.min(maxDur, Math.floor(targetSec)));
      setElapsed(clamped);
      elapsedRef.current = clamped;
      engine.seekTo?.(clamped);
      setHudMessage(`⏩ Posición: ${formatDuration(clamped)}`);
      setTimeout(() => setHudMessage(null), 2000);
    },
    [engine],
  );

  useEffect(() => {
    handleSeekRef.current = handleSeek;
  }, [handleSeek]);

  // Reset counters when new track is loaded
  useEffect(() => {
    setElapsed(0);
    elapsedRef.current = 0;
    setVideoDuration(null);
  }, [nowPlaying?.itemId, nowPlaying?.youtubeVideoId]);

  const handleSkipNext = useCallback(
    async (fromRemote = false) => {
      const candidates = queue.length > 0 ? queue : allTracks;
      if (candidates.length > 0) {
        const nextTrack = candidates[0];
        setManualNowPlaying(nextTrack);
        setElapsed(0);
        elapsedRef.current = 0;
        setVideoDuration(nextTrack.durationSeconds ?? null);
        setIsPlaying(true);
        void engine.load(nextTrack);
        setHudMessage(`⏭️ Siguiente: ${nextTrack.title}`);
        setTimeout(() => setHudMessage(null), 3000);

        if (!fromRemote) {
          try {
            const { playTrackNow } = await import("@/lib/api/master-control");
            await playTrackNow(slug, {
              title: nextTrack.title,
              artist: nextTrack.artist,
              youtubeVideoId: nextTrack.youtubeVideoId ?? "T_FkEw27XJ0",
              thumbnailUrl: nextTrack.thumbnailUrl,
              durationSeconds: nextTrack.durationSeconds ?? undefined,
              isKaraoke: nextTrack.isKaraoke,
            });
          } catch {
            // Non-blocking fallback
          }
        }
      } else {
        setHudMessage("No hay más temas en la cola");
        setTimeout(() => setHudMessage(null), 2500);
      }
    },
    [slug, queue, allTracks, engine],
  );

  // Auto-advance exactly once when the video ends
  const handleSkipNextRef = useRef(handleSkipNext);
  useEffect(() => {
    handleSkipNextRef.current = handleSkipNext;
  }, [handleSkipNext]);

  useEffect(
    () =>
      engine.onEnded(() => {
        if (Date.now() - lastAdminProgressAtRef.current > 12000) {
          void handleSkipNextRef.current(false);
        }
      }),
    [engine],
  );


  // Master Remote Control synchronization (Single persistent Realtime channel + progress broadcast)
  useEffect(() => {
    let active = true;
    let channel: import("@supabase/supabase-js").RealtimeChannel | null = null;

    // 1. Initial State from Server (/api/tv/[slug] + fetchPlaybackState)
    void fetch(`/api/tv/${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((tvData) => {
        if (!active || !tvData?.ok) return;
        const pb = tvData.playback || {};
        if (typeof pb.tvMuted === "boolean") {
          setIsMuted(pb.tvMuted);
          if (pb.tvMuted) engine.mute?.();
          else engine.unMute?.();
        }
        if (typeof pb.positionSeconds === "number" && pb.positionSeconds >= 0) {
          masterTargetTimeRef.current = {
            seconds: pb.positionSeconds,
            updatedAtMs: Date.now(),
            isPaused: Boolean(pb.isPaused),
          };
          setElapsed(Math.floor(pb.positionSeconds));
          elapsedRef.current = Math.floor(pb.positionSeconds);
          if (pb.positionSeconds > 0.5) {
            engine.seekTo?.(pb.positionSeconds);
          }
        }
        if (typeof pb.seekSeq === "number") {
          lastSeekSeqRef.current = pb.seekSeq;
        }
      })
      .catch(() => {});

    void import("@/lib/api/master-control").then(({ fetchPlaybackState }) => {
      fetchPlaybackState(slug)
        .then((st) => {
          if (!active) return;
          if (typeof st.commandSeq === "number") {
            lastCommandSeqRef.current = st.commandSeq;
          }
          if (typeof st.volume === "number") {
            setVolume(st.volume);
            engine.setVolume?.(st.volume);
          }
          const trkMeta = (st.currentTrack as unknown as Record<string, unknown>) || {};
          if (typeof trkMeta.tvMuted === "boolean") {
            setIsMuted(Boolean(trkMeta.tvMuted));
            if (trkMeta.tvMuted) engine.mute?.();
            else engine.unMute?.();
          }
          if (typeof st.isPaused === "boolean") {
            setIsPlaying(!st.isPaused);
            if (st.isPaused) engine.pause?.();
            else void engine.play?.();
          }
          if (typeof st.karaokeMode === "boolean") {
            setKaraokeMode(st.karaokeMode);
            if (st.karaokeMode) setVideoMode(true);
          }
          if (st.currentTrack) {
            setManualNowPlaying(st.currentTrack);
          }
        })
        .catch(() => {});
    });

    // 2. Single persistent Realtime listener & progress broadcaster
    void import("@/lib/api/supabase/browser").then(({ createBrowserSupabase }) => {
      if (!active) return;
      const supabase = createBrowserSupabase();

      const existingControl = supabase.getChannels().find(
        (c) => c.topic === `playback-control:${slug}` || c.topic === `realtime:playback-control:${slug}`
      );
      if (existingControl) {
        void supabase.removeChannel(existingControl);
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

            if (cmd === "pause") {
              masterTargetTimeRef.current.isPaused = true;
              engine.pause?.();
              setIsPlaying(false);
              setHudMessage("⏸️ Música Pausada desde Cabina");
              setTimeout(() => setHudMessage(null), 3500);
            } else if (cmd === "resume") {
              masterTargetTimeRef.current.isPaused = false;
              masterTargetTimeRef.current.updatedAtMs = Date.now();
              void engine.play?.();
              setIsPlaying(true);
              setHudMessage("▶️ Música Reanudada desde Cabina");
              setTimeout(() => setHudMessage(null), 3500);
            } else if (cmd === "toggle_pause") {
              setIsPlaying((prev) => {
                const next = !prev;
                masterTargetTimeRef.current.isPaused = !next;
                masterTargetTimeRef.current.updatedAtMs = Date.now();
                if (next) void engine.play?.();
                else engine.pause?.();
                setHudMessage(next ? "▶️ Música Reanudada" : "⏸️ Música Pausada");
                setTimeout(() => setHudMessage(null), 3500);
                return next;
              });
            } else if (cmd === "set_volume") {
              const vol = Number(p.volume ?? 85);
              setVolume(vol);
              engine.setVolume?.(vol);
              setHudMessage(`🔊 Volumen: ${vol}%`);
              setTimeout(() => setHudMessage(null), 3500);
            } else if (cmd === "mute") {
              setIsMuted(true);
              engine.mute?.();
              setHudMessage("🔇 Salón Silenciado (Corte de Emergencia)");
              setTimeout(() => setHudMessage(null), 3500);
            } else if (cmd === "unmute") {
              setIsMuted(false);
              engine.unMute?.();
              setHudMessage("🔊 Audio Restablecido");
              setTimeout(() => setHudMessage(null), 3500);
            } else if (cmd === "toggle_mute") {
              setIsMuted((prev) => {
                const next = !prev;
                if (next) engine.mute?.();
                else engine.unMute?.();
                setHudMessage(next ? "🔇 Audio Silenciado" : "🔊 Audio Activo");
                setTimeout(() => setHudMessage(null), 3500);
                return next;
              });
            } else if (cmd === "set_tv_mute") {
              const tvMuted = Boolean(p.tvMuted ?? p.muted);
              setIsMuted(tvMuted);
              if (tvMuted) engine.mute?.();
              else {
                engine.unMute?.();
                engine.setVolume?.(volume);
              }
              if (typeof p.cabinaMuted === "boolean") {
                const cm = Boolean(p.cabinaMuted);
                setAudioRouting(cm && !tvMuted ? "TV_ONLY" : !cm && tvMuted ? "CABINA_ONLY" : "BOTH");
              } else {
                setAudioRouting(tvMuted ? "CABINA_ONLY" : "BOTH");
              }
              setHudMessage(tvMuted ? "🔇 Audio TV Silenciado desde Cabina" : "🔊 Audio TV Activado desde Cabina");
              setTimeout(() => setHudMessage(null), 3500);
            } else if (cmd === "skip") {
              void handleSkipNextRef.current(true);
            } else if (cmd === "seek") {
              const sec = Math.max(0, Number(p.seconds ?? 0));
              if (typeof p.seekSeq === "number") {
                lastSeekSeqRef.current = p.seekSeq;
              }
              masterTargetTimeRef.current = {
                seconds: sec,
                updatedAtMs: Date.now(),
                isPaused: !isPlayingRef.current,
              };
              lastTvSeekAtRef.current = Date.now();
              handleSeekRef.current(sec);
            } else if (cmd === "play_now" && p.track) {
              const track = p.track as PlayerTrack;
              masterTargetTimeRef.current = {
                seconds: 0,
                updatedAtMs: Date.now(),
                isPaused: false,
              };
              setManualNowPlaying(track);
              setIsPlaying(true);
              setVideoMode(true);
              setElapsed(0);
              elapsedRef.current = 0;
              void engine.load(track);
              engine.seekTo?.(0);
              void engine.play();
              setHudMessage(`🎵 Reproduciendo: ${track.title}`);
              setTimeout(() => setHudMessage(null), 3500);
            } else if (cmd === "reload") {
              setHudMessage("🔄 Reiniciando Sistema TV...");
              setTimeout(() => window.location.reload(), 800);
            } else if (cmd === "set_karaoke_mode") {
              const enabled = Boolean(p.enabled);
              setKaraokeMode(enabled);
              if (enabled) {
                setVideoMode(true);
                setHudMessage("🎤 Modo Karaoke Activado!");
              } else {
                setHudMessage("🎧 Modo Normal Restaurado");
              }
              setTimeout(() => setHudMessage(null), 3500);
            } else if (cmd === "toggle_fullscreen") {
              setIsVideoFullscreen((prev) => {
                const next = !prev;
                isVideoFullscreenRef.current = next;
                if (next) {
                  setVideoMode(true);
                  setHudMessage("🖥️ Pantalla Completa Activada");
                } else {
                  setHudMessage("🖥️ Modo Normal Restaurado");
                  if (document.fullscreenElement) {
                    document.exitFullscreen().catch(() => {});
                  }
                }
                setTimeout(() => setHudMessage(null), 3500);
                return next;
              });
            } else if (cmd === "toggle_video_mode") {
              toggleVideoMode();
            } else if (cmd === "set_video_mode") {
              const enable = Boolean(p.enabled);
              setVideoMode(enable);
              if (typeof window !== "undefined") {
                localStorage.setItem("poneleplay.player.videoMode", String(enable));
              }
              setLiveToast({
                icon: enable ? "smart_display" : "queue_music",
                message: enable ? "Modo: Video Salón HD" : "Modo: Énfasis en Playlist & Propuestas",
              });
              setTimeout(() => setLiveToast(null), 3000);
            } else if (cmd === "set_fullscreen") {
              const enableFs = Boolean(p.isFullscreen);
              setIsVideoFullscreen(enableFs);
              isVideoFullscreenRef.current = enableFs;
              if (enableFs) {
                setVideoMode(true);
                setHudMessage("🖥️ Pantalla Completa Activada");
              } else {
                setHudMessage("🖥️ Modo Normal Restaurado");
                if (document.fullscreenElement) {
                  document.exitFullscreen().catch(() => {});
                }
              }
              setTimeout(() => setHudMessage(null), 3500);
            } else if (cmd === "set_tv_display") {
              const cfg = (p.config || p.displayConfig || {}) as Record<string, unknown>;
              if (cfg.mode === "VIDEO") {
                setScreenMode("VIDEO");
                setIsVideoFullscreen(false);
                setVideoMode(true);
              } else if (cfg.mode === "PLAYLIST") {
                setScreenMode("PLAYLIST");
                setIsVideoFullscreen(false);
                setVideoMode(false);
              } else if (cfg.mode === "CLEAN") {
                setScreenMode("CLEAN");
                setIsVideoFullscreen(true);
                setVideoMode(true);
              }
              if (typeof cfg.tvMuted === "boolean") {
                setIsMuted(cfg.tvMuted);
                if (cfg.tvMuted) engine.mute?.();
                else engine.unMute?.();
              }
              setHudMessage("📺 Pantalla Actualizada desde Cabina");
              setTimeout(() => setHudMessage(null), 3000);
            }
          },
        )
        .on(
          "broadcast",
          { event: "tv_display_config" },
          (msg: { payload?: { config?: Record<string, unknown> } }) => {
            if (!active || !msg.payload?.config) return;
            const cfg = msg.payload.config;
            if (cfg.mode === "VIDEO") {
              setScreenMode("VIDEO");
              setIsVideoFullscreen(false);
              setVideoMode(true);
            } else if (cfg.mode === "PLAYLIST") {
              setScreenMode("PLAYLIST");
              setIsVideoFullscreen(false);
              setVideoMode(false);
            } else if (cfg.mode === "CLEAN") {
              setScreenMode("CLEAN");
              setIsVideoFullscreen(true);
              setVideoMode(true);
            }
            if (typeof cfg.tvMuted === "boolean") {
              setIsMuted(cfg.tvMuted);
              if (cfg.tvMuted) engine.mute?.();
              else engine.unMute?.();
            }
            setHudMessage("📺 Pantalla Actualizada desde Cabina");
            setTimeout(() => setHudMessage(null), 3000);
          },
        )
        .on(
          "broadcast",
          { event: "live_dedication" },
          (msg: { payload?: { guestName?: string | null; dedication?: string; timestamp?: number } }) => {
            if (!active || !msg.payload?.dedication) return;
            const { guestName, dedication } = msg.payload;
            setLiveDedicationOverride({
              dedication,
              guestName: guestName ?? null,
              timestamp: Date.now(),
            });
            setHudMessage(`💌 "${dedication}"${guestName ? ` — ${guestName}` : ""}`);
            setTimeout(() => setHudMessage(null), 8000);
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "venue_playback_state" },
          (payload: {
            new?: {
              is_paused?: boolean;
              volume?: number;
              is_muted?: boolean;
              karaoke_mode?: boolean;
              last_command?: string;
              command_seq?: number;
              current_track?: PlayerTrack;
            };
          }) => {
            if (!active || !payload.new) return;
            const st = payload.new;
            const isNewCommand =
              typeof st.command_seq === "number" &&
              st.command_seq !== lastCommandSeqRef.current;

            if (typeof st.command_seq === "number") {
              lastCommandSeqRef.current = st.command_seq;
            }

            if (typeof st.is_paused === "boolean") {
              masterTargetTimeRef.current.isPaused = st.is_paused;
              setIsPlaying(!st.is_paused);
              if (st.is_paused) engine.pause?.();
              else void engine.play?.();
            }
            if (typeof st.volume === "number") {
              setVolume(st.volume);
              engine.setVolume?.(st.volume);
            }
            const trkObj = (st.current_track as unknown as Record<string, unknown>) || {};
            if (typeof trkObj.tvMuted === "boolean") {
              const tvMuted = Boolean(trkObj.tvMuted);
              setIsMuted(tvMuted);
              if (tvMuted) engine.mute?.();
              else engine.unMute?.();
            }
            if (typeof st.karaoke_mode === "boolean") {
              setKaraokeMode(st.karaoke_mode);
              if (st.karaoke_mode) setVideoMode(true);
            }
            if (isNewCommand && st.last_command === "seek" && typeof trkObj.positionSeconds === "number") {
              const sec = Math.max(0, Number(trkObj.positionSeconds));
              masterTargetTimeRef.current = {
                seconds: sec,
                updatedAtMs: Date.now(),
                isPaused: Boolean(st.is_paused),
              };
              lastTvSeekAtRef.current = Date.now();
              handleSeekRef.current(sec);
            } else if (isNewCommand && st.last_command === "skip") {
              if (st.current_track) {
                setManualNowPlaying(st.current_track);
                setElapsed(0);
                elapsedRef.current = 0;
                void engine.load(st.current_track);
                engine.seekTo?.(0);
                void engine.play();
              } else {
                void handleSkipNextRef.current(true);
              }
            } else if (isNewCommand && st.last_command === "play_now" && st.current_track) {
              masterTargetTimeRef.current = {
                seconds: 0,
                updatedAtMs: Date.now(),
                isPaused: false,
              };
              setManualNowPlaying(st.current_track);
              setElapsed(0);
              elapsedRef.current = 0;
              void engine.load(st.current_track);
              engine.seekTo?.(0);
              void engine.play();
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
              track?: PlayerTrack;
              forceSeek?: boolean;
              seekSeq?: number;
              tvMuted?: boolean;
              isFromAdminAudio?: boolean;
              sentAt?: number;
            };
          }) => {
            if (!active || !msg.payload) return;
            const {
              currentTime,
              duration: d,
              isPaused: p,
              track,
              volume: vol,
              isMuted: muted,
              tvMuted,
              forceSeek,
              seekSeq,
              isFromAdminAudio,
              sentAt,
            } = msg.payload as Record<string, unknown>;

            // Compensate for network transit latency if sentAt is present
            const latency =
              typeof sentAt === "number"
                ? Math.max(0, Math.min(2, (Date.now() - sentAt) / 1000))
                : 0;
            const targetTime =
              (typeof currentTime === "number" && !isNaN(currentTime) ? currentTime : 0) +
              (forceSeek ? 0 : latency);

            if (typeof currentTime === "number" && !isNaN(currentTime)) {
              masterTargetTimeRef.current = {
                seconds: targetTime,
                updatedAtMs: Date.now(),
                isPaused: Boolean(p),
              };
              setElapsed(Math.floor(targetTime));
              elapsedRef.current = Math.floor(targetTime);
              lastAdminProgressAtRef.current = Date.now();
            }
            if (typeof d === "number" && !isNaN(d) && d > 0) {
              setVideoDuration(Math.floor(d));
              durationRef.current = Math.floor(d);
            }
            if (typeof p === "boolean") {
              if (p) {
                if (isPlayingRef.current) {
                  setIsPlaying(false);
                  engine.pause?.();
                }
              } else {
                if (!isPlayingRef.current) {
                  setIsPlaying(true);
                  void engine.play?.();
                }
              }
            }
            if (typeof tvMuted === "boolean") {
              setIsMuted(tvMuted);
              if (tvMuted) engine.mute?.();
              else engine.unMute?.();
            } else if (!isFromAdminAudio) {
              if (typeof vol === "number") {
                setVolume(vol);
                engine.setVolume?.(vol);
              }
              if (typeof muted === "boolean") {
                setIsMuted(muted);
                if (muted) engine.mute?.();
                else engine.unMute?.();
              }
            }

            // Explicit operator seek (forward/backward/scrubber/restart): apply immediately!
            const isNewSeekSeq =
              typeof seekSeq === "number" && seekSeq !== lastSeekSeqRef.current;
            if (forceSeek || isNewSeekSeq) {
              if (typeof seekSeq === "number") lastSeekSeqRef.current = seekSeq;
              lastTvSeekAtRef.current = Date.now();
              handleSeekRef.current(targetTime);
              return;
            }

            if (track) {
              const trk = track as PlayerTrack;
              const cur = nowPlayingRef.current;
              const isDiff =
                !cur ||
                (trk.youtubeVideoId && cur.youtubeVideoId !== trk.youtubeVideoId) ||
                cur.title.toLowerCase() !== trk.title.toLowerCase();
              if (isDiff) {
                setManualNowPlaying(trk);
                void engine.load(trk).then(() => {
                  if (targetTime > 0.35) {
                    engine.seekTo?.(targetTime);
                  }
                });
              } else if (typeof currentTime === "number" && !isNaN(currentTime) && !p) {
                // High-precision sync: check live TV time against Cabina target time
                const tvSec = engine.getCurrentTime?.() ?? elapsedRef.current;
                const drift = Math.abs(tvSec - targetTime);

                // During the first 4 seconds of a song, lock aggressively (>0.45s) so start is 100% synced;
                // afterwards only seek if drift >= 1.5s to prevent mid-song buffering hiccups
                const threshold = targetTime < 4.5 ? 0.45 : 1.5;
                const cooldown = targetTime < 4.5 ? 1400 : 3500;
                if (drift >= threshold && Date.now() - lastTvSeekAtRef.current > cooldown) {
                  lastTvSeekAtRef.current = Date.now();
                  engine.seekTo?.(targetTime);
                }
              }
            }
          },
        )
        .on(
          "broadcast",
          { event: "party_event" },
          (msg: { payload?: Record<string, unknown> }) => {
            if (!active || !msg.payload) return;
            const p = msg.payload;
            if (p.type === "party_config_updated" && p.partyConfig) {
              setPartyConfig(p.partyConfig as PartyConfig);
            } else if (p.type === "party_duel_start" && p.duel) {
              setActiveDuel(p.duel as PartyDuelState);
            } else if (p.type === "party_duel_vote") {
              const choice = p.choice;
              setActiveDuel((prev) => {
                if (!prev) return prev;
                if (choice === "A") return { ...prev, votesA: prev.votesA + 1 };
                if (choice === "B") return { ...prev, votesB: prev.votesB + 1 };
                return prev;
              });
            } else if (p.type === "party_roulette_spin" && p.roulette) {
              setRouletteSpinFinished(false);
              setRouletteSpinIndex(0);
              setActiveRoulette(p.roulette as PartyRouletteState);
            } else if (p.type === "party_skip_vote_updated") {
              if (p.skipped || !p.activeSkipVote) {
                setActiveSkipVote(null);
                if (p.skipped) {
                  setHudMessage("⏭️ ¡Votación aprobada! Cambiando a la siguiente canción...");
                  setTimeout(() => setHudMessage(null), 3500);
                  void refreshNightState();
                }
              } else {
                setActiveSkipVote(p.activeSkipVote as PartySkipVoteState);
              }
            } else if (p.type === "party_skip_vote_passed") {
              setActiveSkipVote(null);
              setHudMessage("⏭️ ¡Votación aprobada! Cambiando a la siguiente canción...");
              setTimeout(() => setHudMessage(null), 3500);
              void refreshNightState();
            }
          },
        )
        .subscribe();
      controlChannelRef.current = channel;
    });

    return () => {
      active = false;
      controlChannelRef.current = null;
      if (channel) {
        void import("@/lib/api/supabase/browser").then(({ createBrowserSupabase }) => {
          const supabase = createBrowserSupabase();
          void supabase.removeChannel(channel!);
        });
      }
    };
  }, [slug, engine]);

  // TV Standby Guard: NO audio, NO video until paired!
  if (mounted && checkedStorage && !token) {
    return (
      <TvStandbyScreen
        slug={slug}
        venueName={venueName}
        clock={clock}
        isFullscreen={isFullscreen}
        toggleFullscreen={toggleFullscreen}
        onPaired={(pairedToken) => {
          setToken(pairedToken);
          localStorage.setItem(`poneleplay.player.${slug}`, pairedToken);
          setPairModalOpen(false);
        }}
      />
    );
  }

  return (
    <div
      className={
        screenMode !== "PLAYLIST"
          ? "fixed inset-0 w-screen h-screen bg-black overflow-hidden select-none"
          : "tech-bg relative flex h-screen max-h-screen w-screen flex-col justify-between overflow-hidden p-2.5 sm:p-3 md:p-3.5 lg:p-4 text-[#dfe2ef] select-none"
      }
    >
      {/* Realtime Master Control HUD Message Toast */}
      {hudMessage && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-[#0A0E17]/95 text-white font-mono text-xs font-bold px-5 py-1.5 rounded-full border border-indigo-500/50 shadow-2xl animate-fade-in flex items-center gap-2">
          <span>{hudMessage}</span>
        </div>
      )}

      {/* Runtime coordinator if connected with token */}
      {token ? (
        <PlayerRuntime
          token={token}
          slug={slug}
          engine={engine}
          onStateChange={(st) => setPlayerState(st)}
        />
      ) : null}

      {/* ================= TOP BAR (COMPACT & SLEEK BROADCAST HEADER — PLAYLIST MODE ONLY) ================= */}
      {screenMode === "PLAYLIST" && (
        <header className="w-full px-3.5 py-1.5 flex justify-between items-center z-40 bg-[#121622] border border-[#232b42] rounded-lg shadow-md shrink-0 mb-2">
          {/* Brand & Venue Info */}
          <div className="flex items-center gap-2.5">
            {/* Minimal Brand */}
            <div className="flex items-center gap-1.5">
              <div className="size-6 rounded-md bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white shadow-sm">
                <span className="material-symbols-outlined text-[14px]">graphic_eq</span>
              </div>
              <span className="font-bold text-white text-xs tracking-tight">
                Ponele<span className="text-cyan-400">Play</span>
              </span>
            </div>

            <div className="h-3 w-px bg-[#232b42]" />

            {/* Venue Badge (Clean & Compact) */}
            <div className="flex items-center gap-1 text-[11px] font-mono text-slate-300 bg-[#0d1017] px-2 py-0.5 rounded-md border border-[#1e2333]">
              <span className="material-symbols-outlined text-cyan-400 text-[12px]">location_on</span>
              <span className="uppercase font-semibold tracking-wide">{venueName}</span>
            </div>

            {/* Live Indicator (Minimal Dot & Label) */}
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded-md border border-cyan-500/25">
              <span className="size-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span>EN VIVO</span>
            </div>

            {/* Karaoke Mode Badge (Only if active) */}
            {(karaokeMode || nowPlaying?.isKaraoke) && (
              <div className="flex items-center gap-1 text-[10px] font-mono font-bold text-pink-300 bg-pink-500/15 px-2 py-0.5 rounded-md border border-pink-500/30 animate-pulse">
                <span className="material-symbols-outlined text-pink-400 text-[13px]">mic_external_on</span>
                <span>KARAOKE</span>
              </div>
            )}
          </div>

          {/* Right utilities: Pair status, Clock, Fullscreen */}
          <div className="flex items-center gap-2">
            {/* Pairing Status & Disconnect Button */}
            <div className="flex items-center gap-1.5 bg-emerald-950/60 px-2.5 py-1 rounded-md border border-emerald-500/40 text-[11px] font-mono text-emerald-300 font-bold">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>TV Salón Conectada</span>
              <button
                type="button"
                onClick={handleUnpair}
                className="ml-1 text-[10px] text-slate-400 hover:text-rose-400 underline font-normal transition-colors"
                title="Desvincular esta pantalla"
              >
                (Desvincular)
              </button>
            </div>

            {/* Live Equalizer Visualizer */}
            <div className="flex items-end gap-0.5 h-3.5 px-1.5 py-0.5 rounded bg-[#0d1017] border border-[#1e2333]" title="Visualizador de audio estéreo">
              <span className={`w-0.5 rounded-full bg-cyan-400 ${isPlaying ? "animate-pulse h-full" : "h-1"}`} />
              <span className={`w-0.5 rounded-full bg-indigo-400 ${isPlaying ? "animate-pulse delay-75 h-2.5" : "h-1.5"}`} />
              <span className={`w-0.5 rounded-full bg-cyan-300 ${isPlaying ? "animate-pulse delay-150 h-3" : "h-1"}`} />
              <span className={`w-0.5 rounded-full bg-indigo-300 ${isPlaying ? "animate-pulse delay-100 h-full" : "h-2"}`} />
            </div>

            {/* Mode Switcher Pill Button (TV Remote & Click) */}
            <button
              type="button"
              onClick={toggleScreenMode}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg border font-mono text-[11px] font-bold transition-all shadow-md active:scale-95 bg-gradient-to-r from-cyan-500/25 to-blue-500/25 text-cyan-300 border-cyan-400/50 hover:bg-cyan-500/35 hover:text-white shadow-[0_0_12px_rgba(34,211,238,0.25)]"
              title="Alternar Modo de Pantalla (V o control remoto)"
            >
              <span className="material-symbols-outlined text-[15px] text-cyan-400">queue_music</span>
              <span>Modo: Solo Playlist</span>
              <span className="text-[10px] text-slate-400 font-normal hidden sm:inline">(V)</span>
            </button>

            {/* TV Audio Routing — Read-only badge (audio only via Cabina) */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-[11px] font-bold ${
                isMuted
                  ? "bg-rose-500/15 border-rose-500/30 text-rose-300"
                  : "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
              }`}
              title="Audio controlado desde la Cabina"
            >
              {isMuted ? (
                <>
                  <VolumeX className="size-3.5 text-rose-400 shrink-0" />
                  <span className="hidden sm:inline">TV Silenciada</span>
                </>
              ) : (
                <>
                  <Volume2 className="size-3.5 text-emerald-400 shrink-0" />
                  <span className="hidden sm:inline">Audio TV</span>
                </>
              )}
            </div>

            {/* Settings Modal Button (Matching Android TV OSD) */}
            <button
              type="button"
              onClick={() => setShowSettingsModal((prev) => !prev)}
              className="flex items-center gap-1.5 bg-[#0d1017] hover:bg-[#1a2030] px-2.5 py-1 rounded-lg border border-[#1e2333] hover:border-cyan-400/50 font-mono text-[11px] text-slate-300 hover:text-white transition-all shadow-sm active:scale-95"
              title="Ajustes de Pantalla TV (Esc / O)"
            >
              <Settings className="size-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Ajustes</span>
            </button>

            {/* Clock */}
            <div className="flex items-center gap-1 bg-[#0d1017] px-2 py-0.5 rounded-md border border-[#1e2333] font-mono text-[11px] text-white font-bold tracking-wider">
              <span className="material-symbols-outlined text-indigo-400 text-[13px]">schedule</span>
              <span suppressHydrationWarning>{clock}</span>
            </div>

            {/* Hotkeys Remote Help Button */}
            <button
              type="button"
              onClick={() => setShowHotkeysHelp((prev) => !prev)}
              className="size-6 rounded-md bg-[#0d1017] border border-[#1e2333] flex items-center justify-center text-slate-400 hover:text-white transition-colors"
              title="Atajos de teclado / Control remoto (H)"
            >
              <HelpCircle className="size-3 text-slate-400" />
            </button>

            {/* Fullscreen Button */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="size-6 rounded-md bg-[#0d1017] border border-[#1e2333] flex items-center justify-center text-slate-400 hover:text-white transition-colors"
              title="Pantalla completa (F)"
            >
              {isFullscreen ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
            </button>
          </div>
        </header>
      )}

      {/* ================= PERSISTENT FULLSCREEN VIDEO PLAYER (EXACT TV NATIVE PARITY) ================= */}
      <div
        ref={videoContainerRef}
        className={
          screenMode === "PLAYLIST"
            ? "fixed -left-[9999px] -top-[9999px] w-1 h-1 opacity-0 invisible pointer-events-none -z-50 overflow-hidden"
            : "fixed inset-0 w-screen h-screen bg-black overflow-hidden z-0 select-none"
        }
      >
        <div className="w-full h-full relative">
          {mounted && (
            <iframe
              id="poneleplay-tv-iframe"
              ref={iframeRef}
              src={`https://www.youtube.com/embed/${resolveVideoId(nowPlaying)}?autoplay=1${isMuted ? "&mute=1" : ""}&enablejsapi=1&controls=0&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&disablekb=1&widgetid=1${origin ? `&origin=${encodeURIComponent(origin)}&widget_referrer=${encodeURIComponent(origin)}` : ""}`}
              title={nowPlaying?.title || "TV Player"}
              className="w-full h-full border-0 pointer-events-none select-none object-cover"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              onLoad={() => {
                engine.handshake();
                if (isMuted) {
                  engine.mute?.();
                } else {
                  engine.unMute?.();
                  engine.setVolume?.(volume);
                }
              }}
            />
          )}

          {/* Transparent protection overlay */}
          <div
            className="absolute inset-0 z-10 cursor-default"
            onDoubleClick={toggleFullscreen}
            title="PonelePlay TV Salón"
          />
        </div>
      </div>

      {/* ================= TV MODE VIDEO OVERLAYS (EXACT ANDROID TV PARITY) ================= */}
      {screenMode !== "PLAYLIST" && (
        <div className="fixed inset-0 z-20 pointer-events-none overflow-hidden select-none">
          {/* Top-Right Floating Controls (Hover / Focus) */}
          <div className="absolute top-4 right-6 z-40 pointer-events-auto flex items-center gap-2 opacity-25 hover:opacity-100 focus-within:opacity-100 transition-opacity bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 shadow-2xl">
            {/* Mode Switcher */}
            <button
              type="button"
              onClick={toggleScreenMode}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-400/30 font-mono text-[11px] font-bold transition-all"
              title="Cambiar Modo de Pantalla (Tecla V)"
            >
              <span className="material-symbols-outlined text-[14px] text-cyan-400">
                {screenMode === "VIDEO" ? "smart_display" : "fullscreen"}
              </span>
              <span>{screenMode === "VIDEO" ? "Modo: Video Completo" : "Modo: Video Limpio"}</span>
              <span className="text-[10px] text-slate-400 font-normal">(V)</span>
            </button>

            {/* TV Audio Indicator (Read-only) */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-[11px] font-bold ${
                isMuted
                  ? "bg-rose-500/20 border-rose-500/40 text-rose-300"
                  : "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
              }`}
              title="El audio se controla exclusivamente desde la Cabina"
            >
              {isMuted ? (
                <>
                  <VolumeX className="size-3.5 text-rose-400" />
                  <span>TV Silenciada</span>
                </>
              ) : (
                <>
                  <Volume2 className="size-3.5 text-emerald-400" />
                  <span>Audio TV</span>
                </>
              )}
              <span className="text-[9px] text-slate-400 font-normal hidden sm:inline">(Cabina)</span>
            </div>

            {/* Settings Modal Button */}
            <button
              type="button"
              onClick={() => setShowSettingsModal(true)}
              className="flex items-center gap-1.5 bg-[#121622] hover:bg-[#1c2234] px-2.5 py-1 rounded-lg border border-[#2b354e] font-mono text-[11px] text-slate-200 hover:text-white transition-all"
              title="Ajustes de Pantalla TV (Esc / O)"
            >
              <Settings className="size-3.5 text-cyan-400" />
              <span>Ajustes</span>
            </button>

            {/* Fullscreen Button */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="size-7 rounded-lg bg-[#121622] hover:bg-[#1c2234] border border-[#2b354e] flex items-center justify-center text-slate-300 hover:text-white transition-colors"
              title="Pantalla completa (F)"
            >
              {isFullscreen ? <Minimize2 className="size-3.5 text-cyan-400" /> : <Maximize2 className="size-3.5 text-cyan-400" />}
            </button>
          </div>

          {/* Left Floating Queue (100% Transparent, no box/border, text only with drop shadow) */}
          {screenMode === "VIDEO" && queue.length > 0 && (
            <div className="absolute top-7 left-8 w-[310px] flex flex-col z-20 pointer-events-none">
              <div className="flex items-center justify-between w-full mb-2">
                <span className="font-mono text-xs font-black text-cyan-400 tracking-wider [text-shadow:_2px_2px_6px_rgba(0,0,0,0.95)]">
                  📋 COLA EN VIVO
                </span>
                <span className="font-mono text-[11px] text-cyan-200 font-bold [text-shadow:_2px_2px_6px_rgba(0,0,0,0.95)]">
                  {queue.length} temas
                </span>
              </div>

              {queue.slice(0, 7).map((item, idx) => {
                const isBar = (item.voteCount >= 9999 || item.voteCount <= 0) && !item.guestName;
                return (
                  <div key={item.itemId || item.trackId || idx} className="flex items-center w-full mb-1.5 min-w-0">
                    <span className="font-mono text-xs font-bold text-cyan-400 w-7 shrink-0 [text-shadow:_2px_2px_6px_rgba(0,0,0,0.95)]">
                      #{idx + 1}
                    </span>
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="text-xs font-bold text-white truncate [text-shadow:_2px_2px_6px_rgba(0,0,0,0.95)]">
                        {item.isKaraoke ? "🎤 " : ""}{decodeHtml(item.title)}
                      </p>
                      {item.guestName ? (
                        <p className="text-[10.5px] font-medium text-pink-400 truncate [text-shadow:_2px_2px_6px_rgba(0,0,0,0.95)]">
                          {item.artist} • 🎉 {item.guestName}
                        </p>
                      ) : (
                        <p className="text-[10.5px] font-medium text-slate-300 truncate [text-shadow:_2px_2px_6px_rgba(0,0,0,0.95)]">
                          {item.artist}
                        </p>
                      )}
                    </div>
                    <span
                      className={`font-mono text-[10.5px] font-bold shrink-0 [text-shadow:_2px_2px_6px_rgba(0,0,0,0.95)] ${
                        isBar ? "text-amber-400" : "text-emerald-300"
                      }`}
                    >
                      {isBar ? (isParty ? "⭐ DJ" : "⭐ BAR") : `${item.voteCount}v`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Right Floating Proposals (100% Transparent, no box/border, text only with drop shadow) */}
          {screenMode === "VIDEO" && candidateProposals.length > 0 && (
            <div className="absolute top-7 right-8 w-[310px] flex flex-col z-20 pointer-events-none">
              <div className="flex items-center justify-between w-full mb-2">
                <span className="font-mono text-xs font-black text-amber-400 tracking-wider [text-shadow:_2px_2px_6px_rgba(0,0,0,0.95)]">
                  🔥 EN VOTACIÓN
                </span>
                <span className="text-[11px] text-cyan-300 font-bold [text-shadow:_2px_2px_6px_rgba(0,0,0,0.95)]">
                  Pedí con QR
                </span>
              </div>

              {candidateProposals.slice(0, 7).map((prop, idx) => (
                <div key={prop.id || prop.trackId || idx} className="flex items-center justify-between w-full mb-1.5 min-w-0">
                  <div className="flex-1 min-w-0 pr-2">
                    <p className="text-xs font-bold text-white truncate [text-shadow:_2px_2px_6px_rgba(0,0,0,0.95)]">
                      {prop.isKaraoke ? "🎤 " : ""}{decodeHtml(prop.title)}
                    </p>
                    {prop.guestName ? (
                      <p className="text-[10px] font-semibold text-pink-400 truncate [text-shadow:_2px_2px_6px_rgba(0,0,0,0.95)]">
                        🎉 Pedido por {prop.guestName}
                      </p>
                    ) : (
                      <p className="text-[10px] font-medium text-slate-300 truncate [text-shadow:_2px_2px_6px_rgba(0,0,0,0.95)]">
                        {prop.artist}
                      </p>
                    )}
                  </div>
                  <span className="font-mono text-xs font-bold text-amber-400 shrink-0 [text-shadow:_2px_2px_6px_rgba(0,0,0,0.95)]">
                    {prop.voteCount}/{effectiveThreshold}v
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Bottom Subtle Dark Gradient */}
          <div className="absolute bottom-0 inset-x-0 h-44 bg-gradient-to-t from-[#070a13]/95 via-[#070a13]/70 to-transparent pointer-events-none z-20" />

          {/* Bottom HUD Overlay */}
          <div className="absolute bottom-0 inset-x-0 px-8 py-5 flex items-center justify-between z-30 pointer-events-auto">
            {/* Left: Now Playing Info */}
            <div className="flex items-center min-w-0 mr-4">
              <div className="size-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse shrink-0 mr-3" />
              <div className="min-w-0">
                <div className="flex items-center flex-wrap gap-x-2.5">
                  <span className="font-mono text-[11px] font-bold text-cyan-300 tracking-wider [text-shadow:_1px_1px_3px_rgba(0,0,0,0.95)]">
                    {isParty ? "🎉 EN AIRE • FIESTA" : "EN AIRE"}
                  </span>
                  {(nowPlaying?.isKaraoke || karaokeMode) && (
                    <span className="font-mono text-[11px] font-bold text-rose-500 [text-shadow:_1px_1px_3px_rgba(0,0,0,0.95)]">
                      🎤 KARAOKE
                    </span>
                  )}
                  {nowPlaying?.guestName && (
                    <span className="font-mono text-[11px] font-black text-pink-400 [text-shadow:_1px_1px_3px_rgba(0,0,0,0.95)]">
                      🎉 Pedido por {nowPlaying.guestName}
                    </span>
                  )}
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-white truncate max-w-2xl mt-0.5 [text-shadow:_2px_2px_8px_rgba(0,0,0,0.95)]">
                  {decodeHtml(nowPlaying?.title || "Esperando temas...")}
                </h1>
                <p className="text-xs sm:text-sm font-medium text-slate-300 truncate max-w-xl [text-shadow:_1px_1px_4px_rgba(0,0,0,0.95)]">
                  {nowPlaying?.artist || venueName}
                </p>
                {nowPlaying?.dedication && (
                  <div className="mt-1.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-purple-950/90 border border-pink-500 shadow-lg max-w-xl">
                    <span className="text-xs font-bold text-pink-100 truncate">
                      💬 &ldquo;{nowPlaying.dedication}&rdquo;
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Table QR Code + Clock */}
            <div className="flex items-center gap-3 shrink-0">
              {qr && (
                <div
                  onClick={() => setQrModal(true)}
                  className="size-16 rounded-xl bg-white p-1 shadow-2xl border border-white/30 cursor-pointer hover:scale-105 transition-transform shrink-0"
                  title="Click para agrandar QR"
                >
                  <Image
                    src={qr}
                    alt="QR Mesas"
                    width={64}
                    height={64}
                    className="w-full h-full object-contain"
                    unoptimized
                  />
                </div>
              )}
              <div className="flex flex-col items-end">
                <span className="font-mono text-lg font-bold text-white [text-shadow:_2px_2px_6px_rgba(0,0,0,0.95)]" suppressHydrationWarning>
                  {clock}
                </span>
                <span className="text-xs font-semibold text-cyan-300 [text-shadow:_1px_1px_3px_rgba(0,0,0,0.95)]">
                  Pedí tu música
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODE 2: ENFASIS EN PLAYLIST Y PROPUESTAS (AUDIO SALON + MAXIMA PARTICIPACION) ================= */}
      {screenMode === "PLAYLIST" && (
        <main className="w-full flex-1 grid grid-cols-12 gap-3 min-h-0 overflow-hidden mb-2">
            {/* COL 1: HERO NOW PLAYING & QR CARD (4 COLS) */}
            <section className="col-span-4 flex flex-col justify-between gap-2.5 min-h-0">
              {/* Upper: Now Playing Hero Card with Vinyl + Scrubber */}
              <div className="rounded-xl bg-[#141824] border border-[#232b42] p-4 shadow-lg flex flex-col justify-between flex-1 min-h-0 overflow-hidden">
                {/* Top Header */}
                <div className="flex items-center justify-between shrink-0 mb-1">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-mono text-[10px] font-bold">
                    <span className="size-1.5 rounded-full bg-cyan-400 animate-live-dot" />
                    <span>SONANDO EN SALÓN</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-indigo-300 font-mono text-[10px]">
                    <span className="material-symbols-outlined text-[13px] text-cyan-400">speaker</span>
                    <span>Audio Cabina</span>
                  </div>
                </div>

                {/* Central Vinyl & Album Artwork Showcase */}
                <div className="flex flex-col items-center justify-center my-auto py-2 text-center">
                  <div className="relative size-36 sm:size-44 mb-3 flex items-center justify-center">
                    {/* Spinning Vinyl */}
                    <div className="absolute -right-3 size-36 sm:size-44 rounded-full bg-[#080B12] border-2 border-[#1E2433] shadow-2xl flex items-center justify-center z-0 animate-spin-vinyl">
                      <div className="size-24 sm:size-28 rounded-full border border-neutral-700/40 flex items-center justify-center">
                        <div className="size-14 sm:size-16 rounded-full bg-gradient-to-tr from-[#6366F1] to-[#06B6D4] flex items-center justify-center">
                          <div className="size-2 rounded-full bg-[#0a0e17]" />
                        </div>
                      </div>
                    </div>
                    {/* Cover art */}
                    <div className="relative size-36 sm:size-44 rounded-2xl overflow-hidden border-2 border-[#283250] shadow-2xl z-10 bg-[#0a0e17] flex items-center justify-center shrink-0">
                      {nowPlaying?.thumbnailUrl ? (
                        <Image
                          src={nowPlaying.thumbnailUrl}
                          alt={nowPlaying.title}
                          width={176}
                          height={176}
                          className="w-full h-full object-cover"
                          unoptimized
                        />
                      ) : (
                        <Music2 className="size-12 text-indigo-400" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
                    </div>
                  </div>

                  {/* Equalizer Waveform Bars */}
                  <div className="flex items-center justify-center gap-1 h-5 mb-2">
                    <span className="w-1 h-3 bg-cyan-400 rounded-full animate-pulse" />
                    <span className="w-1 h-5 bg-indigo-400 rounded-full animate-bounce" />
                    <span className="w-1 h-4 bg-cyan-300 rounded-full animate-pulse" />
                    <span className="w-1 h-5 bg-purple-400 rounded-full animate-bounce" />
                    <span className="w-1 h-3 bg-cyan-400 rounded-full animate-pulse" />
                  </div>

                  <h1 className="text-base sm:text-lg font-extrabold text-white tracking-tight leading-snug line-clamp-2 max-w-full px-2">
                    {decodeHtml(nowPlaying?.title || "Esperando tema...")}
                  </h1>
                  <h2 className="text-xs sm:text-sm font-medium text-slate-300 truncate max-w-full mt-1">
                    {nowPlaying?.artist || "Playlist activa"}
                  </h2>

                  <div className="mt-2.5 inline-flex items-center gap-1.5 bg-indigo-500/15 text-indigo-300 px-3 py-1 rounded-full font-mono text-[10px] font-bold border border-indigo-500/25">
                    <span className="material-symbols-outlined text-[13px] text-amber-400">stars</span>
                    <span>
                      {nowPlaying && (nowPlaying.voteCount >= 9999 || nowPlaying.voteCount === 0)
                        ? "Selección Bar"
                        : `${nowPlaying?.voteCount ?? 0} votos`}
                    </span>
                  </div>
                </div>

                {/* Scrubber & Timeline */}
                <div className="mt-2 pt-2 border-t border-[#1e2333] shrink-0">
                  <div className="w-full flex items-center justify-between font-mono text-[10px] text-slate-300 mb-1">
                    <span className="text-cyan-400 font-semibold">{formatDuration(elapsed)}</span>
                    <span className="text-slate-500 text-[9px] uppercase tracking-wider">AUDIO CABINA MASTER</span>
                    <span className="text-slate-400 font-semibold">{formatDuration(duration)}</span>
                  </div>
                  <div className="w-full h-1.5 bg-[#161a26] rounded-full overflow-hidden border border-[#232b42]">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-400 via-indigo-500 to-purple-500 rounded-full transition-all duration-150"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Lower: Large High-Contrast QR Card */}
              <div className="rounded-xl bg-[#141824] border border-[#232b42] p-3 shadow-lg flex items-center gap-3 relative overflow-hidden shrink-0">
                <div
                  onClick={() => setQrModal(true)}
                  className="relative size-24 rounded-lg bg-white p-1.5 shrink-0 border border-cyan-400/50 shadow-md cursor-pointer hover:scale-105 transition-transform"
                  title="Click para agrandar QR"
                >
                  {qr ? (
                    <Image
                      src={qr}
                      alt="QR para votar"
                      width={96}
                      height={96}
                      className="w-full h-full object-contain"
                      unoptimized
                    />
                  ) : (
                    <div className="w-full h-full bg-slate-200 animate-pulse rounded" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-mono text-[9px] text-cyan-400 uppercase tracking-widest font-bold block mb-0.5">
                    ELEGÍ DESDE TU MESA
                  </span>
                  <h3 className="text-xs sm:text-sm font-bold text-white tracking-tight leading-snug truncate">
                    Escaneá con tu celular
                  </h3>
                  <p className="font-mono text-[10px] text-slate-400 mt-0.5 leading-tight line-clamp-2">
                    Pedí créditos al mozo para votar o subir canciones a la playlist.
                  </p>
                  <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#0a0e17] border border-[#232b42] font-mono text-[10px] text-slate-300">
                    <span className="material-symbols-outlined text-[12px] text-indigo-400">link</span>
                    <span className="truncate">poneleplay.app/p/{slug}</span>
                  </div>
                </div>
              </div>
            </section>

            {/* COL 2: PLAYLIST CONFIRMADA EN COLA (4 COLS) */}
            <section className="col-span-4 rounded-xl bg-[#141824] border border-[#232b42] p-3.5 shadow-lg flex flex-col justify-between overflow-hidden min-h-0">
              <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between pb-2.5 border-b border-[#232b42] shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="size-7 rounded-lg bg-indigo-600/25 border border-indigo-500/40 text-indigo-300 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[16px] text-cyan-400">queue_music</span>
                    </div>
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold text-white tracking-tight">
                        Playlist Confirmada
                      </h3>
                      <p className="font-mono text-[10px] text-slate-400">
                        {queue.length} {queue.length === 1 ? "tema en espera" : "temas a continuación"}
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-[10px] text-indigo-300 bg-indigo-500/15 border border-indigo-500/30 px-2 py-0.5 rounded-full font-bold">
                    Orden de Reproducción
                  </span>
                </div>

                {/* Queue Items List (Dynamic max height fit) */}
                <div className="mt-2.5 space-y-2 overflow-hidden flex-1 min-h-0">
                  {queue.slice(0, maxQueueFit).map((item, index) => (
                    <div
                      key={item.itemId}
                      className="p-2.5 rounded-xl bg-[#10141f] border border-[#1d2232] flex items-center justify-between gap-3 shadow-sm hover:border-[#2a344e] transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <BallChip n={index + 1} size="md" />
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-white truncate">
                            {decodeHtml(item.title)}
                          </h4>
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            {item.artist}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="font-mono text-[10px] font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-md">
                          {(item.voteCount >= 9999 || item.voteCount === 0)
                            ? "⭐ Selección Bar"
                            : `${item.voteCount} votos`}
                        </span>
                        <span className="font-mono text-[10px] text-slate-500">
                          {formatDuration(item.durationSeconds ?? 210)}
                        </span>
                      </div>
                    </div>
                  ))}

                  {queue.length === 0 && (
                    <div className="py-12 text-center text-xs text-slate-500 font-mono space-y-1">
                      <span className="material-symbols-outlined text-3xl text-slate-600 block mb-1">music_off</span>
                      <p>No hay canciones en la cola confirmada.</p>
                      <p className="text-[10px] text-slate-600">¡Votá canciones en la columna derecha para ingresarlas!</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer Info */}
              <div className="pt-2 border-t border-[#232b42] flex items-center justify-between font-mono text-[10px] text-slate-400 shrink-0 mt-2">
                <span className="flex items-center gap-1 text-slate-300">
                  <span className="size-1.5 rounded-full bg-emerald-400 inline-block" />
                  <span>Cola en Vivo</span>
                </span>
                <span className="text-cyan-400 font-semibold">Salón {venueName}</span>
              </div>
            </section>

            {/* COL 3: PROPUESTAS EN VOTACIÓN EN VIVO (4 COLS) */}
            <section className="col-span-4 rounded-xl bg-[#141824] border border-[#232b42] p-3.5 shadow-lg flex flex-col justify-between overflow-hidden min-h-0">
              <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between pb-2.5 border-b border-[#232b42] shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="size-7 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center justify-center">
                      <Flame className="size-4 text-amber-400" />
                    </div>
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold text-white tracking-tight">
                        Votación en Vivo
                      </h3>
                      <p className="font-mono text-[10px] text-slate-400">
                        {nightState?.candidates?.length ?? 0} temas compitiendo
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-[10px] text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold animate-pulse">
                    Mesas Votando
                  </span>
                </div>

                {/* Live Voting Round Banner */}
                {nightState?.votingRound?.enabled && (
                  <div className="mt-2.5 p-2 rounded-lg bg-gradient-to-r from-amber-500/20 via-rose-500/20 to-indigo-500/20 border border-amber-500/40 flex items-center justify-between font-mono text-[11px] shrink-0 shadow-sm">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="material-symbols-outlined text-amber-400 text-sm animate-pulse">timer</span>
                      <span className="font-bold text-white shrink-0">Ronda #{nightState.votingRound.roundNumber}</span>
                      <span className="text-slate-400 text-[10px] truncate">· La + votada entra</span>
                    </div>
                    <span className="font-bold px-2 py-0.5 rounded bg-amber-500/30 text-amber-300 border border-amber-500/50 text-[11px] shrink-0">
                      {formatDuration(roundSecondsLeft)}
                    </span>
                  </div>
                )}

                {/* Candidate Proposals List (Dynamic max height fit) */}
                <div className="mt-2.5 space-y-2 overflow-hidden flex-1 min-h-0">
                  {nightState?.candidates && nightState.candidates.length > 0 ? (
                    nightState.candidates.slice(0, maxCandidatesFit).map((cand, index) => {
                      const needed = Math.max(0, effectiveThreshold - cand.voteCount);
                      const percent = Math.min(100, (cand.voteCount / Math.max(1, effectiveThreshold)) * 100);
                      return (
                        <div
                          key={cand.id}
                          className="p-2.5 rounded-xl bg-[#10141f] border border-[#252030] space-y-1.5 shadow-sm hover:border-[#382d48] transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2 min-w-0">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <h4 className="text-xs font-bold text-white truncate">
                                  {decodeHtml(cand.title)}
                                </h4>
                                {index === 0 && (
                                  <span className="shrink-0 text-[9px] font-mono font-bold bg-amber-500/25 text-amber-300 border border-amber-500/40 px-1.5 py-0.2 rounded">
                                    🏆 Líder
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                {cand.artist}
                              </p>
                            </div>

                            <span className="font-mono text-[10px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0">
                              <Flame className="size-3 text-amber-400" />
                              <span>{cand.voteCount}/5 votos</span>
                            </span>
                          </div>

                          {/* Progress bar */}
                          <div className="w-full bg-[#181d2a] h-1.5 rounded-full overflow-hidden border border-[#232b42]">
                            <div
                              className="h-full bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-500 rounded-full transition-all duration-300"
                              style={{ width: `${percent}%` }}
                            />
                          </div>

                          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                            <span className="text-amber-400 font-semibold">
                              {needed === 1 ? "¡Falta solo 1 voto para ingresar!" : `Faltan ${needed} votos para sonar`}
                            </span>
                            <span className="text-slate-500">Mesa popular</span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-10 text-center text-xs text-slate-500 font-mono space-y-1">
                      <Flame className="size-7 text-slate-600 mx-auto mb-1 opacity-50" />
                      <p>No hay propuestas en votación en este momento.</p>
                      <p className="text-[10px] text-slate-600">¡Escaneá el QR y proponé tu canción favorita!</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer Info */}
              <div className="pt-2 border-t border-[#232b42] flex items-center justify-between font-mono text-[10px] text-slate-400 shrink-0 mt-2">
                <span className="text-slate-400">Meta: 5 votos para entrada directa</span>
                <span className="text-amber-400 font-semibold">Votá desde tu mesa</span>
              </div>
            </section>
        </main>
      )}

      {/* ================= BOTTOM MARQUEE BAR (COMPACT BROADCAST TICKER — PLAYLIST MODE ONLY) ================= */}
      {screenMode === "PLAYLIST" && (
        <footer className="w-full bg-[#0d1017] border border-[#1e2333] rounded-lg py-1 px-3 overflow-hidden z-40 shrink-0 shadow-sm">
          <div className="animate-marquee items-center gap-10 font-mono text-[10px] text-slate-400 whitespace-nowrap">
            <span className="flex items-center gap-3 shrink-0 whitespace-nowrap">
              <span className="text-cyan-400 font-bold">🎵 BIENVENIDO A {venueName.toUpperCase()}</span>
              <span className="text-slate-600">·</span>
              <span>Pedí tus temas favoritos escaneando el código QR en la mesa</span>
              <span className="text-slate-600">·</span>
              <span>Canciones con 5 votos entran a la cola de la TV</span>
              <span className="text-slate-600">·</span>
              <span>Cada consumición suma créditos para votar y subir temas</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-300 font-semibold">PonelePlay TV Jukebox</span>
            </span>
            <span className="flex items-center gap-3 shrink-0 whitespace-nowrap">
              <span className="text-cyan-400 font-bold">🎵 BIENVENIDO A {venueName.toUpperCase()}</span>
              <span className="text-slate-600">·</span>
              <span>Pedí tus temas favoritos escaneando el código QR en la mesa</span>
              <span className="text-slate-600">·</span>
              <span>Canciones con 5 votos entran a la cola de la TV</span>
              <span className="text-slate-600">·</span>
              <span>Cada consumición suma créditos para votar y subir temas</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-300 font-semibold">PonelePlay TV Jukebox</span>
            </span>
          </div>
        </footer>
      )}

      {/* Smart TV Pairing Modal (6-Digit PIN & Token Support) */}
      <TvPairingModal
        isOpen={pairModalOpen}
        slug={slug}
        onClose={() => setPairModalOpen(false)}
        onPaired={(pairedToken) => {
          setToken(pairedToken);
          localStorage.setItem(`poneleplay.player.${slug}`, pairedToken);
          setHudMessage("🎉 ¡Pantalla TV Vinculada con Éxito!");
          setTimeout(() => setHudMessage(null), 4000);
        }}
      />

      {/* QR Large Overlay Modal with Step Guide & Auto-close Timer */}
      {qrModal && (
        <div
          onClick={() => setQrModal(false)}
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center p-6 cursor-pointer animate-in fade-in duration-200"
        >
          <button
            type="button"
            onClick={() => setQrModal(false)}
            className="absolute top-6 right-6 text-slate-400 hover:text-white p-2 rounded-xl bg-white/10"
            aria-label="Cerrar modal"
          >
            <X className="size-8" />
          </button>

          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#0f1422] border border-[#232b42] p-8 sm:p-10 rounded-3xl shadow-2xl max-w-md w-full text-center space-y-6 text-white cursor-default"
          >
            <div className="space-y-1">
              <span className="font-mono text-xs text-cyan-400 font-bold uppercase tracking-wider block">
                ROKOLA DIGITAL EN SALA
              </span>
              <h2 className="text-2xl font-black text-white tracking-tight">
                Pedí tu Tema desde tu Mesa
              </h2>
              <p className="font-mono text-xs text-slate-400">
                Escaneá con la cámara de tu celular y elegí la música
              </p>
            </div>

            {/* Giant High-Contrast QR Code */}
            <div className="p-4 bg-white rounded-2xl shadow-xl inline-block border-4 border-indigo-500/40">
              {qr && (
                <Image
                  src={qr}
                  alt="QR Gigante para votar"
                  width={260}
                  height={260}
                  className="size-56 sm:size-64 object-contain mx-auto"
                  unoptimized
                />
              )}
            </div>

            {/* 3 Step Micro-Guide */}
            <div className="grid grid-cols-3 gap-2 text-left font-mono text-[10px] text-slate-300 pt-1">
              <div className="p-2 rounded-lg bg-[#141824] border border-[#232b42]">
                <span className="font-bold text-cyan-400 block mb-0.5">1. Escaneá</span>
                <span className="text-slate-400">con la cámara de tu teléfono.</span>
              </div>
              <div className="p-2 rounded-lg bg-[#141824] border border-[#232b42]">
                <span className="font-bold text-indigo-400 block mb-0.5">2. Canjeá</span>
                <span className="text-slate-400">tu ticket del mozo para sumar votos.</span>
              </div>
              <div className="p-2 rounded-lg bg-[#141824] border border-[#232b42]">
                <span className="font-bold text-emerald-400 block mb-0.5">3. Votá</span>
                <span className="text-slate-400">y tu canción sonará en esta TV.</span>
              </div>
            </div>

            <div className="flex items-center justify-between font-mono text-[11px] text-slate-500 pt-2 border-t border-[#1e2333]">
              <span>poneleplay.app/p/{slug}</span>
              <span className="text-slate-400">Cierre automático en {qrModalTimer}s</span>
            </div>
          </div>
        </div>
      )}

      {/* Floating Dynamic Broadcast Toast */}
      {liveToast && (
        <div className="fixed bottom-12 left-6 z-50 bg-[#0f1424]/95 text-white font-mono text-xs font-bold px-4 py-2.5 rounded-xl border border-cyan-400/50 shadow-2xl animate-in slide-in-from-bottom duration-200 flex items-center gap-2.5 pointer-events-none">
          <span className="material-symbols-outlined text-cyan-400 text-base">{liveToast.icon}</span>
          <span>{liveToast.message}</span>
        </div>
      )}

      {/* HORIZONTAL DEDICATION MARQUEE ACROSS THE MIDDLE OF THE SCREEN (LEFT TO RIGHT) */}
      {(() => {
        if (!nowPlaying?.dedication || dedicationFinished) return null;
        const activeDedicationStyle: DedicationStyle = partyConfig?.dedicationStyle || "neon";
        const styleDef =
          DEDICATION_STYLES.find((s) => s.id === activeDedicationStyle) || DEDICATION_STYLES[0];
        const effectiveRepeats =
          typeof partyConfig?.dedicationRepeats === "number" ? partyConfig.dedicationRepeats : 2;

        return (
          <div
            key={`ded-${nowPlaying.itemId || nowPlaying.trackId || "cur"}-${nowPlaying.dedication}-${liveDedicationOverride?.timestamp || 0}`}
            className="fixed inset-x-0 top-1/2 -translate-y-1/2 z-[85] pointer-events-none overflow-hidden py-3"
          >
            <div
              className="animate-marquee-ltr"
              style={{
                animationIterationCount: effectiveRepeats === 0 ? "infinite" : effectiveRepeats,
              }}
              onAnimationEnd={() => {
                if (effectiveRepeats > 0) {
                  setDedicationFinished(true);
                }
              }}
            >
              <div
                className={`inline-flex items-center gap-4 px-7 py-3.5 rounded-2xl backdrop-blur-md whitespace-nowrap ${styleDef.containerClass}`}
              >
                <span className="text-2xl">{styleDef.leadEmoji}</span>
                {nowPlaying.guestName ? (
                  <span
                    className={`font-mono text-sm uppercase tracking-widest font-black px-3 py-1 rounded-lg ${styleDef.badgeClass}`}
                  >
                    {nowPlaying.guestName.toUpperCase()}
                  </span>
                ) : null}
                <span className={`text-xl sm:text-2xl font-extrabold tracking-tight ${styleDef.messageClass}`}>
                  &ldquo;{nowPlaying.dedication}&rdquo;
                </span>
                <span className="text-2xl">{styleDef.tailEmoji}</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* LIVE VOTE-TO-SKIP INDICATOR ON TV (only while the voted song is still playing) */}
      {(() => {
        const visibleSkipVote = resolveActiveSkipVoteForTrack(
          activeSkipVote,
          (nowPlaying as unknown as Record<string, unknown> | null) ?? null,
        );
        if (!visibleSkipVote) return null;
        return (
        <div className="fixed top-14 right-6 z-[82] rounded-2xl border border-rose-500/50 bg-[#0d101b]/95 px-4 py-2.5 shadow-2xl backdrop-blur-md flex items-center gap-3 animate-fade-in">
          <span className="text-lg animate-pulse">⏭️</span>
          <div>
            <span className="block font-mono text-[11px] font-black uppercase text-rose-300">
              Votación para cambiar canción
            </span>
            <span className="block font-mono text-xs font-bold text-white">
              {visibleSkipVote.votes} / {visibleSkipVote.threshold} votos en sala
            </span>
          </div>
        </div>
        );
      })()}

      {/* PARTY LIVE 1v1 DUEL TV OVERLAY */}
      {activeDuel && (
        <div className="fixed inset-x-6 bottom-12 z-[90] mx-auto max-w-4xl rounded-3xl border-2 border-amber-400 bg-gradient-to-r from-[#1d1130]/95 via-[#0e1222]/95 to-[#281228]/95 p-5 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between mb-3">
            <span className="rounded-full bg-amber-400 px-3 py-1 font-mono text-xs font-black uppercase text-slate-950">
              ⚡ DUELO FIESTERO 1 vs 1 EN VIVO · ¡VOTÁ EN TU CELULAR!
            </span>
            <button
              type="button"
              onClick={() => setActiveDuel(null)}
              className="font-mono text-xs text-slate-400 hover:text-white"
            >
              Cerrar ✕
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4 items-center">
            <div className="rounded-2xl border border-cyan-400/50 bg-cyan-500/15 p-4 flex items-center justify-between">
              <div className="min-w-0 pr-3">
                <span className="font-mono text-[10px] font-bold uppercase text-cyan-300">
                  ESQUINA A
                </span>
                <h3 className="text-lg font-black text-white truncate">{activeDuel.trackA.title}</h3>
                <p className="text-xs text-slate-300 truncate">{activeDuel.trackA.artist}</p>
              </div>
              <div className="text-right shrink-0">
                <span className="text-2xl font-black font-mono text-cyan-300">{activeDuel.votesA}</span>
                <span className="block text-[10px] font-mono text-cyan-200">VOTOS</span>
              </div>
            </div>

            <div className="rounded-2xl border border-fuchsia-400/50 bg-fuchsia-500/15 p-4 flex items-center justify-between">
              <div className="min-w-0 pr-3">
                <span className="font-mono text-[10px] font-bold uppercase text-fuchsia-300">
                  ESQUINA B
                </span>
                <h3 className="text-lg font-black text-white truncate">{activeDuel.trackB.title}</h3>
                <p className="text-xs text-slate-300 truncate">{activeDuel.trackB.artist}</p>
              </div>
              <div className="text-right shrink-0">
                <span className="text-2xl font-black font-mono text-fuchsia-300">{activeDuel.votesB}</span>
                <span className="block text-[10px] font-mono text-fuchsia-200">VOTOS</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PARTY LIVE ROULETTE TV OVERLAY */}
      {activeRoulette && (
        <div className="fixed inset-0 z-[95] bg-black/85 backdrop-blur-md flex items-center justify-center p-6">
          <div className="max-w-xl w-full rounded-3xl border-2 border-fuchsia-400 bg-gradient-to-b from-[#231238] to-[#0f1322] p-8 text-center shadow-2xl space-y-5">
            <div className={`text-5xl ${rouletteSpinFinished ? "animate-bounce" : "animate-spin"}`}>
              🎡
            </div>
            <span className="inline-block rounded-full bg-fuchsia-500/20 border border-fuchsia-400/40 px-4 py-1 font-mono text-xs font-black uppercase text-fuchsia-200">
              {rouletteSpinFinished ? "🎉 RESULTADO DE LA RULETA" : "🎰 GIRANDO RULETA FIESTERA EN VIVO..."}
            </span>
            <h2 className="text-2xl font-black text-white">
              {rouletteSpinFinished ? "¡Tema Ganador del Sorteo!" : "Sorteando entre las propuestas..."}
            </h2>
            {!rouletteSpinFinished && activeRoulette.candidates?.length > 0 ? (
              <div className="rounded-2xl border border-fuchsia-400/50 bg-fuchsia-500/15 p-5 transition-all">
                <h3 className="text-xl font-black text-fuchsia-200 truncate">
                  {activeRoulette.candidates[rouletteSpinIndex % activeRoulette.candidates.length]?.title}
                </h3>
                <p className="text-sm text-slate-300 mt-1 truncate">
                  {activeRoulette.candidates[rouletteSpinIndex % activeRoulette.candidates.length]?.artist}
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border-2 border-amber-400 bg-amber-500/20 p-5 shadow-[0_0_30px_rgba(251,191,36,0.3)]">
                <span className="inline-block font-mono text-[10px] font-black uppercase text-amber-300 mb-1">
                  🏆 GANADORA · PASA AL TOPE DE LA COLA
                </span>
                <h3 className="text-2xl font-black text-amber-200 truncate">
                  {activeRoulette.winner.title}
                </h3>
                <p className="text-sm text-slate-200 mt-1 truncate">
                  {activeRoulette.winner.artist}
                </p>
                {activeRoulette.winner.guestName && (
                  <p className="text-xs font-mono text-fuchsia-300 mt-2">
                    🎉 Propuesto por {activeRoulette.winner.guestName}
                  </p>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => setActiveRoulette(null)}
              className="rounded-xl bg-white/10 hover:bg-white/20 px-4 py-2 font-mono text-xs text-white"
            >
              Continuar
            </button>
          </div>
        </div>
      )}

      {/* Floating Audio Unlock Banner (Browsers block autoplay unmuted by default) */}
      {!audioUnlocked && !isMuted && (
        <div
          onClick={handleUnlockAudio}
          className="fixed bottom-14 left-1/2 -translate-x-1/2 z-[110] cursor-pointer bg-gradient-to-r from-cyan-600 via-indigo-600 to-purple-600 text-white font-mono text-xs font-black px-6 py-3 rounded-full border-2 border-white/50 shadow-2xl animate-bounce flex items-center gap-2.5 hover:scale-105 transition-all"
        >
          <Volume2 className="size-4 animate-pulse text-cyan-300" />
          <span>🔊 Hacé clic acá o presioná cualquier tecla para activar el audio del salón</span>
        </div>
      )}

      {/* Floating Quick Settings button when in fullscreen or clean video */}
      {(isVideoFullscreen || screenMode === "CLEAN") && (
        <div className="fixed top-4 right-4 z-[9999] opacity-0 hover:opacity-100 transition-opacity flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSettingsModal(true)}
            className="bg-black/85 hover:bg-black text-white font-mono text-xs px-3.5 py-1.5 rounded-lg border border-white/20 flex items-center gap-1.5 shadow-2xl backdrop-blur-md cursor-pointer transition-colors"
          >
            <Settings className="size-3.5 text-cyan-400" />
            <span>Ajustes</span>
          </button>
          <button
            type="button"
            onClick={toggleVideoFullscreen}
            className="bg-black/85 hover:bg-black text-white font-mono text-xs px-3.5 py-1.5 rounded-lg border border-white/20 flex items-center gap-1.5 shadow-2xl backdrop-blur-md cursor-pointer transition-colors"
          >
            <Minimize2 className="size-3.5 text-cyan-400" />
            <span>Salir Fullscreen</span>
          </button>
        </div>
      )}

      {/* PC Kiosk TV Settings Modal (Full native TV parity) */}
      <TvSettingsModal
        isOpen={showSettingsModal}
        currentSlug={slug}
        venueName={venueName}
        screenMode={screenMode}
        isMuted={isMuted}
        isFullscreen={isFullscreen}
        versionName="2.6.0"
        partyConfig={partyConfig}
        onUpdatePartyConfig={async (patch) => {
          try {
            const updated = await updatePartyConfig(slug, patch);
            setPartyConfig(updated);
          } catch {
            // fallback
          }
        }}
        onToggleMode={toggleScreenMode}
        onToggleFullscreen={toggleFullscreen}
        onUnpair={handleUnpair}
        onReload={() => window.location.reload()}
        onDismiss={() => setShowSettingsModal(false)}
      />

      {/* Hotkeys Remote Control Cheat-Sheet Modal */}
      {showHotkeysHelp && (
        <div
          onClick={() => setShowHotkeysHelp(false)}
          className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center p-6 cursor-pointer animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#0f1422] border border-[#232b42] p-6 sm:p-8 rounded-2xl shadow-2xl max-w-lg w-full text-white cursor-default space-y-5"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#1E2333]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-cyan-400 text-xl">tv</span>
                <h3 className="font-bold text-lg font-mono">Atajos de Teclado / Control Remoto TV</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowHotkeysHelp(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="size-6" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 font-mono text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#141824] border border-[#232b42]">
                <span className="text-slate-300">Pantalla Completa:</span>
                <kbd className="px-2 py-0.5 rounded bg-[#1f2638] text-cyan-300 font-bold border border-[#2f3954]">F / Enter</kbd>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#141824] border border-[#232b42]">
                <span className="text-slate-300">Ver Video / Vinilo:</span>
                <kbd className="px-2 py-0.5 rounded bg-[#1f2638] text-cyan-300 font-bold border border-[#2f3954]">V</kbd>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#141824] border border-[#232b42]">
                <span className="text-slate-300">Agrandar QR Clientes:</span>
                <kbd className="px-2 py-0.5 rounded bg-[#1f2638] text-cyan-300 font-bold border border-[#2f3954]">Q</kbd>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#141824] border border-[#232b42]">
                <span className="text-slate-300">Ajustes Android TV:</span>
                <kbd className="px-2 py-0.5 rounded bg-[#1f2638] text-cyan-300 font-bold border border-[#2f3954]">Menú / Back</kbd>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#141824] border border-[#232b42]">
                <span className="text-slate-300">Cerrar Ventanas:</span>
                <kbd className="px-2 py-0.5 rounded bg-[#1f2638] text-cyan-300 font-bold border border-[#2f3954]">ESC</kbd>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#141824] border border-[#232b42]">
                <span className="text-slate-300">Control de Música:</span>
                <span className="text-cyan-400 font-bold text-[11px]">Exclusivo Panel Admin</span>
              </div>
            </div>

            <p className="text-[11px] font-mono text-slate-400 text-center pt-2">
              Esta pantalla es una cartelera visual. La reproducción y volumen se controlan exclusivamente desde el Panel Admin.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
