"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import type { PlayerTrack } from "@/lib/api/player";
import {
  createIframeEngine,
  resolveVideoId,
  type IframePlaybackEngine,
} from "@/components/player/iframe-engine";
import {
  computeAdaptiveSeekLeadSec,
  computeElasticPlaybackRate,
  computeTargetPositionSec,
  type PlaybackAnchor,
} from "@/lib/sync/protocol";

export interface TvAudioEngineProps {
  track: PlayerTrack | null;
  /** True in TV_ONLY or BOTH; false in CABINA_ONLY (keeps TV audio muted/idle). */
  audioActive: boolean;
  /** True only when both Cabina and TV reproduce audio simultaneously (BOTH). */
  syncBothMode: boolean;
  /** True only for YouTube Karaoke tracks: promotes this single YouTube iframe to fullscreen. */
  videoVisible?: boolean;
  isPaused: boolean;
  volume: number; // 0 - 100
  anchor: PlaybackAnchor | null;
  estimatedServerMs: () => number;
  onBlockedChange?: (blocked: boolean) => void;
  onCued?: (videoId: string) => void;
  onEnded?: () => void;
  onVideoError?: (reason: string) => void;
}

export interface TvAudioEngineRef {
  cue: (track: PlayerTrack, startSec?: number) => Promise<void>;
  playAt: (startSec?: number) => void;
  seekTo: (seconds: number) => void;
  unlockAudio: () => void;
}

/**
 * Resolves the playable audio URL for uploaded MP3 tracks.
 * Routes private Supabase Storage (`track-audio`) paths through `/api/audio?path=...`
 * which verifies the track and redirects to a signed Storage URL so unauthenticated
 * Web TVs and Cabina can stream with native HTTP Range support.
 */
export function resolveUploadAudioUrl(
  track: Pick<PlayerTrack, "storagePath" | "youtubeVideoId"> | null | undefined,
): string {
  if (!track) return "";
  const sp = track.storagePath?.trim() || "";
  if (sp) {
    if (/^https?:\/\//i.test(sp) || sp.startsWith("/api/audio")) {
      return sp;
    }
    return `/api/audio?path=${encodeURIComponent(sp)}`;
  }
  const yt = track.youtubeVideoId?.trim() || "";
  if (yt && /^https?:\/\//i.test(yt)) {
    return yt;
  }
  return "";
}

export const TvAudioEngine = forwardRef<TvAudioEngineRef, TvAudioEngineProps>(
  function TvAudioEngine(
    {
      track,
      audioActive,
      syncBothMode,
      videoVisible = false,
      isPaused,
      volume,
      anchor,
      estimatedServerMs,
      onBlockedChange,
      onCued,
      onEnded,
      onVideoError,
    },
    ref,
  ) {
    const html5AudioRef = useRef<HTMLAudioElement | null>(null);
    const ytIframeRef = useRef<HTMLIFrameElement | null>(null);

    const trackRef = useRef<PlayerTrack | null>(track);
    trackRef.current = track;
    const audioActiveRef = useRef(audioActive);
    audioActiveRef.current = audioActive;
    const syncBothModeRef = useRef(syncBothMode);
    syncBothModeRef.current = syncBothMode;
    const videoVisibleRef = useRef(videoVisible);
    videoVisibleRef.current = videoVisible;
    const isPausedRef = useRef(isPaused);
    isPausedRef.current = isPaused;
    const volumeRef = useRef(volume);
    volumeRef.current = volume;
    const anchorRef = useRef<PlaybackAnchor | null>(anchor);
    anchorRef.current = anchor;
    const estimatedServerMsRef = useRef(estimatedServerMs);
    estimatedServerMsRef.current = estimatedServerMs;
    const onBlockedChangeRef = useRef(onBlockedChange);
    onBlockedChangeRef.current = onBlockedChange;
    const onCuedRef = useRef(onCued);
    onCuedRef.current = onCued;
    const onEndedRef = useRef(onEnded);
    onEndedRef.current = onEnded;
    const onVideoErrorRef = useRef(onVideoError);
    onVideoErrorRef.current = onVideoError;

    const lastSeekAtRef = useRef(0);
    const adaptiveSeekLeadRef = useRef(0.16);
    const pendingVerifyRef = useRef<{
      seekAtMs: number;
      verifyAtMs: number;
      baselineLeadSec: number;
    } | null>(null);
    const loadedUploadSrcRef = useRef("");
    const pendingCueRef = useRef<{ track: PlayerTrack; startSec: number } | null>(null);
    const ytAutoplayCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastVideoFallbackAtRef = useRef(0);

    const ytEngine: IframePlaybackEngine = useMemo(
      () =>
        createIframeEngine(
          () => ytIframeRef.current,
          (playing) => {
            if (playing && audioActiveRef.current) {
              if (ytAutoplayCheckTimerRef.current) {
                clearTimeout(ytAutoplayCheckTimerRef.current);
                ytAutoplayCheckTimerRef.current = null;
              }
              onBlockedChangeRef.current?.(false);
            }
          },
        ),
      [],
    );

    const scheduleYtAutoplayCheck = useCallback(() => {
      if (ytAutoplayCheckTimerRef.current) {
        clearTimeout(ytAutoplayCheckTimerRef.current);
      }
      ytAutoplayCheckTimerRef.current = setTimeout(() => {
        ytAutoplayCheckTimerRef.current = null;
        if (!audioActiveRef.current || isPausedRef.current) return;
        const activeTrack = trackRef.current;
        if (!activeTrack || activeTrack.source === "upload") return;
        const state = ytEngine.getPlayerState?.();
        // YT_PLAYING = 1, YT_BUFFERING = 3. If still not playing/buffering after 1.8s, browser blocked autoplay.
        if (state !== 1 && state !== 3) {
          onBlockedChangeRef.current?.(true);
        }
      }, 1800);
    }, [ytEngine]);

    const trackKey = track
      ? `${track.source}:${track.storagePath?.trim() || track.youtubeVideoId?.trim() || track.trackId}`
      : "";
    const isUploadTrack = Boolean(track && track.source === "upload");
    const shouldMountYoutube = Boolean((audioActive || videoVisible) && track && !isUploadTrack);
    const initialYtSrc = useMemo(() => {
      if (!shouldMountYoutube || !trackRef.current) return "";
      const vid = resolveVideoId(trackRef.current);
      const startSec = anchorRef.current
        ? Math.floor(computeTargetPositionSec(anchorRef.current, estimatedServerMsRef.current()))
        : 0;
      return ytEngine.buildEmbedUrl(vid, startSec, !isPausedRef.current, !audioActiveRef.current);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shouldMountYoutube]);

    // Attach YouTube postMessage bridge & reset cleanly on unmount
    useEffect(() => {
      if (!shouldMountYoutube) {
        ytEngine.reset();
        if (ytAutoplayCheckTimerRef.current) {
          clearTimeout(ytAutoplayCheckTimerRef.current);
          ytAutoplayCheckTimerRef.current = null;
        }
        return;
      }
      const detach = ytEngine.attach();
      const unsubCued = ytEngine.onCued((vid) => {
        onCuedRef.current?.(vid);
      });
      const unsubEnded = ytEngine.onEnded(() => {
        if (Date.now() - lastVideoFallbackAtRef.current < 2500) {
          return;
        }
        if (audioActiveRef.current) {
          onEndedRef.current?.();
        }
      });
      const unsubError = ytEngine.onError((reason) => {
        if (videoVisibleRef.current) {
          lastVideoFallbackAtRef.current = Date.now();
          onVideoErrorRef.current?.(reason);
        }
      });
      const handshakeTimer = setInterval(() => ytEngine.handshake(), 2000);
      return () => {
        clearInterval(handshakeTimer);
        if (ytAutoplayCheckTimerRef.current) {
          clearTimeout(ytAutoplayCheckTimerRef.current);
          ytAutoplayCheckTimerRef.current = null;
        }
        unsubError();
        unsubEnded();
        unsubCued();
        detach();
        ytEngine.reset();
      };
    }, [shouldMountYoutube, ytEngine]);

    const tryPlayHtml5 = useCallback((audio: HTMLAudioElement) => {
      audio.muted = false;
      audio.volume = Math.max(0, Math.min(1, volumeRef.current / 100));
      try {
        const result = audio.play();
        if (result && typeof result.then === "function") {
          void result.then(
            () => onBlockedChangeRef.current?.(false),
            () => onBlockedChangeRef.current?.(true),
          );
        } else {
          onBlockedChangeRef.current?.(false);
        }
      } catch {
        onBlockedChangeRef.current?.(true);
      }
    }, []);

    // Dedicated lightweight volume & mute effect — switches CABINA_ONLY ↔ TV_ONLY ↔ BOTH without reloading
    useEffect(() => {
      const audio = html5AudioRef.current;
      if (audio && audioActive) {
        audio.volume = Math.max(0, Math.min(1, volume / 100));
      }
      if (!shouldMountYoutube) return;
      if (audioActive) {
        ytEngine.unMute?.();
        ytEngine.setVolume?.(volume);
        if (!isPausedRef.current) {
          scheduleYtAutoplayCheck();
        }
      } else {
        ytEngine.mute?.();
        onBlockedChangeRef.current?.(false);
      }
    }, [audioActive, shouldMountYoutube, volume, ytEngine, scheduleYtAutoplayCheck]);

    // Handle HTML5 <audio> track lifecycle and CABINA_ONLY shutdown
    useEffect(() => {
      const audio = html5AudioRef.current;
      const activeTrack = trackRef.current;
      if (!audio) return;

      if (!audioActive || !activeTrack || activeTrack.source !== "upload") {
        loadedUploadSrcRef.current = "";
        audio.muted = true;
        audio.playbackRate = 1;
        try {
          audio.pause();
        } catch {
          // ignore
        }
        if (!audioActive) {
          pendingCueRef.current = null;
          ytEngine.setPlaybackRate?.(1);
          ytEngine.mute?.();
          if (!videoVisibleRef.current) {
            ytEngine.pause?.();
          }
          onBlockedChangeRef.current?.(false);
        }
        return;
      }

      // Stop YouTube if switching to uploaded MP3
      ytEngine.setPlaybackRate?.(1);
      ytEngine.pause?.();
      ytEngine.mute?.();

      const fileUrl = resolveUploadAudioUrl(activeTrack);
      if (!fileUrl) return;

      if (loadedUploadSrcRef.current !== fileUrl) {
        loadedUploadSrcRef.current = fileUrl;
        audio.src = fileUrl;
        audio.playbackRate = 1;
        const startSec = anchorRef.current
          ? computeTargetPositionSec(anchorRef.current, estimatedServerMsRef.current())
          : 0;
        if (startSec > 0.25) {
          try {
            audio.currentTime = startSec;
          } catch {
            // ignore before metadata
          }
        }
      }

      audio.muted = false;
      audio.volume = Math.max(0, Math.min(1, volumeRef.current / 100));
      if (isPaused) {
        try {
          audio.pause();
        } catch {
          // ignore
        }
      } else {
        tryPlayHtml5(audio);
      }

      const handleEnded = () => {
        if (audioActiveRef.current) {
          onEndedRef.current?.();
        }
      };
      audio.addEventListener("ended", handleEnded);
      return () => {
        audio.removeEventListener("ended", handleEnded);
      };
    }, [audioActive, trackKey, isPaused, tryPlayHtml5, ytEngine]);

    // Handle YouTube track changes (hidden audio or promoted fullscreen karaoke video)
    useEffect(() => {
      const activeTrack = trackRef.current;
      if (!shouldMountYoutube || !activeTrack) return;

      if (pendingCueRef.current) {
        const queued = pendingCueRef.current;
        pendingCueRef.current = null;
        void ytEngine.cue(queued.track, queued.startSec);
        return;
      }

      if (audioActiveRef.current) {
        ytEngine.unMute?.();
        ytEngine.setVolume?.(volumeRef.current);
      } else {
        ytEngine.mute?.();
      }
      void ytEngine.load(activeTrack).then(() => {
        if (!audioActiveRef.current && !videoVisibleRef.current) {
          ytEngine.pause?.();
          ytEngine.mute?.();
          return;
        }
        const targetSec = anchorRef.current
          ? computeTargetPositionSec(anchorRef.current, estimatedServerMsRef.current())
          : 0;
        if (targetSec > 0.25) {
          lastSeekAtRef.current = Date.now();
          ytEngine.seekTo?.(targetSec);
        }
        if (isPausedRef.current) {
          ytEngine.pause?.();
        } else if (audioActiveRef.current) {
          ytEngine.unMute?.();
          ytEngine.setVolume?.(volumeRef.current);
          void ytEngine.play?.();
          scheduleYtAutoplayCheck();
        } else {
          // CABINA_ONLY + fullscreen Karaoke video: muted visual sync with zero audio echo
          ytEngine.mute?.();
          void ytEngine.play?.();
        }
      });
    }, [shouldMountYoutube, trackKey, ytEngine, scheduleYtAutoplayCheck]);

    // Auto-unlock TV audio on first user gesture anywhere on screen (browser autoplay policy)
    useEffect(() => {
      if (!audioActive || typeof window === "undefined") return;
      const unlockOnGesture = () => {
        if (!audioActiveRef.current || isPausedRef.current) return;
        const activeTrack = trackRef.current;
        if (!activeTrack) return;
        if (activeTrack.source === "upload") {
          const audio = html5AudioRef.current;
          if (audio && audio.paused) {
            tryPlayHtml5(audio);
          }
          return;
        }
        const state = ytEngine.getPlayerState?.();
        if (state !== 1) {
          ytEngine.unMute?.();
          ytEngine.setVolume?.(volumeRef.current);
          void ytEngine.play?.();
          onBlockedChangeRef.current?.(false);
        }
      };
      window.addEventListener("pointerdown", unlockOnGesture, { passive: true });
      window.addEventListener("keydown", unlockOnGesture, { passive: true });
      return () => {
        window.removeEventListener("pointerdown", unlockOnGesture);
        window.removeEventListener("keydown", unlockOnGesture);
      };
    }, [audioActive, tryPlayHtml5, ytEngine]);

    // Handle YouTube play/pause changes cleanly without re-loading
    useEffect(() => {
      if (!shouldMountYoutube) return;
      if (isPaused) {
        if (ytAutoplayCheckTimerRef.current) {
          clearTimeout(ytAutoplayCheckTimerRef.current);
          ytAutoplayCheckTimerRef.current = null;
        }
        ytEngine.setPlaybackRate?.(1);
        ytEngine.pause?.();
      } else if (audioActiveRef.current) {
        ytEngine.unMute?.();
        ytEngine.setVolume?.(volumeRef.current);
        void ytEngine.play?.();
        scheduleYtAutoplayCheck();
      } else {
        ytEngine.mute?.();
        void ytEngine.play?.();
      }
    }, [shouldMountYoutube, isPaused, ytEngine, scheduleYtAutoplayCheck]);

    // Continuous clock-driven drift guard (elastic for HTML5 <audio>, buffering-aware for YT audio or muted karaoke video)
    useEffect(() => {
      if (!audioActive && !videoVisible) return;

      const timer = setInterval(() => {
        const activeAnchor = anchorRef.current;
        const activeTrack = trackRef.current;
        if (!activeAnchor || !activeTrack || activeAnchor.isPaused || isPausedRef.current) {
          pendingVerifyRef.current = null;
          if (html5AudioRef.current) html5AudioRef.current.playbackRate = 1;
          ytEngine.setPlaybackRate?.(1);
          return;
        }

        const now = Date.now();
        const expected = computeTargetPositionSec(activeAnchor, estimatedServerMsRef.current());
        const isEarlyWindow = expected < 10;

        if (activeTrack.source === "upload") {
          const audio = html5AudioRef.current;
          if (!audio || audio.readyState < 3 || audio.seeking) return;

          const actual = audio.currentTime;
          const driftSec = actual - expected;

          if (!syncBothModeRef.current) {
            // TV_ONLY: keep natural 1.0x playback unless major seek jump (>2s)
            audio.playbackRate = 1;
            if (Math.abs(driftSec) > 2.0 && now - lastSeekAtRef.current > 2000) {
              lastSeekAtRef.current = now;
              audio.currentTime = expected;
            }
            return;
          }

          // BOTH mode: smooth imperceptible continuous elastic rate (0.95..1.05)
          const decision = computeElasticPlaybackRate(driftSec, null, {
            isEarlyWindow,
            isMuted: false,
          });
          if (decision.action === "rate") {
            if (Math.abs(audio.playbackRate - decision.playbackRate) >= 0.002) {
              audio.playbackRate = decision.playbackRate;
            }
            return;
          }
          audio.playbackRate = 1;
          const cooldownMs = isEarlyWindow ? 900 : 1800;
          if (decision.action === "seek" && now - lastSeekAtRef.current > cooldownMs) {
            lastSeekAtRef.current = now;
            audio.currentTime = expected;
          }
          return;
        }

        // Hidden YouTube audio branch
        if (ytEngine.isBuffering?.()) {
          pendingVerifyRef.current = null;
          ytEngine.setPlaybackRate?.(1);
          return;
        }
        if (!ytEngine.hasLiveTime?.()) return;

        const actual = ytEngine.getCurrentTime?.() ?? expected;
        if (pendingVerifyRef.current) {
          if (lastSeekAtRef.current > pendingVerifyRef.current.seekAtMs + 25) {
            pendingVerifyRef.current = null;
          } else if (now >= pendingVerifyRef.current.verifyAtMs) {
            const postDrift = expected - actual;
            adaptiveSeekLeadRef.current = computeAdaptiveSeekLeadSec(
              pendingVerifyRef.current.baselineLeadSec,
              postDrift,
            );
            pendingVerifyRef.current = null;
          }
        }

        const driftSec = actual - expected;
        const isMutedKaraokeVideo = !audioActiveRef.current && videoVisibleRef.current;

        if (!syncBothModeRef.current && !isMutedKaraokeVideo) {
          ytEngine.setPlaybackRate?.(1);
          if (Math.abs(driftSec) > 2.0 && now - lastSeekAtRef.current > 2200) {
            lastSeekAtRef.current = now;
            ytEngine.seekTo?.(expected);
          }
          return;
        }

        const decision = computeElasticPlaybackRate(
          driftSec,
          ytEngine.getAvailablePlaybackRates?.(),
          {
            isEarlyWindow,
            isMuted: isMutedKaraokeVideo,
          },
        );
        if (decision.action === "rate") {
          ytEngine.setPlaybackRate?.(decision.playbackRate);
          return;
        }

        ytEngine.setPlaybackRate?.(1);
        const cooldownMs = isMutedKaraokeVideo ? 1200 : isEarlyWindow ? 950 : 1800;
        const shouldSeek = isMutedKaraokeVideo
          ? Math.abs(driftSec) > 0.35 && now - lastSeekAtRef.current > cooldownMs
          : decision.action === "seek" && now - lastSeekAtRef.current > cooldownMs;
        if (shouldSeek) {
          lastSeekAtRef.current = now;
          const lead = expected > 0.25 ? adaptiveSeekLeadRef.current : 0;
          ytEngine.seekTo?.(expected + lead);
          pendingVerifyRef.current =
            expected > 0.25
              ? { seekAtMs: now, verifyAtMs: now + 780, baselineLeadSec: adaptiveSeekLeadRef.current }
              : null;
        }
      }, 250);

      return () => clearInterval(timer);
    }, [audioActive, videoVisible, ytEngine]);

    useImperativeHandle(
      ref,
      () => ({
        cue: async (nextTrack: PlayerTrack, startSec = 0) => {
          if (!audioActiveRef.current) {
            onCuedRef.current?.(
              nextTrack.source === "upload" ? nextTrack.trackId : resolveVideoId(nextTrack),
            );
            return;
          }
          if (nextTrack.source === "upload") {
            const audio = html5AudioRef.current;
            const url = resolveUploadAudioUrl(nextTrack);
            if (audio && url) {
              loadedUploadSrcRef.current = url;
              audio.src = url;
              audio.muted = true;
              audio.playbackRate = 1;
              try {
                audio.pause();
                if (startSec > 0) audio.currentTime = startSec;
              } catch {
                // ignore before loadedmetadata
              }
            }
            onCuedRef.current?.(nextTrack.trackId);
            return;
          }
          ytEngine.setPlaybackRate?.(1);
          if (!ytIframeRef.current) {
            pendingCueRef.current = { track: nextTrack, startSec };
            return;
          }
          await ytEngine.cue(nextTrack, startSec);
        },
        playAt: (startSec = 0) => {
          if (!audioActiveRef.current) return;
          const activeTrack = trackRef.current;
          lastSeekAtRef.current = Date.now();
          if (activeTrack?.source === "upload") {
            const audio = html5AudioRef.current;
            if (!audio) return;
            audio.playbackRate = 1;
            if (startSec > 0.05) {
              try {
                audio.currentTime = startSec;
              } catch {
                // ignore
              }
            }
            tryPlayHtml5(audio);
            return;
          }
          ytEngine.setPlaybackRate?.(1);
          if (startSec > 0.05) {
            ytEngine.seekTo?.(startSec);
          }
          ytEngine.unMute?.();
          ytEngine.setVolume?.(volumeRef.current);
          void ytEngine.play?.();
          scheduleYtAutoplayCheck();
        },
        seekTo: (seconds: number) => {
          if (!audioActiveRef.current && !videoVisibleRef.current) return;
          const target = Math.max(0, seconds);
          lastSeekAtRef.current = Date.now();
          const activeTrack = trackRef.current;
          if (activeTrack?.source === "upload") {
            if (!audioActiveRef.current) return;
            const audio = html5AudioRef.current;
            if (audio) {
              audio.playbackRate = 1;
              try {
                audio.currentTime = target;
              } catch {
                // ignore
              }
            }
            return;
          }
          ytEngine.setPlaybackRate?.(1);
          ytEngine.seekTo?.(target);
        },
        unlockAudio: () => {
          if (!audioActiveRef.current) return;
          const activeTrack = trackRef.current;
          if (activeTrack?.source === "upload") {
            const audio = html5AudioRef.current;
            if (audio) tryPlayHtml5(audio);
            return;
          }
          ytEngine.unMute?.();
          ytEngine.setVolume?.(volumeRef.current);
          void ytEngine.play?.();
          onBlockedChangeRef.current?.(false);
        },
      }),
      [tryPlayHtml5, ytEngine, scheduleYtAutoplayCheck],
    );

    return (
      <div
        id="poneleplay-tv-audio-engine"
        aria-hidden={!videoVisible}
        className={
          videoVisible
            ? "fixed inset-0 z-30 bg-black pointer-events-none overflow-hidden"
            : "fixed bottom-0 right-0 w-[200px] h-[112px] opacity-[0.01] pointer-events-none overflow-hidden -z-10"
        }
      >
        <audio ref={html5AudioRef} preload="auto" className="hidden" />
        {shouldMountYoutube && (
          <iframe
            id="poneleplay-tv-audio-iframe"
            ref={ytIframeRef}
            src={initialYtSrc}
            title={videoVisible ? "PonelePlay TV Karaoke Video" : "PonelePlay TV Audio Engine"}
            className="w-full h-full border-0"
            allow="autoplay; encrypted-media"
            onLoad={() => {
              ytEngine.handshake();
              if (!audioActiveRef.current && !videoVisibleRef.current) {
                ytEngine.pause?.();
                ytEngine.mute?.();
                return;
              }
              if (pendingCueRef.current) {
                const queued = pendingCueRef.current;
                pendingCueRef.current = null;
                void ytEngine.cue(queued.track, queued.startSec);
                return;
              }
              if (audioActiveRef.current) {
                ytEngine.unMute?.();
                ytEngine.setVolume?.(volumeRef.current);
                if (!isPausedRef.current) {
                  void ytEngine.play?.();
                  scheduleYtAutoplayCheck();
                }
              } else {
                ytEngine.mute?.();
                if (!isPausedRef.current) {
                  void ytEngine.play?.();
                }
              }
            }}
          />
        )}
      </div>
    );
  },
);
