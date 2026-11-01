import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockChannel = vi.fn().mockReturnValue({
  send: vi.fn().mockResolvedValue({}),
});

vi.mock("@/lib/api/supabase/browser", () => ({
  createBrowserSupabase: () => ({
    rpc: mockRpc,
    from: mockFrom,
    channel: mockChannel,
  }),
}));

import {
  requestTvPairingCode,
  confirmTvPairingCode,
  checkTvPairingStatus,
  listVenuePlayerDevices,
  revokePlayerDevice,
} from "@/lib/api/tv-pairing";

describe("TV Pairing API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requests a 6-digit TV pairing code", async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        ok: true,
        code: "839201",
        deviceName: "TV Salón Principal",
        expiresInSeconds: 600,
      },
      error: null,
    });

    const res = await requestTvPairingCode("billar-aurora", "TV Salón Principal");
    expect(res.ok).toBe(true);
    expect(res.code).toBe("839201");
    expect(mockRpc).toHaveBeenCalledWith("request_tv_pairing_code", {
      p_venue_slug: "billar-aurora",
      p_device_name: "TV Salón Principal",
    });
  });

  it("confirms a 6-digit TV pairing code and broadcasts event", async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        ok: true,
        deviceId: "dev-123",
        name: "TV Salón Principal",
        token: "tok_abcdef1234567890",
      },
      error: null,
    });

    const res = await confirmTvPairingCode("billar-aurora", "839201", "TV Salón Principal");
    expect(res.ok).toBe(true);
    expect(res.token).toBe("tok_abcdef1234567890");
    expect(res.deviceId).toBe("dev-123");
    expect(mockChannel).toHaveBeenCalledWith("playback-control:billar-aurora");
  });

  it("checks pairing status", async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        ok: true,
        paired: true,
        token: "tok_abcdef1234567890",
        deviceId: "dev-123",
      },
      error: null,
    });

    const res = await checkTvPairingStatus("billar-aurora", "839201");
    expect(res.ok).toBe(true);
    expect(res.paired).toBe(true);
    expect(res.token).toBe("tok_abcdef1234567890");
  });

  it("lists venue player devices", async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        ok: true,
        devices: [
          {
            id: "dev-1",
            name: "Pantalla Barra",
            createdAt: "2026-11-01T00:00:00Z",
            lastSeenAt: "2026-11-01T00:05:00Z",
            revokedAt: null,
            isOnline: true,
          },
        ],
      },
      error: null,
    });

    const devices = await listVenuePlayerDevices("billar-aurora");
    expect(devices).toHaveLength(1);
    expect(devices[0].name).toBe("Pantalla Barra");
    expect(devices[0].isOnline).toBe(true);
  });

  it("revokes a player device", async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    mockFrom.mockReturnValue({ update: mockUpdate });

    const ok = await revokePlayerDevice("dev-1");
    expect(ok).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith("player_devices");
    expect(mockUpdate).toHaveBeenCalled();
  });
});

