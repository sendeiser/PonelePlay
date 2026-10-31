"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NightState } from "@/lib/api/contracts";

export interface NightStateSource {
  fetch: () => Promise<NightState>;
  subscribe: (onChange: () => void) => () => void;
}

export interface UseNightStateOptions {
  pollMs?: number;
  debounceMs?: number;
}

export function useNightState(
  source: NightStateSource,
  options?: UseNightStateOptions,
) {
  const pollMs = options?.pollMs ?? 10_000;
  const debounceMs = options?.debounceMs ?? 150;

  const [state, setState] = useState<NightState | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doFetch = useCallback(async () => {
    try {
      const data = await source.fetch();
      setState(data);
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, [source]);

  const debouncedFetch = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      void doFetch();
    }, debounceMs);
  }, [debounceMs, doFetch]);

  useEffect(() => {
    void doFetch();

    const unsubscribe = source.subscribe(() => {
      debouncedFetch();
    });

    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) {
        return;
      }
      void doFetch();
    }, pollMs);

    return () => {
      unsubscribe();
      clearInterval(interval);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [source, doFetch, debouncedFetch, pollMs]);

  return {
    state,
    loading,
    offline,
    refresh: doFetch,
  };
}

