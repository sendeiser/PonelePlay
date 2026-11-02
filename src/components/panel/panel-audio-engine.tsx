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
import type { RealtimeChannel } from "@supabase/supabase-js";

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
      slug,
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

    // Realtime channel for broadcasting playback progress to TV
    const channelRef = useRef<RealtimeChannel | null>(null);

    useEffect(() => {
      const supabase = createBrowserSupabase();
      const existing = supabase.getChannels().find(
        (c) =>
          c.topic === `realtime:playback-control:${slug}` ||
          c.topic === `playback-control:${slug}`,
      );

      const ch = existing ?? supabase.channel(`playback-control:${slug}`);
      if (ch.state !== "joined" && ch.state !== "joining") {
        ch.subscribe();
      }
      channelRef.current = ch;
    }, [slug]);

    // Autoplay Unlock mechanism (triggers on any user click / keydown)
    const unlockAudio = useCallback(() => {
      isUnlockedRef.current = true;
      setIsBlockedState(false);
      onAudioBlockedChange?.(false);

      if (playerRef.current) {
        try {
          playerRef.current.unMute();
          playerRef.current.setVolume(volumeRef.current);
          if (!isPausedRef.current) {
            playerRef.current.playVideo();
          }
        } catch {
          // Non-blocking
        }
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
        try {
          playerRef.current.loadVideoById(videoId);
          playerRef.current.setVolume(isMutedRef.current ? 0 : volumeRef.current);
          if (isMutedRef.current) {
            playerRef.current.mute();
          } else {
            playerRef.current.unMute();
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

      // Initialize YouTube API and Player for the first time
      void loadYoutubeIframeApi().then(() => {
        if (!isMounted || !containerRef.current) return;
        if (playerRef.current) return;

        try {
          if (!window.YT || !window.YT.Player) {
            // Adblocker or offline fallback: inject hidden iframe with postMessage
            const originParam =
              typeof window !== "undefined"
                ? `&origin=${encodeURIComponent(window.location.origin)}`
                : "";
            containerRef.current.innerHTML = `<iframe id="admin-audio-fallback-iframe" width="320" height="180" src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&enablejsapi=1&controls=0&playsinline=1${originParam}" allow="autoplay; encrypted-media" style="width:320px;height:180px;border:none;"></iframe>`;
            return;
          }

          // Create an unmanaged child node for YT.Player so React DOM diffing isn't broken
          const host = document.createElement("div");
          host.id = "admin-audio-yt-host";
          containerRef.current.appendChild(host);

          playerRef.current = new window.YT.Player(host, {
            host: "https://www.youtube-nocookie.com",
            width: "320",
            height: "180",
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
                  // Autoplay blocked by browser
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
                // 101/150: embedding restricted by owner; 2: invalid ID
                if (event.data === 150 || event.data === 101 || event.data === 2) {
                  setTimeout(() => {
                    onTrackEndedRef.current();
                  }, 1500);
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

      if (playerRef.current) {
        try {
          if (isPaused) {
            playerRef.current.pauseVideo();
          } else {
            playerRef.current.playVideo();
          }
        } catch {
          // Ignore
        }
      }
    }, [isPaused, currentTrack?.source, onAudioBlockedChange]);

    // Handle volume & mute changes
    useEffect(() => {
      if (currentTrack?.source === "upload" && html5AudioRef.current) {
        html5AudioRef.current.volume = isMuted ? 0 : volume / 100;
        html5AudioRef.current.muted = isMuted;
        return;
      }

      if (playerRef.current) {
        try {
          if (isMuted) {
            playerRef.current.mute();
          } else {
            playerRef.current.unMute();
            playerRef.current.setVolume(volume);
          }
        } catch {
          // Ignore
        }
      }
    }, [volume, isMuted, currentTrack?.source]);

    // Progress polling & Realtime telemetry broadcast to TV
    useEffect(() => {
      if (typeof window === "undefined") return;

      const timer = setInterval(() => {
        if (isPausedRef.current) return;

        let currentTime = 0;
        let duration = 0;

        if (currentTrackRef.current?.source === "upload" && html5AudioRef.current) {
          currentTime = Math.floor(html5AudioRef.current.currentTime || 0);
          duration = Math.floor(html5AudioRef.current.duration || 0);
        } else if (playerRef.current && ytInitializedRef.current) {
          try {
            currentTime = Math.floor(playerRef.current.getCurrentTime() || 0);
            duration = Math.floor(playerRef.current.getDuration() || 0);
          } catch {
            // Ignore
          }
        }

        if (currentTime >= 0) {
          onProgressRef.current?.(currentTime, duration > 0 ? duration : null);

          // Broadcast to TV screen via Supabase Realtime so TV visual display stays in sync
          if (channelRef.current && typeof channelRef.current.send === "function" && currentTrackRef.current) {
            void channelRef.current.send({
              type: "broadcast",
              event: "tv_playback_progress",
              payload: {
                currentTime,
                duration,
                isPaused: isPausedRef.current,
                trackId: currentTrackRef.current.trackId,
                track: currentTrackRef.current,
                isFromAdminAudio: true,
              },
            });
          }
        }
      }, 1000);

      return () => {
        clearInterval(timer);
      };
    }, []);

    // Expose imperative handle for seeking and unlocking
    useImperativeHandle(ref, () => ({
      seekTo: (seconds: number) => {
        if (currentTrackRef.current?.source === "upload" && html5AudioRef.current) {
          html5AudioRef.current.currentTime = seconds;
        } else if (playerRef.current) {
          try {
            playerRef.current.seekTo(seconds, true);
          } catch {
            // Fallback postMessage
            const directIframe = document.getElementById(
              "admin-audio-fallback-iframe",
            ) as HTMLIFrameElement | null;
            if (directIframe?.contentWindow) {
              directIframe.contentWindow.postMessage(
                JSON.stringify({ event: "command", func: "seekTo", args: [seconds, true] }),
                "*",
              );
            }
          }
        }
      },
      unlockAudio,
      isUnlocked: isUnlockedRef.current,
    }));

    return (
      <div
        id="admin-cabina-audio-engine"
        aria-hidden="true"
        className="fixed -top-[9999px] -left-[9999px] w-[320px] h-[180px] opacity-[0.001] pointer-events-none overflow-hidden z-[-999]"
        tabIndex={-1}
      >
        {/* Unmanaged container where YouTube iframe mounts */}
        <div ref={containerRef} className="w-full h-full" />
        {/* HTML5 audio element for uploaded tracks */}
        <audio ref={html5AudioRef} preload="auto" className="hidden" />
      </div>
    );
  },
);

