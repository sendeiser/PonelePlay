import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NightDashboard } from "@/components/panel/night-dashboard";
import type { NightState } from "@/lib/api/contracts";

const mockFetch = vi.fn();
const mockSubscribe = vi.fn().mockReturnValue(() => {});

vi.mock("@/lib/api/night-state", () => ({
  createNightStateSource: () => ({
    fetch: mockFetch,
    subscribe: mockSubscribe,
  }),
}));

vi.mock("@/lib/api/panel-actions", () => ({
  openNight: vi.fn().mockResolvedValue({ nightId: "n-open" }),
  closeNight: vi.fn().mockResolvedValue({ nightId: "n-close" }),
  setProposalsEnabled: vi.fn().mockResolvedValue(undefined),
  skipCurrent: vi.fn().mockResolvedValue(undefined),
  vetoItem: vi.fn().mockResolvedValue(undefined),
}));

describe("NightDashboard component", () => {
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
        voteCount: 6,
        createdAt: "2026-10-31T20:05:00Z",
        status: "queued",
        myVote: false,
      },
    ],
    me: null,
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

  it("renders live queue, now playing, and controls", async () => {
    mockFetch.mockResolvedValueOnce(activeNightState);

    render(<NightDashboard slug="billar-aurora" role="owner" />);

    await waitFor(() => {
      expect(screen.getByText("Cabina en Vivo")).toBeInTheDocument();
      expect(screen.getByText("Crimen")).toBeInTheDocument();
      expect(screen.getByText("De Música Ligera")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /cerrar noche/i })).toBeInTheDocument();
    });
  });

  it("opens confirm dialog when clicking close night", async () => {
    mockFetch.mockResolvedValueOnce(activeNightState);

    render(<NightDashboard slug="billar-aurora" role="owner" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /cerrar noche/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /cerrar noche/i }));

    expect(
      screen.getByText("¿Cerrar la sesión de la noche?"),
    ).toBeInTheDocument();
  });
});
