import { describe, expect, it, vi } from "vitest";
import {
  fetchPlayerState,
  pairPlayerDevice,
  revokePlayerDevice,
  sendPlayerEvent,
} from "./player";

const mockRpc = vi.fn();
vi.mock("@/lib/api/supabase/browser", () => ({
  createBrowserSupabase: () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

describe("Player API", () => {
  it("pairs player device and returns raw token", async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        ok: true,
        deviceId: "dev-1",
        name: "TV Salón",
        token: "tok-abc-123",
      },
      error: null,
    });

    const res = await pairPlayerDevice("venue-1", "TV Salón");
    expect(res).toEqual({
      deviceId: "dev-1",
      name: "TV Salón",
      token: "tok-abc-123",
    });
    expect(mockRpc).toHaveBeenCalledWith("owner_pair_player", {
      p_venue_id: "venue-1",
      p_name: "TV Salón",
    });
  });

  it("fetches player state with valid token", async () => {
    const mockState = {
      ok: true,
      deviceId: "dev-1",
      venue: { id: "v-1", name: "Bar", slug: "bar" },
      nightId: "n-1",
      nightStatus: "active",
      nowPlaying: null,
      queue: [],
      fallback: [],
      serverTime: "2026-10-31T23:00:00Z",
    };
    mockRpc.mockResolvedValueOnce({
      data: mockState,
      error: null,
    });

    const state = await fetchPlayerState("tok-abc-123");
    expect(state).toEqual(mockState);
    expect(mockRpc).toHaveBeenCalledWith("player_state", {
      p_token: "tok-abc-123",
    });
  });

  it("sends player playback events", async () => {
    mockRpc.mockResolvedValueOnce({
      data: { ok: true },
      error: null,
    });

    await expect(
      sendPlayerEvent("tok-1", "started", "item-99"),
    ).resolves.toBeUndefined();

    expect(mockRpc).toHaveBeenCalledWith("player_event", {
      p_token: "tok-1",
      p_action: "started",
      p_item_id: "item-99",
      p_reason: null,
    });
  });

  it("revokes player device", async () => {
    mockRpc.mockResolvedValueOnce({
      data: { ok: true },
      error: null,
    });

    await expect(revokePlayerDevice("dev-1")).resolves.toBeUndefined();
    expect(mockRpc).toHaveBeenCalledWith("owner_revoke_player", {
      p_device_id: "dev-1",
    });
  });
});

