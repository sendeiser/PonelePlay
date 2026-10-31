import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientNight } from "@/components/client/client-night";
import type { NightState } from "@/lib/api/contracts";

vi.mock("@/lib/api/anon", () => ({
  ensureAnonymousParticipant: vi.fn().mockResolvedValue({
    participantId: "part-1",
    credits: 5,
    proposalsUsed: 0,
  }),
}));

const mockFetch = vi.fn();
const mockSubscribe = vi.fn().mockReturnValue(() => {});

vi.mock("@/lib/api/night-state", () => ({
  createNightStateSource: () => ({
    fetch: mockFetch,
    subscribe: mockSubscribe,
  }),
}));

const mockCastVote = vi.fn().mockResolvedValue({
  ok: true,
  voteCount: 5,
  balance: 2,
});

vi.mock("@/lib/api/votes", () => ({
  castVote: (id: string) => mockCastVote(id),
  voteErrorMessage: (err: string) => `Error: ${err}`,
}));

describe("ClientNight component", () => {
  afterEach(() => {
    cleanup();
  });

  const activeNightState: NightState = {
    venue: {
      id: "v-1",
      slug: "billar-aurora",
      name: "Billar Aurora",
      accentColor: "#FFB703",
      logoUrl: null,
      joinMessage: "Bienvenidos",
    },
    night: {
      id: "n-1",
      status: "open",
      openedAt: "2026-10-31T20:00:00Z",
    },
    nowPlaying: {
      id: "qi-0",
      trackId: "t-0",
      title: "Crimen",
      artist: "Gustavo Cerati",
      source: "youtube",
      durationSeconds: 228,
      thumbnailUrl: null,
      voteCount: 10,
      createdAt: "2026-10-31T20:00:00Z",
      status: "playing",
      myVote: false,
    },
    queue: [
      {
        id: "qi-1",
        trackId: "t-1",
        title: "De Música Ligera",
        artist: "Soda Stereo",
        source: "youtube",
        durationSeconds: 212,
        thumbnailUrl: null,
        voteCount: 4,
        createdAt: "2026-10-31T20:05:00Z",
        status: "queued",
        myVote: false,
      },
    ],
    me: {
      participantId: "part-1",
      credits: 3,
      proposalsUsed: 0,
    },
    settings: {
      proposalsEnabled: true,
      explicitFilterEnabled: true,
      maxQueueSize: 30,
      maxProposalsPerParticipant: 3,
      maxSongDurationSeconds: 480,
      defaultCreditsPerCode: 5,
      maxCreditsPerCode: 50,
    },
    serverTime: "2026-10-31T20:10:00Z",
  };

  it("renders closed state when night is closed", async () => {
    mockFetch.mockResolvedValueOnce({
      ...activeNightState,
      night: { id: "n-0", status: "closed", openedAt: "" },
    });

    render(<ClientNight slug="billar-aurora" />);

    await waitFor(() => {
      expect(screen.getByText("La noche está cerrada")).toBeInTheDocument();
    });
  });

  it("renders now playing and queue items when night is active", async () => {
    mockFetch.mockResolvedValueOnce(activeNightState);

    render(<ClientNight slug="billar-aurora" />);

    await waitFor(() => {
      expect(screen.getByText("Crimen")).toBeInTheDocument();
      expect(screen.getByText("De Música Ligera")).toBeInTheDocument();
      expect(screen.getByText("Billar Aurora")).toBeInTheDocument();
    });
  });

  it("casts a vote when clicking vote button", async () => {
    mockFetch.mockResolvedValue(activeNightState);

    render(<ClientNight slug="billar-aurora" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /votar por de música ligera/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /votar por de música ligera/i }));

    expect(mockCastVote).toHaveBeenCalledWith("qi-1");
  });

  it("opens redeem sheet when user has 0 credits and tries to vote", async () => {
    mockFetch.mockResolvedValue({
      ...activeNightState,
      me: {
        participantId: "part-1",
        credits: 0,
        proposalsUsed: 0,
      },
    });

    render(<ClientNight slug="billar-aurora" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /votar por de música ligera/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /votar por de música ligera/i }));

    await waitFor(() => {
      expect(screen.getByText("Canjeá tus votos")).toBeInTheDocument();
    });
  });
});
