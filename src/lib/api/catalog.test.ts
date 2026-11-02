import { describe, expect, it, vi } from "vitest";
import { addTrackByUrl, archiveTrack, deleteTrack, reorderFallback } from "./catalog";

const mockRpc = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/lib/api/supabase/browser", () => ({
  createBrowserSupabase: () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: () => ({
      insert: (...args: unknown[]) => ({
        select: () => ({
          single: () => mockInsert(...args),
        }),
      }),
      update: (...args: unknown[]) => ({
        eq: () => mockUpdate(...args),
      }),
    }),
  }),
}));

describe("Catalog API", () => {
  it("rejects invalid YouTube URLs", async () => {
    await expect(
      addTrackByUrl("v-1", "https://notyoutube.com", {
        title: "Test",
        artist: "Artist",
      }),
    ).rejects.toThrow("no es un video de YouTube válido");
  });

  it("adds track by valid YouTube URL", async () => {
    mockInsert.mockResolvedValueOnce({
      data: {
        id: "tr-1",
        venue_id: "v-1",
        title: "De Música Ligera",
        artist: "Soda Stereo",
        duration_seconds: 210,
        thumbnail_url: "https://img.youtube.com/vi/a1b2c3d4/hqdefault.jpg",
        is_explicit: false,
      },
      error: null,
    });

    const res = await addTrackByUrl(
      "v-1",
      "https://www.youtube.com/watch?v=a1b2c3d4e5f",
      {
        title: "De Música Ligera",
        artist: "Soda Stereo",
      },
    );

    expect(res.title).toBe("De Música Ligera");
    expect(res.source).toBe("youtube");
  });

  it("archives track", async () => {
    mockUpdate.mockResolvedValueOnce({ error: null });
    await expect(archiveTrack("tr-1")).resolves.toBeUndefined();
  });

  it("reorders fallback tracks via RPC", async () => {
    mockRpc.mockResolvedValueOnce({
      data: { ok: true },
      error: null,
    });

    await expect(
      reorderFallback("v-1", ["tr-1", "tr-2"]),
    ).resolves.toBeUndefined();

    expect(mockRpc).toHaveBeenCalledWith("owner_reorder_fallback", {
      p_venue_id: "v-1",
      p_track_ids: ["tr-1", "tr-2"],
    });
  });
  it("deletes track via RPC", async () => {
    mockRpc.mockResolvedValueOnce({
      data: { ok: true },
      error: null,
    });

    await expect(deleteTrack("tr-1")).resolves.toBeUndefined();
    expect(mockRpc).toHaveBeenCalledWith("owner_delete_track", {
      p_track_id: "tr-1",
    });
  });
});
