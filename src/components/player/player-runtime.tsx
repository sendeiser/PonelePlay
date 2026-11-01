"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { PlaybackEngine } from "./engine";
import {
  fetchPlayerState,
  sendPlayerEvent,
  type PlayerStateResponse,
  type PlayerTrack,
} from "@/lib/api/player";

interface PlayerRuntimeProps {
  token: string;
  slug: string;
  engine?: PlaybackEngine;
  fetchState?: (token: string) => Promise<PlayerStateResponse>;
  sendEvent?: (
    token: string,
    action: "started" | "finished" | "failed",
    itemId: string,
    reason?: string,
  ) => Promise<void>;
  onStateChange?: (state: PlayerStateResponse) => void;
  pollIntervalMs?: number;
}

export function PlayerRuntime({
  token,
  engine,
  fetchState = fetchPlayerState,
  sendEvent = sendPlayerEvent,
  onStateChange,
  pollIntervalMs = 5000,
}: PlayerRuntimeProps) {
  const [state, setState] = useState<PlayerStateResponse | null>(null);
  const activeTrackRef = useRef<PlayerTrack | null>(null);
  const isAdvancingRef = useRef(false);

  const syncState = useCallback(async () => {
    try {
      const data = await fetchState(token);
      setState(data);
      onStateChange?.(data);
      return data;
    } catch {
      return null;
    }
  }, [token, fetchState, onStateChange]);

  // Handle track transition / auto-advance
  useEffect(() => {
    if (!state || isAdvancingRef.current) return;

    if (state.nowPlaying) {
      if (activeTrackRef.current?.itemId !== state.nowPlaying.itemId) {
        activeTrackRef.current = state.nowPlaying;
        if (engine) {
          void engine.load(state.nowPlaying).then(() => {
            void engine.play();
          });
        }
      }
    } else if (state.queue.length > 0 && !isAdvancingRef.current) {
      // Auto-start next queued track
      const next = state.queue[0];
      isAdvancingRef.current = true;
      void sendEvent(token, "started", next.itemId)
        .then(() => syncState())
        .finally(() => {
          isAdvancingRef.current = false;
        });
    }
  }, [state, engine, sendEvent, syncState, token]);

  // Attach engine callbacks
  useEffect(() => {
    if (!engine) return;

    const unbindEnded = engine.onEnded(() => {
      const current = activeTrackRef.current;
      if (current && !current.itemId.startsWith("fallback-")) {
        void sendEvent(token, "finished", current.itemId).then(() => {
          activeTrackRef.current = null;
          void syncState();
        });
      }
    });

    const unbindError = engine.onError((reason) => {
      const current = activeTrackRef.current;
      if (current && !current.itemId.startsWith("fallback-")) {
        void sendEvent(token, "failed", current.itemId, reason).then(() => {
          activeTrackRef.current = null;
          void syncState();
        });
      }
    });

    return () => {
      unbindEnded();
      unbindError();
    };
  }, [engine, sendEvent, syncState, token]);

  // Polling loop
  useEffect(() => {
    void syncState();
    const timer = setInterval(() => {
      void syncState();
    }, pollIntervalMs);
    return () => clearInterval(timer);
  }, [syncState, pollIntervalMs]);

  return null;
}

