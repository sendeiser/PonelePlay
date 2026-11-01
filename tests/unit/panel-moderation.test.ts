import { describe, expect, it, vi } from "vitest";
import { skipCurrent, vetoItem } from "@/lib/api/panel-actions";

// Mock Supabase browser client
const mockRpc = vi.fn();
vi.mock("@/lib/api/supabase/browser", () => ({
  createBrowserSupabase: () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

describe("Panel moderation actions", () => {
  it("calls owner_queue_action with skip when invoked without staff token", async () => {
    mockRpc.mockResolvedValueOnce({
      data: { ok: true },
      error: null,
    });

    await expect(skipCurrent("item-123")).resolves.toBeUndefined();
    expect(mockRpc).toHaveBeenCalledWith("owner_queue_action", {
      p_item_id: "item-123",
      p_action: "skip",
    });
  });

  it("calls owner_queue_action with veto when invoked without staff token", async () => {
    mockRpc.mockResolvedValueOnce({
      data: { ok: true },
      error: null,
    });

    await expect(vetoItem("item-456")).resolves.toBeUndefined();
    expect(mockRpc).toHaveBeenCalledWith("owner_queue_action", {
      p_item_id: "item-456",
      p_action: "veto",
    });
  });

  it("throws clear error when skip returns not_found or night_closed", async () => {
    mockRpc.mockResolvedValueOnce({
      data: { ok: false, error: "night_closed" },
      error: null,
    });

    await expect(skipCurrent("item-123")).rejects.toThrow("La noche está cerrada");
  });

  it("throws clear error when veto returns not_queued", async () => {
    mockRpc.mockResolvedValueOnce({
      data: { ok: false, error: "not_queued" },
      error: null,
    });

    await expect(vetoItem("item-playing")).rejects.toThrow(
      "Solo se pueden vetar temas que estén en cola de espera",
    );
  });
});
