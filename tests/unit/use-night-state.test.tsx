import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { useNightState, type NightStateSource } from "@/hooks/use-night-state";
import type { NightState } from "@/lib/api/contracts";

describe("useNightState hook", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads, refetches on realtime change, and polls after interval", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fakeState = {
      venue: { slug: "billar-aurora", name: "Aurora" },
    } as unknown as NightState;

    const fetch = vi.fn().mockResolvedValue(fakeState);
    let onChange = () => {};
    const source: NightStateSource = {
      fetch,
      subscribe: (cb: () => void) => {
        onChange = cb;
        return () => {};
      },
    };

    const { result } = renderHook(() =>
      useNightState(source, { pollMs: 10_000, debounceMs: 50 }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      onChange();
      await vi.advanceTimersByTimeAsync(60);
    });
    expect(fetch).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("marks offline when fetch fails and recovers on success", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network failed"))
      .mockResolvedValueOnce({
        venue: { slug: "billar-aurora" },
      } as unknown as NightState);

    const source: NightStateSource = {
      fetch,
      subscribe: () => () => {},
    };

    const { result } = renderHook(() => useNightState(source));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.offline).toBe(true);

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.offline).toBe(false);
    expect(result.current.state?.venue.slug).toBe("billar-aurora");
  });
});
