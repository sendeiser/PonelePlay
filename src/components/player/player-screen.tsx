"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { Flame, HelpCircle, Maximize2, Mic, Minimize2, Music2, X } from "lucide-react";
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
import { createNightStateSource } from "@/lib/api/night-state";
import { useNightState } from "@/hooks/use-night-state";

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

  const liveNightQueue: PlayerTrack[] = useMemo(() => {
    if (nightState?.queue && nightState.queue.length > 0) {
      return nightState.queue
        .filter((item) => item.status === "queued" || item.voteCount >= 5)
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
      }));
    }
    return [];
  }, [nightState]);

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

  // Video Mode: default to true so video is always visible
  const [videoMode, setVideoMode] = useState<boolean>(true);
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
      const saved = localStorage.getItem("poneleplay.player.videoMode");
      if (saved !== null) {
        setVideoMode(saved === "true");
      }
    }
  }, []);

  const [volume, setVolume] = useState(85);
  const [isMuted, setIsMuted] = useState(false);
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

  // Single playback engine: controls the ONE visible YouTube iframe (no hidden 2nd player)
  const engine: IframePlaybackEngine = useMemo(
    () =>
      createIframeEngine(
        () => iframeRef.current,
        (playing) => setIsPlaying(playing),
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
    if (window.confirm("¿Deseás desvincular esta pantalla TV del salón?")) {
      setToken(null);
      localStorage.removeItem(`poneleplay.player.${slug}`);
      engine.pause?.();
      setIsPlaying(false);
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
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      } else if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      return next;
    });
  }, []);

  const toggleFullscreen = useCallback(() => {
    toggleVideoFullscreen();
  }, [toggleVideoFullscreen]);

  function toggleVideoMode() {
    setVideoMode((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("poneleplay.player.videoMode", String(next));
      }
      return next;
    });
  }

  const handleUnlockAudio = useCallback(() => {
    // TV screen is display-only: keep muted, ensure video playback
    engine.mute?.();
    engine.setVolume?.(0);
    void engine.play();
    setAudioUnlocked(true);
    setIsMuted(true);
  }, [engine]);

  // Sync isPlaying with the player
  useEffect(() => {
    if (isPlaying) {
      void engine.play();
    } else {
      engine.pause?.();
    }
  }, [isPlaying, engine]);

  // Ensure TV player stays muted at all times so primary audio comes exclusively from Admin Cabina
  useEffect(() => {
    engine.setVolume?.(0);
    engine.mute?.();
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

  // TV Screen Remote Navigation (Display only - No local playback controls)
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement) return;

      const key = event.key.toLowerCase();
      if (key === "f" || key === "enter") {
        toggleVideoFullscreen();
      }
      if (key === "v" || key === "m" || key === "p") {
        toggleVideoMode();
        setLiveToast({
          icon: videoMode ? "queue_music" : "smart_display",
          message: videoMode ? "Modo: Énfasis en Playlist & Propuestas" : "Modo: Video Salón HD",
        });
        setTimeout(() => setLiveToast(null), 3000);
      }
      if (key === "h" || key === "?") {
        setShowHotkeysHelp((prev) => !prev);
      }
      if (key === "q") {
        setQrModal((val) => !val);
      }
      if (key === "escape") {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
        setQrModal(false);
        setPairModalOpen(false);
        setShowHotkeysHelp(false);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [videoMode, toggleVideoFullscreen]);

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
  const nowPlaying: PlayerTrack | null = useMemo(() => {
    if (!token) return null;
    if (manualNowPlaying) return manualNowPlaying;
    if (liveNightNowPlaying) return liveNightNowPlaying;
    if (playerState?.nowPlaying) return playerState.nowPlaying;
    return allTracks[0] ?? null;
  }, [token, manualNowPlaying, liveNightNowPlaying, playerState, allTracks]);

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
        void handleSkipNextRef.current(false);
      }),
    [engine],
  );


  // Master Remote Control synchronization (Single persistent Realtime channel + progress broadcast)
  useEffect(() => {
    let active = true;
    let channel: import("@supabase/supabase-js").RealtimeChannel | null = null;

    // 1. Initial State from DB
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
          if (typeof st.isMuted === "boolean") {
            setIsMuted(st.isMuted);
            if (st.isMuted) engine.mute?.();
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
              engine.pause?.();
              setIsPlaying(false);
              setHudMessage("⏸️ Música Pausada desde Cabina");
              setTimeout(() => setHudMessage(null), 3500);
            } else if (cmd === "resume") {
              void engine.play?.();
              setIsPlaying(true);
              setHudMessage("▶️ Música Reanudada desde Cabina");
              setTimeout(() => setHudMessage(null), 3500);
            } else if (cmd === "toggle_pause") {
              setIsPlaying((prev) => {
                const next = !prev;
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
              setIsMuted(false);
              engine.unMute?.();
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
            } else if (cmd === "skip") {
              void handleSkipNextRef.current(true);
            } else if (cmd === "seek") {
              const sec = Number(p.seconds ?? 0);
              handleSeekRef.current(sec);
            } else if (cmd === "play_now" && p.track) {
              const track = p.track as PlayerTrack;
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
            }
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
              setIsPlaying(!st.is_paused);
              if (st.is_paused) engine.pause?.();
              else void engine.play?.();
            }
            if (typeof st.volume === "number") {
              setVolume(st.volume);
              engine.setVolume?.(st.volume);
            }
            if (typeof st.is_muted === "boolean") {
              setIsMuted(st.is_muted);
              if (st.is_muted) engine.mute?.();
              else engine.unMute?.();
            }
            if (typeof st.karaoke_mode === "boolean") {
              setKaraokeMode(st.karaoke_mode);
              if (st.karaoke_mode) setVideoMode(true);
            }
            if (isNewCommand && st.last_command === "skip") {
              void handleSkipNextRef.current(true);
            } else if (isNewCommand && st.last_command === "play_now" && st.current_track) {
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
              isFromAdminAudio?: boolean;
            };
          }) => {
            if (!active || !msg.payload) return;
            const { currentTime, duration: d, isPaused: p, track } = msg.payload;
            if (typeof currentTime === "number" && !isNaN(currentTime)) {
              setElapsed(Math.floor(currentTime));
              elapsedRef.current = Math.floor(currentTime);
              // Gently synchronize TV video position if drifting from Admin sound by > 2.5s
              const tvTime = engine.getCurrentTime?.() ?? 0;
              if (Math.abs(tvTime - currentTime) > 2.5) {
                engine.seekTo?.(currentTime);
              }
            }
            if (typeof d === "number" && !isNaN(d) && d > 0) {
              setVideoDuration(Math.floor(d));
              durationRef.current = Math.floor(d);
            }
            if (typeof p === "boolean") {
              setIsPlaying(!p);
              if (p) {
                engine.pause?.();
              } else {
                void engine.play?.();
              }
            }
            if (track && (!nowPlayingRef.current || nowPlayingRef.current.itemId !== track.itemId)) {
              setManualNowPlaying(track);
            }
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
        isVideoFullscreen
          ? "fixed inset-0 z-[99999] w-screen h-screen bg-black overflow-hidden select-none"
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

      {/* ================= TOP BAR (COMPACT & SLEEK BROADCAST HEADER) ================= */}
      {!isVideoFullscreen && (
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
              onClick={toggleVideoMode}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border font-mono text-[11px] font-bold transition-all shadow-md active:scale-95 ${
                videoMode
                  ? "bg-indigo-600/25 text-indigo-300 border-indigo-500/40 hover:bg-indigo-600/35 hover:text-white"
                  : "bg-gradient-to-r from-cyan-500/25 to-blue-500/25 text-cyan-300 border-cyan-400/50 hover:bg-cyan-500/35 hover:text-white shadow-[0_0_12px_rgba(34,211,238,0.25)]"
              }`}
              title="Alternar entre Modo Video y Modo Énfasis en Playlist & Votos (Tecla V o control remoto)"
            >
              <span className="material-symbols-outlined text-[15px] text-cyan-400">
                {videoMode ? "smart_display" : "queue_music"}
              </span>
              <span>{videoMode ? "Modo: Video + Playlist" : "Énfasis: Playlist & Votos"}</span>
              <span className="text-[10px] text-slate-400 font-normal hidden sm:inline">(V)</span>
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

      {/* ================= MAIN VIEWPORT (SPLIT SCREEN 62/38 OR FULLSCREEN 100%) ================= */}
      <main
        className={
          isVideoFullscreen
            ? "w-full h-full p-0 m-0 block overflow-hidden bg-black"
            : "w-full flex-1 grid grid-cols-12 gap-3 min-h-0 overflow-hidden mb-2"
        }
      >
        {/* ---------------- LEFT STAGE: HERO NOW PLAYING (~58% OR FULLSCREEN 100%) ---------------- */}
        {(isVideoFullscreen || videoMode) && (
        <section
          className={
            isVideoFullscreen
              ? "w-full h-full p-0 m-0 border-0 rounded-none bg-black block overflow-hidden"
              : "col-span-7 flex flex-col justify-between rounded-xl bg-[#141824] border border-[#232b42] p-3 shadow-lg relative overflow-hidden min-h-0"
          }
        >
          {/* KARAOKE LIVE BANNER OVERLAY */}
          {!isVideoFullscreen && (karaokeMode || nowPlaying?.isKaraoke) && (
            <div className="w-full bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 text-white font-mono text-xs font-black tracking-widest px-3 py-1.5 rounded-lg mb-2 shadow-lg shadow-pink-600/30 flex items-center justify-between shrink-0 animate-pulse">
              <div className="flex items-center gap-2">
                <Mic className="size-3.5 text-yellow-300 animate-bounce" />
                <span>MODO KARAOKE EN VIVO · ¡CANTÁ CON LA PANTALLA!</span>
              </div>
              <span className="text-[9px] uppercase font-bold bg-black/40 px-2 py-0.5 rounded border border-white/20">
                Letras en Pantalla
              </span>
            </div>
          )}

          {/* Header tag within card */}
          {!isVideoFullscreen && (
            <div className="flex items-center justify-between z-10 mb-1.5 shrink-0">
              <div className="flex items-center gap-2">
                <div className="bg-indigo-500/20 text-[#c0c1ff] border border-indigo-500/40 px-2 py-0.5 rounded-md font-mono text-[10px] tracking-wider flex items-center gap-1 shadow-sm">
                  <span className="size-1.5 rounded-full bg-indigo-400 animate-ping inline-block" />
                  SONANDO AHORA
                </div>
                <span className="font-mono text-[10px] text-slate-400 tracking-wider">
                  CANAL AUDIO #01 · PRINCIPAL
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleVideoMode}
                  className="flex items-center gap-1 bg-[#0a0e17]/90 hover:bg-[#0a0e17] px-2 py-0.5 rounded-md border border-[#232b42] text-[11px] font-mono text-slate-300 hover:text-white transition-colors"
                >
                  <span className="material-symbols-outlined text-cyan-400 text-[14px]">
                    {videoMode ? "smart_display" : "album"}
                  </span>
                  <span>{videoMode ? "Ver Vinilo" : "Ver Video HD"}</span>
                </button>

                <div className="flex items-center gap-1 bg-[#0a0e17]/90 px-2 py-0.5 rounded-md border border-[#232b42]">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-mono text-[10px] text-slate-300">YouTube Stream HD</span>
                </div>
              </div>
            </div>
          )}

          {/* ================= STABLE YOUTUBE CONTAINER ================= */}
          <div
            ref={videoContainerRef}
            className={
              isVideoFullscreen
                ? "w-full h-full bg-black flex items-center justify-center overflow-hidden relative"
                : videoMode
                  ? "relative w-full aspect-video max-h-[50vh] rounded-xl overflow-hidden border border-[#232b42] shadow-xl bg-black my-auto z-10 group"
                  : "absolute -bottom-20 -right-20 w-8 h-8 opacity-0 pointer-events-none -z-50 overflow-hidden"
            }
          >
            <div className="w-full h-full relative">
              {mounted && (videoMode || isVideoFullscreen) && (
                <iframe
                  id="poneleplay-tv-iframe"
                  ref={iframeRef}
                  src={`https://www.youtube.com/embed/${resolveVideoId(nowPlaying)}?autoplay=1&mute=1&enablejsapi=1&controls=0&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&disablekb=1&widgetid=1${origin ? `&origin=${encodeURIComponent(origin)}&widget_referrer=${encodeURIComponent(origin)}` : ""}`}
                  title={nowPlaying?.title || "TV Player"}
                  className="w-full h-full border-0 pointer-events-none select-none object-cover"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  onLoad={() => {
                    engine.handshake();
                    engine.mute?.();
                  }}
                />
              )}

              {/* TRANSPARENT PROTECTION OVERLAY */}
              <div
                className="absolute inset-0 z-10 cursor-default"
                onDoubleClick={toggleVideoFullscreen}
                title="PonelePlay TV Salón"
              />

              {/* Discreet hover-only exit fullscreen button on TV */}
              {isVideoFullscreen && (
                <button
                  type="button"
                  onClick={toggleVideoFullscreen}
                  className="absolute top-4 right-4 z-30 opacity-0 hover:opacity-100 transition-opacity bg-black/90 hover:bg-black text-white font-mono text-xs px-3.5 py-1.5 rounded-lg border border-white/20 flex items-center gap-1.5 shadow-2xl cursor-pointer"
                  title="Salir de pantalla completa (F o Escape)"
                >
                  <Minimize2 className="size-3.5 text-cyan-400" />
                  <span>Salir de Pantalla Completa</span>
                </button>
              )}

              {videoMode && !isVideoFullscreen && (
                <div className="absolute top-2.5 left-2.5 bg-[#0a0e17]/90 px-2.5 py-0.5 rounded-md border border-[#283250] flex items-center gap-1.5 font-mono text-[10px] text-cyan-300 pointer-events-none shadow-md z-20">
                  <span className="size-1.5 rounded-full bg-cyan-400 animate-live-dot inline-block" />
                  <span>EN VIVO · VIDEO SALÓN HD</span>
                </div>
              )}

              {/* Dedicated video fullscreen button top-right on video */}
              {videoMode && !isVideoFullscreen && (
                <button
                  type="button"
                  onClick={toggleVideoFullscreen}
                  className="absolute top-2.5 right-2.5 z-20 size-7 rounded-lg bg-[#0a0e17]/90 hover:bg-[#181b25] border border-[#283250] flex items-center justify-center text-slate-300 hover:text-white transition-all shadow-md active:scale-90"
                  title="Pantalla completa del video (F)"
                >
                  <Maximize2 className="size-3.5 text-cyan-400" />
                </button>
              )}
            </div>
          </div>

          {/* ================= VINYL MODE VIEW (WHEN VIDEO IS OFF AND NOT FULLSCREEN) ================= */}
          {!isVideoFullscreen && !videoMode && (
            <div className="flex items-center gap-6 my-auto z-10 py-3">
              {/* Vinyl Record + Album Cover */}
              <div className="relative size-48 shrink-0 flex items-center justify-center">
                {/* Vinyl Record Grooves */}
                <div className="absolute -right-6 size-44 rounded-full bg-[#080B12] border-4 border-[#1E2433] shadow-[0_0_24px_rgba(0,0,0,0.85)] animate-spin-vinyl flex items-center justify-center z-0">
                  <div className="size-32 rounded-full border border-neutral-700/40 flex items-center justify-center">
                    <div className="size-20 rounded-full bg-gradient-to-tr from-[#6366F1] to-[#06B6D4] border-2 border-[#0a0e17] flex flex-col items-center justify-center p-1 text-center shadow-lg">
                      <span className="text-white font-mono text-[8px] uppercase tracking-wider font-extrabold">PONELE</span>
                      <span className="text-white/80 font-mono text-[6px] leading-tight">PLAY</span>
                      <div className="size-2.5 rounded-full bg-[#0a0e17] border border-white/40 mt-0.5" />
                    </div>
                  </div>
                </div>

                {/* Album Cover Front */}
                <div className="relative size-44 rounded-xl overflow-hidden border border-[#283250] shadow-xl z-10 bg-[#0a0e17] flex items-center justify-center">
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
                    <div className="w-full h-full bg-gradient-to-br from-indigo-950 via-slate-900 to-[#0a0e17] flex flex-col items-center justify-center text-indigo-300 p-4">
                      <Music2 className="size-12 text-indigo-400 mb-2" />
                      <span className="font-mono text-[10px] uppercase tracking-widest text-slate-400">PonelePlay Master</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />
                  <div className="absolute bottom-2 left-2 text-white font-mono text-[10px] uppercase tracking-wider bg-[#0A0E17]/90 px-2 py-0.5 rounded border border-[#283250]">
                    MODO VINILO · JUKEBOX
                  </div>
                </div>
              </div>

              {/* High-tech Typography Display */}
              <div className="flex-1 min-w-0 pr-3">
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-cyan-300 font-mono text-[10px] mb-2">
                  <span className="size-1 rounded-full bg-cyan-400" />
                  AMBIENTACIÓN DEL LOCAL
                </div>
                <h1 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight leading-tight truncate">
                  {decodeHtml(nowPlaying?.title || "Esperando tema...")}
                </h1>
                <h2 className="text-base font-medium text-slate-300 mt-1 truncate">
                  {nowPlaying?.artist || "Playlist activa"}
                </h2>
                <div className="flex items-center gap-3 mt-3 font-mono text-xs text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <span className="material-symbols-outlined text-cyan-400 text-[16px]">album</span>
                    Audio HD Directo
                  </span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1">
                    <span className="material-symbols-outlined text-indigo-400 text-[16px]">graphic_eq</span>
                    Audio Cabina Salón
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ================= METADATA BELOW VIDEO (WHEN VIDEO IS ON AND NOT FULLSCREEN) ================= */}
          {!isVideoFullscreen && videoMode && (
            <div className="z-10 mt-2 flex items-center justify-between shrink-0">
              <div className="min-w-0 flex-1 pr-3">
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-cyan-300 font-mono text-[10px] mb-0.5">
                  <span className="size-1 rounded-full bg-cyan-400" />
                  AMBIENTACIÓN DEL LOCAL
                </div>
                <h1 className="text-base lg:text-lg font-extrabold text-white tracking-tight leading-tight truncate">
                  {decodeHtml(nowPlaying?.title || "Esperando tema...")}
                </h1>
                <h2 className="text-xs lg:text-sm font-medium text-slate-300 truncate">
                  {nowPlaying?.artist || "Playlist activa"}
                </h2>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1 bg-indigo-500/15 text-[#c0c1ff] px-2.5 py-1 rounded-full border border-indigo-500/30 font-mono text-[11px] font-bold">
                  <span className="material-symbols-outlined text-[14px]">
                    {nowPlaying && (nowPlaying.voteCount >= 9999 || nowPlaying.voteCount === 0) ? "stars" : "thumb_up"}
                  </span>
                  <span>
                    {nowPlaying && (nowPlaying.voteCount >= 9999 || nowPlaying.voteCount === 0)
                      ? "SELECCIÓN BAR"
                      : `${nowPlaying?.voteCount ?? 0} VOTOS`}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ================= BOTTOM: CLEAN BROADCAST PROGRESS TIMELINE (NO PLAYER CONTROLS ON TV) ================= */}
          {!isVideoFullscreen && (
            <div className="z-10 mt-2 bg-[#0d1017] p-2.5 rounded-lg border border-[#1e2333] shadow-inner shrink-0">
              {/* Timeline Counters */}
              <div className="w-full flex items-center justify-between font-mono text-[11px] text-slate-300 mb-1">
                <span className="text-cyan-400 font-semibold tracking-wider">{formatDuration(elapsed)}</span>
                <span className="text-slate-500 text-[10px] tracking-widest uppercase">EN REPRODUCCIÓN</span>
                <span className="text-slate-400 font-semibold tracking-wider">{formatDuration(duration)}</span>
              </div>

              {/* Progress Bar (Visual timeline only) */}
              <div className="w-full h-2 bg-[#161a26] rounded-full overflow-hidden p-0 relative border border-[#232b42]">
                <div
                  className="h-full bg-gradient-to-r from-[#4F46E5] via-[#6366F1] to-[#06B6D4] rounded-full relative shadow-[0_0_10px_rgba(99,102,241,0.5)] transition-all duration-150"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* Salon Broadcast Info Row */}
              <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-[#1e2333] font-mono text-[10px] text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-slate-300">
                    <span className="material-symbols-outlined text-[13px] text-indigo-400">queue_music</span>
                    <span>Playlist: <strong className="text-white">{venueName}</strong></span>
                  </span>
                  <span className="text-slate-600">·</span>
                  <span>Audio Cabina Principal</span>
                </div>

                <div className="flex items-center gap-1.5 bg-indigo-500/15 text-[#c0c1ff] px-2 py-0.5 rounded-full border border-indigo-500/30 font-bold">
                  <span className="material-symbols-outlined text-[12px]">graphic_eq</span>
                  <span>TRANSMISIÓN EN SALA</span>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

        {/* ---------------- RIGHT STAGE: COLA EN VIVO + QR (~42%) (HIDDEN IN FULLSCREEN) ---------------- */}
        {!isVideoFullscreen && videoMode && (
          <section className="col-span-5 flex flex-col justify-between gap-2.5 min-h-0">
            {/* TOP SECTION: CRISP MODERN QR ENGAGEMENT CARD */}
            <div className="rounded-xl bg-[#141824] border border-[#232b42] p-3 shadow-lg flex items-center gap-3 relative overflow-hidden shrink-0">
              {/* QR display */}
              <div
                onClick={() => setQrModal(true)}
                className="relative size-24 rounded-lg bg-white p-1.5 shrink-0 border border-indigo-400/50 shadow-md cursor-pointer hover:scale-105 transition-transform"
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

              {/* Engagement callout */}
              <div className="flex-1 min-w-0">
                <span className="font-mono text-[9px] text-cyan-400 uppercase tracking-widest font-bold block mb-0.5">
                  ELEGÍ LA MÚSICA DESDE TU MESA
                </span>
                <h3 className="text-xs sm:text-sm font-bold text-white tracking-tight leading-snug truncate">
                  Escaneá el código QR y votá temas
                </h3>
                <p className="font-mono text-[10px] text-slate-400 mt-0.5 leading-tight line-clamp-2">
                  Pedí tu ticket al mozo para sumar créditos de votos instantáneos.
                </p>
                <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#0a0e17] border border-[#232b42] font-mono text-[10px] text-slate-300">
                  <span className="material-symbols-outlined text-[12px] text-indigo-400">link</span>
                  <span className="truncate">poneleplay.app/p/{slug}</span>
                </div>
              </div>
            </div>

            {/* BOTTOM SECTION: DUAL QUEUE & POPULAR PROPOSALS SWITCHER */}
            <div className="flex-1 rounded-xl bg-[#141824] border border-[#232b42] p-3 shadow-lg flex flex-col justify-between overflow-hidden min-h-0">
              <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
                {/* Switcher Tab Header */}
                <div className="flex items-center justify-between pb-2 border-b border-[#232b42] shrink-0">
                  <div className="flex items-center gap-1 p-0.5 bg-[#0a0e17] rounded-lg border border-[#1d2232]">
                    <button
                      type="button"
                      onClick={() => setSidebarTab("queue")}
                      className={`px-2.5 py-1 rounded-md font-mono text-[11px] font-bold transition-all flex items-center gap-1 ${
                        sidebarTab === "queue"
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      <span className="material-symbols-outlined text-[13px]">queue_music</span>
                      <span>En Cola ({queue.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSidebarTab("candidates")}
                      className={`px-2.5 py-1 rounded-md font-mono text-[11px] font-bold transition-all flex items-center gap-1 ${
                        sidebarTab === "candidates"
                          ? "bg-gradient-to-r from-amber-500 to-rose-600 text-white shadow-sm"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      <Flame className="size-3 text-amber-400" />
                      <span>Votación en Mesas ({nightState?.candidates?.length ?? 0})</span>
                    </button>
                  </div>

                  <span className="font-mono text-[10px] text-slate-500 hidden sm:inline">
                    Rotación auto 14s
                  </span>
                </div>

                {/* Content: TAB 1: CONFIRMED QUEUE */}
                {sidebarTab === "queue" ? (
                  <div className="mt-2 space-y-1.5 overflow-hidden flex-1 min-h-0 animate-in fade-in duration-200">
                    {queue.slice(0, 4).map((item, index) => (
                      <div
                        key={item.itemId}
                        className="p-2 rounded-lg bg-[#10141f] border border-[#1d2232] flex items-center justify-between gap-2.5 shadow-sm hover:border-[#2a344e] transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <BallChip n={index + 1} size="sm" />
                          <div className="min-w-0 flex-1">
                            <h4 className="text-xs font-bold text-white truncate">
                              {decodeHtml(item.title)}
                            </h4>
                            <p className="text-[11px] text-slate-400 truncate">
                              {item.artist}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="font-mono text-[10px] font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-md">
                            {(item.voteCount >= 9999 || item.voteCount === 0)
                              ? "⭐ Selección Bar"
                              : `${item.voteCount} ${item.voteCount === 1 ? "voto" : "votos"}`}
                          </span>
                        </div>
                      </div>
                    ))}

                    {queue.length === 0 && (
                      <div className="py-6 text-center text-xs text-slate-500 font-mono">
                        No hay canciones en cola de espera.
                      </div>
                    )}
                  </div>
                ) : (
                  /* Content: TAB 2: CANDIDATE PROPOSALS WAITING FOR 5 VOTES */
                  <div className="mt-2 space-y-2 overflow-hidden flex-1 min-h-0 animate-in fade-in duration-200">
                    {/* Voting Round Live Banner on TV */}
                    {nightState?.votingRound?.enabled && (
                      <div className="p-2 rounded-lg bg-gradient-to-r from-amber-500/15 via-rose-500/15 to-indigo-500/15 border border-amber-500/30 flex items-center justify-between font-mono text-[11px] shrink-0 mb-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="material-symbols-outlined text-amber-400 text-sm animate-pulse">timer</span>
                          <span className="font-bold text-white shrink-0">Ronda #{nightState.votingRound.roundNumber}</span>
                          <span className="text-slate-400 text-[10px] truncate">· La + votada entra a TV</span>
                        </div>
                        <span className="font-bold px-2 py-0.5 rounded bg-amber-500/25 text-amber-300 border border-amber-500/40 text-[11px] shrink-0">
                          {formatDuration(roundSecondsLeft)}
                        </span>
                      </div>
                    )}

                    {nightState?.candidates && nightState.candidates.length > 0 ? (
                      nightState.candidates.slice(0, 4).map((cand, index) => {
                        const needed = Math.max(0, 5 - cand.voteCount);
                        const percent = Math.min(100, (cand.voteCount / 5) * 100);
                        return (
                          <div
                            key={cand.id}
                            className="p-2 rounded-lg bg-[#10141f] border border-[#252030] space-y-1.5 shadow-sm"
                          >
                            <div className="flex items-center justify-between gap-2 min-w-0">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <h4 className="text-xs font-bold text-white truncate">
                                    {decodeHtml(cand.title)}
                                  </h4>
                                  {index === 0 && (
                                    <span className="shrink-0 text-[9px] font-mono font-bold bg-amber-500/25 text-amber-300 border border-amber-500/40 px-1.5 py-0.2 rounded">
                                      🏆 Líder Ronda
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-400 truncate">
                                  {cand.artist}
                                </p>
                              </div>
                              <span className="font-mono text-[10px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0">
                                <Flame className="size-3 text-amber-400" />
                                <span>{cand.voteCount}/5 votos</span>
                              </span>
                            </div>
                            {/* Visual Vote Progress Bar */}
                            <div className="w-full bg-[#181d2a] h-1.5 rounded-full overflow-hidden border border-[#232b42]">
                              <div
                                className="h-full bg-gradient-to-r from-amber-500 to-rose-500 rounded-full transition-all duration-300"
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                              <span className="text-amber-400 font-semibold">
                                {needed === 1 ? "¡Falta 1 voto para sonar en la TV!" : `Faltan ${needed} votos para sonar`}
                              </span>
                              <span className="text-slate-500">Mesa popular</span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="py-6 text-center text-xs text-slate-500 font-mono space-y-1">
                        <Flame className="size-6 text-slate-600 mx-auto" />
                        <p>No hay propuestas juntando votos en este momento.</p>
                        <p className="text-[10px] text-slate-600">¡Escaneá el QR y proponé la tuya!</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-[#232b42] flex items-center justify-between font-mono text-[10px] text-slate-400 shrink-0 mt-2">
                <span>
                  {sidebarTab === "queue"
                    ? "Modo: Prioridad por votos ponderados"
                    : nightState?.votingRound?.enabled
                      ? `Ronda activa: ${formatDuration(roundSecondsLeft)} restantes`
                      : "Meta: 5 votos para ingresar"}
                </span>
                <span className="text-cyan-400 font-semibold">● En vivo</span>
              </div>
            </div>
          </section>
        )}

        {/* ========================================================================= */}
        {/* MODE 2: ENFASIS EN PLAYLIST Y PROPUESTAS (AUDIO SALON + MAXIMA PARTICIPACION) */}
        {/* ========================================================================= */}
        {!isVideoFullscreen && !videoMode && (
          <>
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

                {/* Queue Items List (Up to 5) */}
                <div className="mt-2.5 space-y-2 overflow-hidden flex-1 min-h-0">
                  {queue.slice(0, 5).map((item, index) => (
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

                {/* Candidate Proposals List (Up to 4) */}
                <div className="mt-2.5 space-y-2 overflow-hidden flex-1 min-h-0">
                  {nightState?.candidates && nightState.candidates.length > 0 ? (
                    nightState.candidates.slice(0, 4).map((cand, index) => {
                      const needed = Math.max(0, 5 - cand.voteCount);
                      const percent = Math.min(100, (cand.voteCount / 5) * 100);
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
          </>
        )}

      </main>

      {/* ================= BOTTOM MARQUEE BAR (COMPACT BROADCAST TICKER) ================= */}
      {!isVideoFullscreen && (
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
