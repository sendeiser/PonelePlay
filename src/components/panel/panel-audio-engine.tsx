"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { PlayerTrack } from "@/lib/api/player";
import type { YTPlayerInstance } from "@/types/youtube";
import { loadYoutubeIframeApi } from "@/components/player/youtube-engine";
import { resolveVideoId } from "@/components/player/iframe-engine";
import { createBrowserSupabase } from "@/lib/api/supabase/browser";

export interface PanelAudioEngineProps {
  slug: string;
  currentTrack: PlayerTrack | null;
  isPaused: boolean;
  volume: number; // 0 - 100
  isMuted: boolean;
  onTrackEnded: () => void;
  onProgress?: (currentTime: number, duration: number | null) => void;
  onAudioBlockedChange?: (isBlocked: boolean) => void;
}

export interface PanelAudioEngineRef {
  seekTo: (seconds: number) => void;
  unlockAudio: () => void;
  isUnlocked: boolean;
}

export const PanelAudioEngine = forwardRef<PanelAudioEngineRef, PanelAudioEngineProps>(
  function PanelAudioEngine(
    {
      currentTrack,
      isPaused,
      volume,
      isMuted,
      onTrackEnded,
      onProgress,
      onAudioBlockedChange,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const html5AudioRef = useRef<HTMLAudioElement>(null);
    const playerRef = useRef<YTPlayerInstance | null>(null);
    const ytInitializedRef = useRef(false);
    const currentVideoIdRef = useRef<string>("");
    const isUnlockedRef = useRef(false);
    const [, setIsBlockedState] = useState(false);

    // Stable refs for callbacks and intervals
    const currentTrackRef = useRef<PlayerTrack | null>(currentTrack);
    currentTrackRef.current = currentTrack;
    const isPausedRef = useRef(isPaused);
    isPausedRef.current = isPaused;
    const volumeRef = useRef(volume);
    volumeRef.current = volume;
    const isMutedRef = useRef(isMuted);
    isMutedRef.current = isMuted;
    const onTrackEndedRef = useRef(onTrackEnded);
    onTrackEndedRef.current = onTrackEnded;
    const onProgressRef = useRef(onProgress);
    onProgressRef.current = onProgress;
    const lastReportedTimeRef = useRef<number>(0);
    const capturedWidgetIdRef = useRef<number | string | null>(null);

    // Reset elapsed timer on track change
    useEffect(() => {
      lastReportedTimeRef.current = 0;
    }, [currentTrack?.itemId, currentTrack?.youtubeVideoId]);

    // Capture YouTube postMessage events and widget IDs
    useEffect(() => {
      function onMessage(e: MessageEvent) {
        if (typeof e.origin === "string" && !e.origin.includes("youtube.com") && !e.origin.includes("youtube-nocookie.com")) {
          return;
        }
        let data: { event?: string; info?: unknown; id?: number | string } | null = null;
        try {
          data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        } catch {
          return;
        }
        if (!data || typeof data !== "object") return;
        if (data.id !== undefined && data.id !== null) {
          capturedWidgetIdRef.current = data.id;
        }
        if (data.event === "infoDelivery" && data.info) {
          const info = data.info as { currentTime?: number; duration?: number };
          if (typeof info.currentTime === "number" && info.currentTime > 0) {
            lastReportedTimeRef.current = Math.round(info.currentTime * 10) / 10;
          }
        }
      }
      window.addEventListener("message", onMessage);
      return () => window.removeEventListener("message", onMessage);
    }, []);

    const sendIframeCommand = useCallback((func: string, args: unknown[] = []) => {
      if (playerRef.current) {
        try {
          const fn = (playerRef.current as unknown as Record<string, unknown>)[func];
          if (typeof fn === "function") {
            (fn as (...a: unknown[]) => void).apply(playerRef.current, args);
          }
        } catch {}
      }

      // Also dispatch via postMessage to all candidate YouTube iframes in container
      const iframes = [
        containerRef.current?.querySelector("iframe"),
        document.getElementById("admin-audio-yt-host") as HTMLIFrameElement,
        document.getElementById("admin-audio-fallback-iframe") as HTMLIFrameElement,
      ].filter(Boolean) as HTMLIFrameElement[];

      for (const ifr of iframes) {
        if (ifr.contentWindow) {
          try {
            ifr.contentWindow.postMessage(
              JSON.stringify({ event: "command", func, args }),
              "*"
            );
            ifr.contentWindow.postMessage(
              JSON.stringify({ event: "command", func, args, id: capturedWidgetIdRef.current, channel: "widget" }),
              "*"
            );
            ifr.contentWindow.postMessage(
              JSON.stringify({ event: "command", func, args, id: ifr.id || "admin-audio-yt-host", channel: "widget" }),
              "*"
            );
          } catch {}
        }
      }
    }, []);

    // Autoplay Unlock mechanism (triggers on any user click / keydown)
    const unlockAudio = useCallback(() => {
      isUnlockedRef.current = true;
      setIsBlockedState(false);
      onAudioBlockedChange?.(false);

      if (isMutedRef.current || volumeRef.current === 0) {
        sendIframeCommand("mute");
        sendIframeCommand("setVolume", [0]);
      } else {
        sendIframeCommand("unMute");
        sendIframeCommand("setVolume", [volumeRef.current]);
      }
      if (!isPausedRef.current) {
        sendIframeCommand("playVideo");
      }

      const isTestEnv = typeof process !== "undefined" && process.env?.NODE_ENV === "test";
      if (!isTestEnv && html5AudioRef.current) {
        try {
          html5AudioRef.current.muted = isMutedRef.current;
          html5AudioRef.current.volume = volumeRef.current / 100;
          if (!isPausedRef.current) {
            html5AudioRef.current.play().catch(() => {});
          }
        } catch {
          // Non-blocking
        }
      }
    }, [onAudioBlockedChange]);

    // Listen for user gesture anywhere to unlock audio
    useEffect(() => {
      const onUserGesture = () => {
        if (!isUnlockedRef.current) {
          unlockAudio();
        }
      };

      if (typeof window !== "undefined") {
        window.addEventListener("click", onUserGesture, { once: true, passive: true });
        window.addEventListener("keydown", onUserGesture, { once: true, passive: true });
        window.addEventListener("touchstart", onUserGesture, { once: true, passive: true });
      }

      return () => {
        if (typeof window !== "undefined") {
          window.removeEventListener("click", onUserGesture);
          window.removeEventListener("keydown", onUserGesture);
          window.removeEventListener("touchstart", onUserGesture);
        }
      };
    }, [unlockAudio]);

    // Handle HTML5 Audio for uploaded tracks
    useEffect(() => {
      const isTestEnv = typeof process !== "undefined" && process.env?.NODE_ENV === "test";

      if (!currentTrack || currentTrack.source !== "upload") {
        if (!isTestEnv && html5AudioRef.current) {
          try {
            html5AudioRef.current.pause();
            html5AudioRef.current.src = "";
          } catch {}
        }
        return;
      }

      // Stop YouTube if running
      if (playerRef.current) {
        try {
          playerRef.current.pauseVideo();
        } catch {}
      }

      const audio = html5AudioRef.current;
      if (!audio) return;

      let fileUrl = "";
      if (currentTrack.storagePath) {
        const supabase = createBrowserSupabase();
        const { data } = supabase.storage.from("tracks").getPublicUrl(currentTrack.storagePath);
        fileUrl = data.publicUrl;
      } else if (currentTrack.youtubeVideoId?.startsWith("http")) {
        fileUrl = currentTrack.youtubeVideoId;
      }

      if (fileUrl) {
        audio.src = fileUrl;
        audio.volume = isMuted ? 0 : volume / 100;
        audio.muted = isMuted;
        if (!isPaused && !isTestEnv) {
          try {
            audio.play().catch((err: unknown) => {
              console.warn("Autoplay blocked for local audio:", err);
              setIsBlockedState(true);
              onAudioBlockedChange?.(true);
            });
          } catch {}
        }
      }

      const handleEnded = () => {
        onTrackEndedRef.current();
      };

      audio.addEventListener("ended", handleEnded);
      return () => {
        audio.removeEventListener("ended", handleEnded);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentTrack?.itemId, currentTrack?.source, currentTrack?.storagePath, onAudioBlockedChange]);

    // Handle YouTube audio initialization and track changes
    useEffect(() => {
      if (!currentTrack || currentTrack.source === "upload") return;
      if (typeof window === "undefined") return;

      const videoId = resolveVideoId(currentTrack);
      if (!videoId) return;

      let isMounted = true;

      // If YouTube player already initialized, load next video
      if (playerRef.current && ytInitializedRef.current) {
        if (currentVideoIdRef.current === videoId) {
          return;
        }
        currentVideoIdRef.current = videoId;
        try {
          playerRef.current.loadVideoById(videoId);
          playerRef.current.setVolume(0);
          if (isMutedRef.current) {
            playerRef.current.mute();
          } else {
            playerRef.current.unMute();
            const targetVol = volumeRef.current;
            const steps = 5;
            for (let s = 1; s <= steps; s++) {
              setTimeout(() => {
                if (!isMutedRef.current && playerRef.current) {
                  playerRef.current.setVolume(Math.round((targetVol / steps) * s));
                }
              }, s * 300);
            }
          }
          if (isPausedRef.current) {
            playerRef.current.pauseVideo();
          } else {
            playerRef.current.playVideo();
          }
        } catch (e) {
          console.warn("Error loading video in existing YT player:", e);
        }
        return;
      }

      // Initialize YouTube API and Player
      void loadYoutubeIframeApi().then(() => {
        if (!isMounted || !containerRef.current) return;
        if (playerRef.current) return;

        try {
          if (!window.YT || !window.YT.Player) {
            // Direct iframe fallback if API blocked
            const originParam =
              typeof window !== "undefined"
                ? `&origin=${encodeURIComponent(window.location.origin)}`
                : "";
            containerRef.current.innerHTML = `<iframe id="admin-audio-fallback-iframe" width="160" height="90" src="https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1&controls=0&playsinline=1${originParam}" allow="autoplay; encrypted-media" style="width:160px;height:90px;border:none;"></iframe>`;
            return;
          }

          const host = document.createElement("div");
          host.id = "admin-audio-yt-host";
          containerRef.current.appendChild(host);

          currentVideoIdRef.current = videoId;
          playerRef.current = new window.YT.Player(host, {
            width: "160",
            height: "90",
            videoId,
            playerVars: {
              autoplay: 1,
              controls: 0,
              disablekb: 1,
              enablejsapi: 1,
              fs: 0,
              modestbranding: 1,
              playsinline: 1,
              rel: 0,
              origin: typeof window !== "undefined" ? window.location.origin : undefined,
            },
            events: {
              onReady: (ev) => {
                ytInitializedRef.current = true;
                try {
                  ev.target.setVolume(isMutedRef.current ? 0 : volumeRef.current);
                  if (isMutedRef.current) {
                    ev.target.mute();
                  } else {
                    ev.target.unMute();
                  }
                  if (!isPausedRef.current) {
                    ev.target.playVideo();
                  }
                } catch {
                  setIsBlockedState(true);
                  onAudioBlockedChange?.(true);
                }
              },
              onStateChange: (event) => {
                // event.data === 0 is YT.PlayerState.ENDED
                if (event.data === 0) {
                  onTrackEndedRef.current();
                }
              },
              onError: (event) => {
                console.warn("YouTube audio playback error code:", event.data);
                if (event.data === 150 || event.data === 101 || event.data === 2) {
                  setTimeout(() => {
                    onTrackEndedRef.current();
                  }, 800);
                }
              },
            },
          });
        } catch (err) {
          console.warn("Exception creating YT.Player in admin audio engine:", err);
        }
      });

      return () => {
        isMounted = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentTrack?.itemId, currentTrack?.youtubeVideoId, currentTrack?.source, onAudioBlockedChange]);

    // Handle isPaused changes
    useEffect(() => {
      const isTestEnv = typeof process !== "undefined" && process.env?.NODE_ENV === "test";

      if (currentTrack?.source === "upload" && html5AudioRef.current) {
        if (!isTestEnv) {
          if (isPaused) {
            try {
              html5AudioRef.current.pause();
            } catch {}
          } else {
            try {
              html5AudioRef.current.play().catch(() => {
                setIsBlockedState(true);
                onAudioBlockedChange?.(true);
              });
            } catch {}
          }
        }
        return;
      }

      sendIframeCommand(isPaused ? "pauseVideo" : "playVideo");
    }, [isPaused, currentTrack?.source, onAudioBlockedChange]);

    // Handle volume & mute changes
    useEffect(() => {
      if (currentTrack?.source === "upload" && html5AudioRef.current) {
        html5AudioRef.current.volume = isMuted ? 0 : volume / 100;
        html5AudioRef.current.muted = isMuted;
        return;
      }

      if (isMuted || volume === 0) {
        sendIframeCommand("mute");
        sendIframeCommand("setVolume", [0]);
      } else {
        sendIframeCommand("unMute");
        sendIframeCommand("setVolume", [volume]);
      }
    }, [volume, isMuted, currentTrack?.source]);

    // Progress polling
    useEffect(() => {
      if (typeof window === "undefined") return;

      const timer = setInterval(() => {
        if (isPausedRef.current) return;

        let currentTime = -1;
        let duration = currentTrackRef.current?.durationSeconds ?? 210;

        if (currentTrackRef.current?.source === "upload" && html5AudioRef.current) {
          currentTime = Math.round((html5AudioRef.current.currentTime || 0) * 10) / 10;
          const d = Math.floor(html5AudioRef.current.duration || 0);
          if (d > 0) duration = d;
        } else if (playerRef.current && ytInitializedRef.current) {
          try {
            const t = playerRef.current.getCurrentTime() || 0;
            const d = Math.floor(playerRef.current.getDuration() || 0);
            if (t > 0) currentTime = Math.round(t * 10) / 10;
            if (d > 0) duration = d;
          } catch {
            // Ignore
          }
        }

        if (currentTime > 0) {
          lastReportedTimeRef.current = currentTime;
        } else {
          lastReportedTimeRef.current = Math.round((lastReportedTimeRef.current + 0.5) * 10) / 10;
          currentTime = lastReportedTimeRef.current;
        }

        // Gentle volume fade-out over last 2.5s before end
        if (duration > 0 && currentTime > 0) {
          const rem = duration - currentTime;
          if (rem <= 2.5 && rem > 0.2 && !isMutedRef.current && !isPausedRef.current) {
            const fadeVol = Math.max(0, Math.round(volumeRef.current * (rem / 2.5)));
            if (playerRef.current) playerRef.current.setVolume(fadeVol);
            if (html5AudioRef.current) html5AudioRef.current.volume = fadeVol / 100;
          }
        }

        onProgressRef.current?.(currentTime, duration > 0 ? duration : null);
      }, 500);

      return () => {
        clearInterval(timer);
      };
    }, []);

    // Expose imperative handle for seeking and unlocking
    useImperativeHandle(ref, () => ({
      seekTo: (seconds: number) => {
        lastReportedTimeRef.current = seconds;
        if (currentTrackRef.current?.source === "upload" && html5AudioRef.current) {
          html5AudioRef.current.currentTime = seconds;
        } else {
          sendIframeCommand("seekTo", [seconds, true]);
        }
      },
      unlockAudio,
      isUnlocked: isUnlockedRef.current,
    }));

    return (
      <div
        id="admin-cabina-audio-engine"
        aria-hidden="true"
        className="fixed bottom-2 right-2 w-[160px] h-[90px] opacity-0 pointer-events-none overflow-hidden z-0"
        tabIndex={-1}
      >
        {/* Container where YouTube iframe mounts inside viewport */}
        <div ref={containerRef} className="w-full h-full" />
        {/* HTML5 audio element for uploaded tracks */}
        <audio ref={html5AudioRef} preload="auto" className="hidden" />
      </div>
    );
  },
);
