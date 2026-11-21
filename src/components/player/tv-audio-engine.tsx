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
import { createBrowserSupabase } from "@/lib/api/supabase/browser";
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
  /** True in TV_ONLY or BOTH; false in CABINA_ONLY (keeps TV audio completely idle). */
  audioActive: boolean;
  /** True only when both Cabina and TV reproduce audio simultaneously (BOTH). */
  syncBothMode: boolean;
  isPaused: boolean;
  volume: number; // 0 - 100
  anchor: PlaybackAnchor | null;
  estimatedServerMs: () => number;
  onBlockedChange?: (blocked: boolean) => void;
  onCued?: (videoId: string) => void;
  onEnded?: () => void;
}

export interface TvAudioEngineRef {
  cue: (track: PlayerTrack, startSec?: number) => Promise<void>;
  playAt: (startSec?: number) => void;
  seekTo: (seconds: number) => void;
  unlockAudio: () => void;
}

export function resolveUploadAudioUrl(
  track: Pick<PlayerTrack, "storagePath" | "youtubeVideoId"> | null | undefined,
): string {
  if (!track) return "";
  if (track.storagePath && track.storagePath.trim()) {
    const supabase = createBrowserSupabase();
    const { data } = supabase.storage.from("tracks").getPublicUrl(track.storagePath.trim());
    return data.publicUrl || "";
  }
  if (track.youtubeVideoId && /^https?:\/\//i.test(track.youtubeVideoId.trim())) {
    return track.youtubeVideoId.trim();
  }
  return "";
}

export const TvAudioEngine = forwardRef<TvAudioEngineRef, TvAudioEngineProps>(
  function TvAudioEngine(
    {
      track,
      audioActive,
      syncBothMode,
      isPaused,
      volume,
      anchor,
      estimatedServerMs,
      onBlockedChange,
      onCued,
      onEnded,
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

    const lastSeekAtRef = useRef(0);
    const adaptiveSeekLeadRef = useRef(0.16);
    const pendingVerifyRef = useRef<{
      seekAtMs: number;
      verifyAtMs: number;
      baselineLeadSec: number;
    } | null>(null);
    const loadedUploadSrcRef = useRef("");

    const ytEngine: IframePlaybackEngine = useMemo(
      () => createIframeEngine(() => ytIframeRef.current),
      [],
    );

    const isUploadTrack = Boolean(track && track.source === "upload");
    const shouldMountYoutube = Boolean(audioActive && track && !isUploadTrack);
    const initialYtSrc = useMemo(() => {
      if (!shouldMountYoutube || !track) return "";
      const vid = resolveVideoId(track);
      const startSec = anchorRef.current
        ? Math.floor(computeTargetPositionSec(anchorRef.current, estimatedServerMsRef.current()))
        : 0;
      return ytEngine.buildEmbedUrl(vid, startSec, !isPausedRef.current);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shouldMountYoutube]);

    // Attach YouTube postMessage bridge & subscriptions while mounted
    useEffect(() => {
      if (!shouldMountYoutube) return;
      const detach = ytEngine.attach();
      const unsubCued = ytEngine.onCued((vid) => {
        onCuedRef.current?.(vid);
      });
      const unsubEnded = ytEngine.onEnded(() => {
        if (audioActiveRef.current) {
          onEndedRef.current?.();
        }
      });
      const handshakeTimer = setInterval(() => ytEngine.handshake(), 2000);
      return () => {
        clearInterval(handshakeTimer);
        unsubEnded();
        unsubCued();
        detach();
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

    // Handle HTML5 <audio> track lifecycle and CABINA_ONLY shutdown
    useEffect(() => {
      const audio = html5AudioRef.current;
      if (!audio) return;

      if (!audioActive || !track || track.source !== "upload") {
        audio.muted = true;
        audio.playbackRate = 1;
        try {
          audio.pause();
        } catch {
          // ignore
        }
        if (!audioActive) {
          ytEngine.setPlaybackRate?.(1);
          ytEngine.pause?.();
          ytEngine.mute?.();
          onBlockedChangeRef.current?.(false);
        }
        return;
      }

      // Stop YouTube if switching to uploaded MP3
      ytEngine.setPlaybackRate?.(1);
      ytEngine.pause?.();
      ytEngine.mute?.();

      const fileUrl = resolveUploadAudioUrl(track);
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
      audio.volume = Math.max(0, Math.min(1, volume / 100));
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
    }, [audioActive, track, isPaused, volume, tryPlayHtml5, ytEngine]);

    // Handle hidden YouTube track changes, play/pause, and volume when audioActive
    useEffect(() => {
      if (!shouldMountYoutube || !track) return;

      ytEngine.unMute?.();
      ytEngine.setVolume?.(volume);
      void ytEngine.load(track).then(() => {
        if (!audioActiveRef.current) {
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
        } else {
          ytEngine.unMute?.();
          ytEngine.setVolume?.(volumeRef.current);
          void ytEngine.play?.();
        }
      });
    }, [shouldMountYoutube, track, volume, ytEngine]);

    useEffect(() => {
      if (!shouldMountYoutube) return;
      if (isPaused) {
        ytEngine.setPlaybackRate?.(1);
        ytEngine.pause?.();
      } else {
        ytEngine.unMute?.();
        ytEngine.setVolume?.(volume);
        void ytEngine.play?.();
      }
    }, [shouldMountYoutube, isPaused, volume, ytEngine]);

    // Continuous clock-driven drift guard (elastic continuous for HTML5 <audio>, buffering-aware for YT)
    useEffect(() => {
      if (!audioActive) return;

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
        if (!syncBothModeRef.current) {
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
            isMuted: false,
          },
        );
        if (decision.action === "rate") {
          ytEngine.setPlaybackRate?.(decision.playbackRate);
          return;
        }

        ytEngine.setPlaybackRate?.(1);
        const cooldownMs = isEarlyWindow ? 950 : 1800;
        if (decision.action === "seek" && now - lastSeekAtRef.current > cooldownMs) {
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
    }, [audioActive, ytEngine]);

    useImperativeHandle(
      ref,
      () => ({
        cue: async (nextTrack: PlayerTrack, startSec = 0) => {
          if (!audioActiveRef.current) {
            onCuedRef.current?.(resolveVideoId(nextTrack));
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
        },
        seekTo: (seconds: number) => {
          if (!audioActiveRef.current) return;
          const target = Math.max(0, seconds);
          lastSeekAtRef.current = Date.now();
          const activeTrack = trackRef.current;
          if (activeTrack?.source === "upload") {
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
      [tryPlayHtml5, ytEngine],
    );

    return (
      <div
        id="poneleplay-tv-audio-engine"
        aria-hidden="true"
        className="fixed -left-[9999px] -top-[9999px] w-[200px] h-[112px] opacity-0 pointer-events-none overflow-hidden -z-50"
      >
        <audio ref={html5AudioRef} preload="auto" className="hidden" />
        {shouldMountYoutube && (
          <iframe
            id="poneleplay-tv-audio-iframe"
            ref={ytIframeRef}
            src={initialYtSrc}
            title="PonelePlay TV Audio Engine"
            className="w-full h-full border-0"
            allow="autoplay; encrypted-media"
            onLoad={() => {
              ytEngine.handshake();
              if (!audioActiveRef.current) {
                ytEngine.pause?.();
                ytEngine.mute?.();
              } else {
                ytEngine.unMute?.();
                ytEngine.setVolume?.(volumeRef.current);
              }
            }}
          />
        )}
      </div>
    );
  },
);
