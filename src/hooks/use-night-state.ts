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
  const debounceMs = options?.debounceMs ?? 350;

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

    const unsub = source.subscribe(() => {
      debouncedFetch();
    });

    const interval = setInterval(() => {
      void doFetch();
    }, pollMs);

    const onQueueUpdated = () => {
      void doFetch();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("poneleplay:queue-updated", onQueueUpdated);
    }

    return () => {
      unsub();
      clearInterval(interval);
      if (typeof window !== "undefined") {
        window.removeEventListener("poneleplay:queue-updated", onQueueUpdated);
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [doFetch, debouncedFetch, pollMs, source]);

  const refresh = useCallback(async () => {
    await doFetch();
  }, [doFetch]);

  return { state, loading, offline, refresh };
}
