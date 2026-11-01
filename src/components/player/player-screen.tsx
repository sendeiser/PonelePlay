"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { Maximize2, Minimize2, Music2, Volume2, VolumeX, X, KeyRound } from "lucide-react";
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

export function PlayerScreen({ slug }: PlayerScreenProps) {
  const searchParams = useSearchParams();
  const [token, setToken] = useState<string | null>(null);
  const [pairModalOpen, setPairModalOpen] = useState(false);
  const [playerState, setPlayerState] = useState<PlayerStateResponse | null>(null);
  const [liveFallbackTracks, setLiveFallbackTracks] = useState<PlayerTrack[]>([]);

  // Continuous Night State Realtime Sync (Live Queue & Now Playing)
  const nightSource = useMemo(() => createNightStateSource(slug), [slug]);
  const { state: nightState } = useNightState(nightSource, { pollMs: 3000 });

  const liveNightQueue: PlayerTrack[] = useMemo(() => {
    if (nightState?.queue && nightState.queue.length > 0) {
      return nightState.queue.map((item) => ({
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

  // Check token from search params or localStorage
  useEffect(() => {
    const fromParam = searchParams.get("token");
    if (fromParam) {
      setToken(fromParam);
      localStorage.setItem(`poneleplay.player.${slug}`, fromParam);
      return;
    }

    const saved = localStorage.getItem(`poneleplay.player.${slug}`);
    if (saved) {
      setToken(saved);
    }
  }, [searchParams, slug]);

  // Fetch venue fallback tracks directly from Supabase & listen for playlist updates
  useEffect(() => {
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
  }, [slug]);

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
    engine.unMute?.();
    engine.setVolume?.(85);
    void engine.play();
    setAudioUnlocked(true);
    setIsMuted(false);
  }, [engine]);

  // Sync isPlaying with the player
  useEffect(() => {
    if (isPlaying) {
      void engine.play();
    } else {
      engine.pause?.();
    }
  }, [isPlaying, engine]);

  // Sync volume and mute with the player (engine re-applies them on every new song)
  useEffect(() => {
    engine.setVolume?.(volume);
    if (isMuted) {
      engine.mute?.();
    } else {
      engine.unMute?.();
    }
  }, [volume, isMuted, engine]);

  // Global click anywhere to unlock audio & video immediately
  useEffect(() => {
    const onFirstClick = () => {
      if (!audioUnlocked) {
        handleUnlockAudio();
      }
    };
    window.addEventListener("click", onFirstClick, { once: true });
    return () => window.removeEventListener("click", onFirstClick);
  }, [audioUnlocked, handleUnlockAudio]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement) return;

      const key = event.key.toLowerCase();
      if (key === "f") {
        toggleVideoFullscreen();
      }
      if (key === "v") {
        toggleVideoMode();
      }
      if (key === "m") {
        setIsMuted((prev) => {
          const next = !prev;
          if (next) engine.mute?.();
          else engine.unMute?.();
          return next;
        });
      }
      if (key === " ") {
        event.preventDefault();
        setIsPlaying((prev) => {
          const next = !prev;
          if (next) void engine.play?.();
          else engine.pause?.();
          return next;
        });
      }
      if (key === "arrowleft") {
        event.preventDefault();
        handleSeekRef.current(elapsedRef.current - 10);
      }
      if (key === "arrowright") {
        event.preventDefault();
        handleSeekRef.current(elapsedRef.current + 10);
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
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine, videoMode, toggleVideoFullscreen]);

  // Unified track list (live night queue -> runtime queue -> venue fallback -> demo)
  const allTracks: PlayerTrack[] = useMemo(() => {
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
  }, [liveNightQueue, liveNightNowPlaying, playerState, liveFallbackTracks]);

  // Now playing: prioritizing manualNowPlaying -> liveNightNowPlaying -> playerState.nowPlaying -> allTracks[0]
  const nowPlaying: PlayerTrack | null = useMemo(() => {
    if (manualNowPlaying) return manualNowPlaying;
    if (liveNightNowPlaying) return liveNightNowPlaying;
    if (playerState?.nowPlaying) return playerState.nowPlaying;
    return allTracks[0] ?? null;
  }, [manualNowPlaying, liveNightNowPlaying, playerState, allTracks]);

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
    if (nowPlaying && mounted) {
      void engine.load(nowPlaying);
    }
  }, [nowPlaying, mounted, engine]);

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

  function handleVolumeChange(newVol: number) {
    setVolume(newVol);
    engine.setVolume?.(newVol);
    if (newVol > 0 && isMuted) {
      setIsMuted(false);
      engine.unMute?.();
    }
  }

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

  const handleSeekDelta = useCallback(
    (deltaSec: number) => {
      handleSeek(elapsedRef.current + deltaSec);
    },
    [handleSeek],
  );

  const handleSeekClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, clickX / rect.width));
      const targetSec = Math.floor(pct * (durationRef.current || 210));
      handleSeek(targetSec);
    },
    [handleSeek],
  );

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

  const handleRestartOrPrev = useCallback(() => {
    const candidates = queue.length > 0 ? queue : allTracks;
    if (elapsedRef.current <= 5 && candidates.length > 0) {
      const prevTrack = candidates[candidates.length - 1];
      setManualNowPlaying(prevTrack);
      setElapsed(0);
      elapsedRef.current = 0;
      setVideoDuration(prevTrack.durationSeconds ?? null);
      setIsPlaying(true);
      void engine.load(prevTrack);
      setHudMessage(`⏮️ Anterior: ${prevTrack.title}`);
      setTimeout(() => setHudMessage(null), 2500);
      return;
    }
    if (nowPlaying) {
      setElapsed(0);
      elapsedRef.current = 0;
      engine.seekTo?.(0);
      void engine.play();
      setHudMessage(`⏮️ Reiniciando: ${nowPlaying.title}`);
      setTimeout(() => setHudMessage(null), 2500);
    }
  }, [nowPlaying, queue, allTracks, engine]);

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

  // Keyboard shortcuts for Skip (S) and Restart/Prev (R)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key.toLowerCase() === "s") {
        void handleSkipNext(false);
      } else if (e.key.toLowerCase() === "r") {
        handleRestartOrPrev();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [handleSkipNext, handleRestartOrPrev]);

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
        .subscribe();
    });

    // 3. Broadcast live TV playback progress to Admin Panel every 1s over the SAME subscribed channel
    const broadcastTimer = setInterval(() => {
      const track = nowPlayingRef.current;
      if (channel && track) {
        void channel.send({
          type: "broadcast",
          event: "tv_playback_progress",
          payload: {
            currentTime: elapsedRef.current,
            duration: durationRef.current,
            isPaused: !isPlayingRef.current,
            trackId: track.trackId,
            track,
            isVideoFullscreen: isVideoFullscreenRef.current,
          },
        });
      }
    }, 1000);

    return () => {
      active = false;
      clearInterval(broadcastTimer);
      if (channel) {
        void import("@/lib/api/supabase/browser").then(({ createBrowserSupabase }) => {
          const supabase = createBrowserSupabase();
          void supabase.removeChannel(channel!);
        });
      }
    };
  }, [slug, engine]);

  return (
    <div
      className={
        isVideoFullscreen
          ? "fixed inset-0 z-[99999] w-screen h-screen bg-black overflow-hidden select-none"
          : "tech-bg relative flex min-h-dvh flex-col justify-between overflow-hidden text-[#dfe2ef] select-none"
      }
    >
      {/* Realtime Master Control HUD Message Toast */}
      {hudMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[#0A0E17]/95 text-white font-mono text-sm font-bold px-6 py-2.5 rounded-full border border-indigo-500/50 shadow-2xl backdrop-blur-md animate-fade-in flex items-center gap-2">
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

      {/* ================= TOP BAR (NOCTURNE PRECISION HEADER) ================= */}
      {!isVideoFullscreen && (
        <header className="w-full px-8 py-3 flex justify-between items-center z-50 bg-[#0A0E17]/95 backdrop-blur-xl border-b border-[#232b42] shadow-xl">
        {/* Brand / Logo & Venue Anchor */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/25">
              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                graphic_eq
              </span>
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-white text-base tracking-tight leading-none">
                Ponele<span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">Play</span>
              </span>
              <span className="font-mono text-[9px] uppercase tracking-widest text-slate-400 mt-0.5">
                Jukebox & TV Precision
              </span>
            </div>
          </div>

          <div className="h-5 w-px bg-[#232b42]" />

          {/* Venue Badge */}
          <div className="flex items-center gap-1.5 bg-[#181b25] px-3 py-1 rounded-lg border border-[#232b42]">
            <span className="material-symbols-outlined text-cyan-400 text-[16px]">location_on</span>
            <span className="font-mono text-xs uppercase tracking-wider text-slate-300 font-semibold">
              {venueName}
            </span>
          </div>

          {/* Karaoke Mode Active Badge */}
          {karaokeMode || nowPlaying?.isKaraoke ? (
            <div className="flex items-center gap-2 bg-gradient-to-r from-pink-500/25 via-purple-500/25 to-cyan-500/25 px-3.5 py-1 rounded-full border border-pink-500/40 shadow-[0_0_16px_rgba(236,72,153,0.35)] animate-pulse">
              <span className="material-symbols-outlined text-pink-400 text-[18px]">
                mic_external_on
              </span>
              <span className="text-pink-200 font-mono text-xs font-bold tracking-wider uppercase">
                MODO KARAOKE ACTIVO
              </span>
            </div>
          ) : null}

          {/* Live Session Status */}
          <div className="flex items-center gap-2 bg-indigo-500/15 px-3 py-1 rounded-full border border-indigo-500/30 shadow-[0_0_14px_rgba(99,102,241,0.25)]">
            <span className="size-2 rounded-full bg-cyan-400 animate-live-dot inline-block" />
            <span className="text-[#c0c1ff] font-mono text-xs font-semibold tracking-wide">
              {token ? "CANAL HOST SINCRONIZADO" : "EN VIVO · REPRODUCIENDO"}
            </span>
          </div>

          {/* Video / Vinyl Mode Toggle Pill */}
          <button
            type="button"
            onClick={toggleVideoMode}
            className={`flex items-center gap-2 px-3 py-1 rounded-lg border font-mono text-xs font-semibold transition-all ${
              videoMode
                ? "bg-indigo-600/30 text-indigo-300 border-indigo-500/50 shadow-[0_0_12px_rgba(99,102,241,0.25)]"
                : "bg-[#181b25] text-slate-300 border-[#232b42] hover:text-white"
            }`}
            title="Alternar Modo Video / Modo Vinilo (Tecla V)"
          >
            <span className="material-symbols-outlined text-[17px]">
              {videoMode ? "smart_display" : "album"}
            </span>
            <span>{videoMode ? "Modo Video (ON)" : "Modo Vinilo"}</span>
          </button>
        </div>

        {/* Volume, Pairing modal trigger & Precision Clock */}
        <div className="flex items-center gap-3">
          {/* Unlock Autoplay Sound Button if needed */}
          {!audioUnlocked && (
            <button
              type="button"
              onClick={handleUnlockAudio}
              className="animate-pulse bg-gradient-to-r from-cyan-500 to-indigo-500 text-black px-3.5 py-1.5 rounded-lg font-mono text-xs font-bold shadow-lg flex items-center gap-1.5 hover:opacity-90 transition-opacity"
            >
              <Volume2 className="size-3.5" />
              <span>Activar Sonido TV</span>
            </button>
          )}

          {/* Volume Control Bar */}
          <div className="flex items-center gap-2 bg-[#181b25] px-3 py-1.5 rounded-lg border border-[#232b42]">
            <button
              type="button"
              onClick={() => {
                setIsPlaying((prev) => {
                  const next = !prev;
                  if (next) void engine.play?.();
                  else engine.pause?.();
                  return next;
                });
              }}
              className="text-slate-400 hover:text-white transition-colors mr-1"
              title={isPlaying ? "Pausar (Espacio)" : "Reanudar (Espacio)"}
            >
              <span className="material-symbols-outlined text-[18px]">
                {isPlaying ? "pause" : "play_arrow"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsMuted((prev) => {
                  const next = !prev;
                  if (next) engine.mute?.();
                  else engine.unMute?.();
                  return next;
                });
              }}
              className="text-slate-400 hover:text-white transition-colors"
              title="Silenciar / Activar Sonido (M)"
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
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
              className="w-16 accent-indigo-500 h-1.5 bg-[#0a0e17] rounded-lg cursor-pointer"
              title={`Volumen: ${volume}%`}
            />
            <span className="font-mono text-[11px] text-slate-300 w-7 text-right">
              {isMuted ? "0%" : `${volume}%`}
            </span>
          </div>

          {/* Device Pair Pill / Status */}
          <button
            type="button"
            onClick={() => setPairModalOpen(true)}
            className="flex items-center gap-1.5 bg-[#181b25] hover:bg-[#202534] px-3 py-1.5 rounded-lg border border-[#232b42] text-xs font-mono text-slate-300 hover:text-white transition-colors"
            title="Vincular con token de pantalla"
          >
            <KeyRound className="size-3.5 text-indigo-400" />
            <span>{token ? "Dispositivo OK" : "Vincular"}</span>
          </button>

          {/* Clock */}
          <div className="flex items-center gap-2 bg-[#1c1f29] px-3 py-1.5 rounded-lg border border-[#283250] shadow-inner font-mono">
            <span className="material-symbols-outlined text-indigo-400 text-[18px]">schedule</span>
            <span
              suppressHydrationWarning
              className="text-white font-bold text-sm tracking-widest"
            >
              {clock}
            </span>
          </div>

          {/* Fullscreen Button */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="size-9 rounded-lg bg-[#181b25] border border-[#232b42] flex items-center justify-center text-slate-400 hover:text-white transition-colors"
            title="Pantalla completa (F)"
          >
            {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
        </div>
      </header>
      )}

      {/* ================= MAIN VIEWPORT (SPLIT SCREEN 62/38 OR FULLSCREEN 100%) ================= */}
      <main
        className={
          isVideoFullscreen
            ? "w-full h-full p-0 m-0 block overflow-hidden bg-black"
            : "w-full flex-1 px-8 py-4 grid grid-cols-12 gap-6 items-stretch max-h-[calc(100vh-115px)]"
        }
      >
        {/* ---------------- LEFT STAGE: HERO NOW PLAYING (~62% OR FULLSCREEN 100%) ---------------- */}
        <section
          className={
            isVideoFullscreen
              ? "w-full h-full p-0 m-0 border-0 rounded-none bg-black block overflow-hidden"
              : "col-span-7 flex flex-col justify-between rounded-2xl bg-[#181b25]/90 border border-[#232b42] p-6 shadow-2xl relative overflow-hidden backdrop-blur-xl"
          }
        >
          {/* Ambient tech glows */}
          {!isVideoFullscreen && (
            <>
              <div className="absolute -top-28 -left-28 w-96 h-96 bg-[#6366F1]/15 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-24 -right-24 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
            </>
          )}

          {/* Header tag within card */}
          {!isVideoFullscreen && (
            <div className="flex items-center justify-between z-10 mb-2">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-500/20 text-[#c0c1ff] border border-indigo-500/40 px-3 py-1 rounded-md font-mono text-xs tracking-wider flex items-center gap-1.5 shadow-[0_0_14px_rgba(99,102,241,0.3)]">
                  <span className="size-2 rounded-full bg-indigo-400 animate-ping inline-block" />
                  SONANDO AHORA
                </div>
                <span className="font-mono text-xs text-slate-400 tracking-wider">
                  CANAL AUDIO #01 · PRINCIPAL
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={toggleVideoMode}
                  className="flex items-center gap-1.5 bg-[#0a0e17]/80 hover:bg-[#0a0e17] px-3 py-1 rounded-md border border-[#232b42] text-xs font-mono text-slate-300 hover:text-white transition-colors"
                >
                  <span className="material-symbols-outlined text-cyan-400 text-[18px]">
                    {videoMode ? "smart_display" : "album"}
                  </span>
                  <span>{videoMode ? "Ver Vinilo" : "Ver Video HD"}</span>
                </button>

                <div className="flex items-center gap-1.5 bg-[#0a0e17]/80 px-3 py-1 rounded-md border border-[#232b42]">
                  <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-mono text-xs text-slate-300">YouTube Stream HD</span>
                </div>
              </div>
            </div>
          )}

          {/* ================= STABLE YOUTUBE CONTAINER ================= */}
          {/* When isVideoFullscreen is TRUE: Clean Fullscreen Video without any playback controls */}
          {/* When videoMode is TRUE: Centered 16:9 Video Canvas */}
          {/* When videoMode is FALSE: Off-screen continuous audio playback */}
          <div
            ref={videoContainerRef}
            className={
              isVideoFullscreen
                ? "w-full h-full bg-black flex items-center justify-center overflow-hidden relative"
                : videoMode
                  ? "relative w-full aspect-video max-h-[520px] lg:max-h-[580px] xl:max-h-[640px] rounded-2xl overflow-hidden border border-[#283250] shadow-2xl bg-black my-auto z-10 group"
                  : "absolute -bottom-20 -right-20 w-8 h-8 opacity-0 pointer-events-none -z-50 overflow-hidden"
            }
          >
            <div className="w-full h-full relative">
              {mounted && (
                <iframe
                  id="poneleplay-tv-iframe"
                  ref={iframeRef}
                  src={`https://www.youtube.com/embed/${resolveVideoId(nowPlaying)}?autoplay=1&enablejsapi=1&controls=0&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&disablekb=1&widgetid=1${origin ? `&origin=${encodeURIComponent(origin)}&widget_referrer=${encodeURIComponent(origin)}` : ""}`}
                  title={nowPlaying?.title || "TV Player"}
                  className="w-full h-full border-0 pointer-events-none select-none object-cover"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  onLoad={() => {
                    engine.handshake();
                  }}
                />
              )}

              {/* TRANSPARENT PROTECTION OVERLAY: Blocks any internal click or navigation on YouTube video */}
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
                  className="absolute top-4 right-4 z-30 opacity-0 hover:opacity-100 transition-opacity bg-black/80 hover:bg-black text-white font-mono text-xs px-3.5 py-1.5 rounded-lg border border-white/20 backdrop-blur-md flex items-center gap-1.5 shadow-2xl cursor-pointer"
                  title="Salir de pantalla completa (F o Escape)"
                >
                  <Minimize2 className="size-3.5 text-cyan-400" />
                  <span>Salir de Pantalla Completa</span>
                </button>
              )}

              {videoMode && !isVideoFullscreen && (
                <div className="absolute top-3 left-3 bg-[#0a0e17]/85 backdrop-blur-md px-3 py-1 rounded-md border border-[#283250] flex items-center gap-2 font-mono text-[11px] text-cyan-300 pointer-events-none shadow-lg z-20">
                  <span className="size-2 rounded-full bg-cyan-400 animate-live-dot inline-block" />
                  <span>EN VIVO · VIDEO SALÓN HD</span>
                </div>
              )}

              {/* Dedicated video fullscreen button top-right on video (only visible when NOT fullscreen) */}
              {videoMode && !isVideoFullscreen && (
                <button
                  type="button"
                  onClick={toggleVideoFullscreen}
                  className="absolute top-3 right-3 z-20 size-8 rounded-lg bg-[#0a0e17]/85 hover:bg-[#181b25] border border-[#283250] flex items-center justify-center text-slate-300 hover:text-white transition-all shadow-lg active:scale-90"
                  title="Pantalla completa del video (F)"
                >
                  <Maximize2 className="size-4 text-cyan-400" />
                </button>
              )}

              {/* Click to unmute overlay */}
              {!audioUnlocked && videoMode && (
                <button
                  type="button"
                  onClick={handleUnlockAudio}
                  className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs cursor-pointer group-hover:bg-black/50 transition-colors"
                >
                  <div className="px-5 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-cyan-500 text-white font-mono text-xs font-bold shadow-2xl flex items-center gap-2 animate-pulse">
                    <Volume2 className="size-5" />
                    <span>CLIC PARA ACTIVAR AUDIO DEL SALÓN</span>
                  </div>
                </button>
              )}
            </div>
          </div>

          {/* ================= VINYL MODE VIEW (WHEN VIDEO IS OFF AND NOT FULLSCREEN) ================= */}
          {!isVideoFullscreen && !videoMode && (
            <div className="flex items-center gap-8 my-auto z-10 py-4">
              {/* Vinyl Record + Album Cover */}
              <div className="relative w-64 h-64 shrink-0 flex items-center justify-center">
                {/* Vinyl Record Grooves */}
                <div className="absolute -right-8 size-56 rounded-full bg-[#080B12] border-4 border-[#1E2433] shadow-[0_0_32px_rgba(0,0,0,0.85)] animate-spin-vinyl flex items-center justify-center z-0">
                  <div className="size-44 rounded-full border border-neutral-700/40 flex items-center justify-center">
                    <div className="size-32 rounded-full border border-neutral-700/30 flex items-center justify-center">
                      <div className="size-20 rounded-full bg-gradient-to-tr from-[#6366F1] to-[#06B6D4] border-2 border-[#0a0e17] flex flex-col items-center justify-center p-1 text-center shadow-lg">
                        <span className="text-white font-mono text-[9px] uppercase tracking-wider font-extrabold">PONELE</span>
                        <span className="text-white/80 font-mono text-[7px] leading-tight">PLAY</span>
                        <div className="size-3 rounded-full bg-[#0a0e17] border border-white/40 mt-0.5" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Album Cover Front */}
                <div className="relative size-56 rounded-2xl overflow-hidden border border-[#283250] shadow-2xl z-10 bg-[#0a0e17] flex items-center justify-center">
                  {nowPlaying?.thumbnailUrl ? (
                    <Image
                      src={nowPlaying.thumbnailUrl}
                      alt={nowPlaying.title}
                      width={224}
                      height={224}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-indigo-950 via-slate-900 to-[#0a0e17] flex flex-col items-center justify-center text-indigo-300 p-4">
                      <Music2 className="size-16 text-indigo-400 mb-2" />
                      <span className="font-mono text-xs uppercase tracking-widest text-slate-400">PonelePlay Master</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />
                  <div className="absolute bottom-3 left-3 text-white font-mono text-[11px] uppercase tracking-wider bg-[#0A0E17]/80 backdrop-blur-md px-2.5 py-0.5 rounded border border-[#283250]">
                    MODO VINILO · JUKEBOX
                  </div>
                </div>
              </div>

              {/* High-tech Typography Display */}
              <div className="flex-1 min-w-0 pr-4">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-cyan-300 font-mono text-xs mb-3">
                  <span className="size-1.5 rounded-full bg-cyan-400" />
                  AMBIENTACIÓN DEL LOCAL
                </div>
                <h1 className="text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-[1.05] drop-shadow-sm truncate">
                  {nowPlaying?.title || "Esperando tema..."}
                </h1>
                <h2 className="text-xl font-medium text-slate-300 mt-2 truncate">
                  {nowPlaying?.artist || "Playlist activa"}
                </h2>
                <div className="flex items-center gap-4 mt-4 font-mono text-xs text-slate-400">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-cyan-400 text-[18px]">album</span>
                    Audio HD Directo
                  </span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-indigo-400 text-[18px]">graphic_eq</span>
                    Stereo Master
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ================= METADATA BELOW VIDEO (WHEN VIDEO IS ON AND NOT FULLSCREEN) ================= */}
          {!isVideoFullscreen && videoMode && (
            <div className="z-10 mt-3 flex items-center justify-between">
              <div className="min-w-0 flex-1 pr-4">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-cyan-300 font-mono text-[11px] mb-1">
                  <span className="size-1.5 rounded-full bg-cyan-400" />
                  AMBIENTACIÓN DEL LOCAL
                </div>
                <h1 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight leading-tight truncate">
                  {nowPlaying?.title || "Esperando tema..."}
                </h1>
                <h2 className="text-base font-medium text-slate-300 truncate mt-0.5">
                  {nowPlaying?.artist || "Playlist activa"}
                </h2>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1.5 bg-indigo-500/15 text-[#c0c1ff] px-3 py-1 rounded-full border border-indigo-500/30 font-mono text-xs font-bold">
                  <span className="material-symbols-outlined text-[16px]">thumb_up</span>
                  <span>{nowPlaying?.voteCount ?? 14} VOTOS</span>
                </div>
              </div>
            </div>
          )}

          {/* Bottom: Progress Bar & Direct TV Controls (HIDDEN IN FULLSCREEN) */}
          {!isVideoFullscreen && (
            <div className="z-10 mt-3 bg-[#1c1f29]/95 p-4 rounded-xl border border-[#232b42] shadow-inner">
              {/* Timeline Counters */}
              <div className="w-full flex items-center justify-between font-mono text-xs text-slate-300 mb-1">
                <span className="text-cyan-400 font-semibold tracking-wider">{formatDuration(elapsed)}</span>
                <span className="text-slate-500 text-[11px] tracking-widest uppercase">EN REPRODUCCIÓN</span>
                <span className="text-slate-400 font-semibold tracking-wider">{formatDuration(duration)}</span>
              </div>

              {/* Modern Interactive Scrubber Progress Bar */}
              <div
                onClick={handleSeekClick}
                className="group/scrub relative w-full h-5 flex items-center cursor-pointer select-none py-1"
                title="Hacer clic para adelantar o retroceder el video en la pantalla"
              >
                <div className="w-full h-2.5 group-hover/scrub:h-3.5 bg-[#0a0e17] rounded-full overflow-hidden p-0 relative shadow-inner border border-[#232b42] transition-all">
                  <div
                    className="h-full bg-gradient-to-r from-[#4F46E5] via-[#6366F1] to-[#06B6D4] rounded-full relative shadow-[0_0_16px_rgba(99,102,241,0.6)] transition-all duration-150"
                    style={{ width: `${progressPercent}%` }}
                  >
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 size-4 bg-white rounded-full shadow-[0_0_8px_#ffffff] border-2 border-[#6366F1] scale-100 group-hover/scrub:scale-125 transition-transform" />
                  </div>
                </div>
              </div>

              {/* Direct TV Control Bar */}
              <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-[#283250]">
                <div className="flex items-center gap-2">
                  {/* Reiniciar */}
                  <button
                    type="button"
                    onClick={handleRestartOrPrev}
                    className="size-8 rounded-lg bg-[#262a34] hover:bg-[#323746] border border-[#283250] flex items-center justify-center text-slate-300 hover:text-white transition-all active:scale-90"
                    title="Reiniciar canción (R)"
                  >
                    <span className="material-symbols-outlined text-[18px]">replay</span>
                  </button>

                  {/* -10s */}
                  <button
                    type="button"
                    onClick={() => handleSeekDelta(-10)}
                    className="px-2.5 py-1 rounded-lg bg-[#262a34] hover:bg-[#323746] border border-[#283250] font-mono text-xs font-bold text-slate-300 hover:text-white transition-all active:scale-90 flex items-center gap-1"
                    title="Retroceder 10 segundos (Flecha Izquierda)"
                  >
                    <span className="material-symbols-outlined text-[16px]">replay_10</span>
                    <span>-10s</span>
                  </button>

                  {/* Play / Pause Primary Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsPlaying((prev) => {
                        const next = !prev;
                        if (next) void engine.play?.();
                        else engine.pause?.();
                        return next;
                      });
                    }}
                    className="size-9 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 text-white flex items-center justify-center shadow-md shadow-indigo-500/25 transition-all active:scale-95"
                    title={isPlaying ? "Pausar video (Espacio)" : "Reanudar video (Espacio)"}
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {isPlaying ? "pause" : "play_arrow"}
                    </span>
                  </button>

                  {/* +10s */}
                  <button
                    type="button"
                    onClick={() => handleSeekDelta(10)}
                    className="px-2.5 py-1 rounded-lg bg-[#262a34] hover:bg-[#323746] border border-[#283250] font-mono text-xs font-bold text-slate-300 hover:text-white transition-all active:scale-90 flex items-center gap-1"
                    title="Adelantar 10 segundos (Flecha Derecha)"
                  >
                    <span>+10s</span>
                    <span className="material-symbols-outlined text-[16px]">forward_10</span>
                  </button>

                  {/* Skip Next */}
                  <button
                    type="button"
                    onClick={() => void handleSkipNext()}
                    className="size-8 rounded-lg bg-[#262a34] hover:bg-[#323746] border border-[#283250] flex items-center justify-center text-slate-300 hover:text-white transition-all active:scale-90"
                    title="Saltear al siguiente tema (S)"
                  >
                    <span className="material-symbols-outlined text-[18px]">skip_next</span>
                  </button>

                  {/* Video Fullscreen Mode */}
                  {videoMode && (
                    <button
                      type="button"
                      onClick={toggleVideoFullscreen}
                      className="size-8 rounded-lg bg-[#262a34] hover:bg-[#323746] border border-[#283250] flex items-center justify-center text-slate-300 hover:text-cyan-400 transition-all active:scale-90 ml-1"
                      title="Pantalla completa del video (F)"
                    >
                      <Maximize2 className="size-4" />
                    </button>
                  )}
                </div>

                {/* Attribution info */}
                <div className="flex items-center gap-3">
                  <p className="text-xs text-slate-300 hidden md:block">
                    Playlist: <span className="text-white font-bold">{venueName}</span>
                  </p>
                  <div className="flex items-center gap-1.5 bg-indigo-500/15 text-[#c0c1ff] px-3 py-1 rounded-full border border-indigo-500/30 font-mono text-xs font-bold">
                    <span className="material-symbols-outlined text-[16px]">graphic_eq</span>
                    <span>EN SALA</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ---------------- RIGHT STAGE: COLA EN VIVO + QR (~38%) (HIDDEN IN FULLSCREEN) ---------------- */}
        {!isVideoFullscreen && (
          <section className="col-span-5 flex flex-col justify-between gap-4">
          {/* TOP SECTION: CRISP MODERN QR ENGAGEMENT CARD */}
          <div className="rounded-2xl bg-[#181b25]/95 border border-[#232b42] p-5 shadow-2xl flex items-center gap-5 relative overflow-hidden backdrop-blur-xl">
            <div className="absolute -right-12 -top-12 size-44 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

            {/* QR display */}
            <div
              onClick={() => setQrModal(true)}
              className="relative size-32 rounded-xl bg-white p-2 shrink-0 border-2 border-indigo-400/50 shadow-lg cursor-pointer hover:scale-105 transition-transform"
              title="Click para agrandar QR"
            >
              {qr ? (
                <Image
                  src={qr}
                  alt="QR para votar"
                  width={120}
                  height={120}
                  className="w-full h-full object-contain"
                  unoptimized
                />
              ) : (
                <div className="w-full h-full bg-slate-200 animate-pulse rounded" />
              )}
            </div>

            {/* Engagement callout */}
            <div className="flex-1 min-w-0">
              <span className="font-mono text-[10px] text-cyan-400 uppercase tracking-widest font-bold block mb-1">
                ELEGÍ LA MÚSICA DESDE TU MESA
              </span>
              <h3 className="text-base font-bold text-white tracking-tight leading-snug">
                Escaneá el código QR y votá la próxima canción
              </h3>
              <p className="font-mono text-[11px] text-slate-400 mt-1.5 leading-tight">
                Pedí tu ticket al mozo para sumar créditos de votos instantáneos.
              </p>
              <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0a0e17] border border-[#232b42] font-mono text-[10px] text-slate-300">
                <span className="material-symbols-outlined text-xs text-indigo-400">link</span>
                <span>poneleplay.app/p/{slug}</span>
              </div>
            </div>
          </div>

          {/* BOTTOM SECTION: UPCOMING QUEUE WITH BILLIARD / RANK TOKENS */}
          <div className="flex-1 rounded-2xl bg-[#181b25]/95 border border-[#232b42] p-5 shadow-2xl flex flex-col justify-between overflow-hidden backdrop-blur-xl">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-[#232b42]">
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                    <span className="material-symbols-outlined text-indigo-400 text-lg">queue_music</span>
                    A CONTINUACIÓN EN VIVO
                  </h3>
                  <p className="font-mono text-[11px] text-slate-400">
                    Orden de reproducción en sala
                  </p>
                </div>
                <span className="font-mono text-xs text-cyan-300 bg-cyan-500/10 border border-cyan-500/25 px-2.5 py-0.5 rounded-full">
                  {queue.length} en cola
                </span>
              </div>

              {/* Queue Items List */}
              <div className="mt-3.5 space-y-2.5">
                {queue.slice(0, 4).map((item, index) => (
                  <div
                    key={item.itemId}
                    className="p-3 rounded-xl bg-[#131722] border border-[#1e2333] flex items-center justify-between gap-3 shadow-sm hover:border-[#2a344e] transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <BallChip n={index + 1} size="md" />
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-bold text-white truncate">
                          {item.title}
                        </h4>
                        <p className="text-xs text-slate-400 truncate mt-0.5">
                          {item.artist}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-xs font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-lg">
                        {item.voteCount} {item.voteCount === 1 ? "voto" : "votos"}
                      </span>
                    </div>
                  </div>
                ))}

                {queue.length === 0 && (
                  <div className="py-8 text-center text-xs text-slate-500 font-mono">
                    No hay canciones en cola de espera.
                  </div>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-[#232b42] flex items-center justify-between font-mono text-[11px] text-slate-400">
              <span>Modo: Prioridad por votos ponderados</span>
              <span className="text-cyan-400 font-semibold">● En línea</span>
            </div>
          </div>
        </section>
        )}
      </main>

      {/* ================= BOTTOM MARQUEE BAR (HIDDEN IN FULLSCREEN) ================= */}
      {!isVideoFullscreen && (
        <footer className="w-full bg-[#0a0e17] border-t border-[#232b42] py-2 px-6 overflow-hidden z-40">
          <div className="animate-marquee items-center gap-12 font-mono text-xs text-slate-400">
            <span className="flex items-center gap-2">
              <span className="text-cyan-400 font-bold">🎵 BIENVENIDO A {venueName.toUpperCase()}</span>
              <span>·</span>
              <span>Pedí tus temas favoritos escaneando el código QR en la mesa</span>
              <span>·</span>
              <span>Cada consumición suma créditos de votos</span>
              <span>·</span>
              <span>Jukebox impulsado por PonelePlay</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="text-cyan-400 font-bold">🎵 BIENVENIDO A {venueName.toUpperCase()}</span>
              <span>·</span>
              <span>Pedí tus temas favoritos escaneando el código QR en la mesa</span>
              <span>·</span>
              <span>Cada consumición suma créditos de votos</span>
              <span>·</span>
              <span>Jukebox impulsado por PonelePlay</span>
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

      {/* QR Large Overlay Modal */}
      {qrModal && (
        <div
          onClick={() => setQrModal(false)}
          className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-6 cursor-pointer"
        >
          <button
            type="button"
            onClick={() => setQrModal(false)}
            className="absolute top-6 right-6 text-slate-400 hover:text-white"
          >
            <X className="size-8" />
          </button>
          <div className="bg-white p-6 rounded-3xl shadow-2xl max-w-sm w-full text-center">
            {qr && (
              <Image
                src={qr}
                alt="QR Gigante para votar"
                width={360}
                height={360}
                className="w-full h-auto mx-auto"
                unoptimized
              />
            )}
            <h3 className="text-slate-900 font-bold text-lg mt-4">
              Escaneá con tu celular
            </h3>
            <p className="font-mono text-xs text-slate-600 mt-1">
              poneleplay.app/p/{slug}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
