import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PanelPlaybackFooter } from "@/components/panel/panel-playback-footer";
import type { NightState } from "@/lib/api/contracts";

const mockFetchNight = vi.fn();
const mockSubscribeNight = vi.fn().mockReturnValue(() => {});

vi.mock("@/lib/api/night-state", () => ({
  createNightStateSource: () => ({
    fetch: mockFetchNight,
    subscribe: mockSubscribeNight,
  }),
}));

const mockFetchPlayback = vi.fn();
const mockSendCommand = vi.fn();

vi.mock("@/lib/api/master-control", () => ({
  fetchPlaybackState: (...args: unknown[]) => mockFetchPlayback(...args),
  sendPlaybackCommand: (...args: unknown[]) => mockSendCommand(...args),
  togglePausePlayback: vi.fn(),
  setPlaybackVolume: vi.fn(),
  toggleMutePlayback: vi.fn(),
  skipTrackPlayback: vi.fn(),
  toggleKaraokePlayback: vi.fn(),
  seekPlayback: vi.fn(),
  toggleFullscreenPlayback: vi.fn(),
}));

const mockVetoItem = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/api/panel-actions", () => ({
  vetoItem: (...args: unknown[]) => mockVetoItem(...args),
}));

const mockCastVote = vi.fn().mockResolvedValue({ ok: true, newVoteCount: 8, hasVoted: true });
vi.mock("@/lib/api/votes", () => ({
  castVote: (...args: unknown[]) => mockCastVote(...args),
}));

vi.mock("@/lib/api/supabase/browser", () => ({
  createBrowserSupabase: () => {
    const channelMock: Record<string, unknown> = {};
    channelMock.on = vi.fn().mockReturnValue(channelMock);
    channelMock.subscribe = vi.fn().mockReturnValue({ unsubscribe: vi.fn() });
    return {
      channel: () => channelMock,
      removeChannel: vi.fn(),
      getChannels: () => [],
    };
  },
}));

describe("PanelPlaybackFooter with Expandable Queue Drawer", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
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
        voteCount: 7,
        createdAt: "2026-10-31T20:05:00Z",
        status: "queued",
        myVote: false,
      },
    ],
    candidates: [
      {
        id: "c-1",
        trackId: "t-2",
        title: "Puente",
        artist: "Gustavo Cerati",
        source: "youtube",
        durationSeconds: 270,
        thumbnailUrl: null,
        voteCount: 3,
        createdAt: "2026-10-31T20:10:00Z",
        status: "proposed",
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

  const defaultPlayback = {
    ok: true,
    isPaused: false,
    volume: 80,
    isMuted: false,
    karaokeMode: false,
    currentTrack: {
      title: "Crimen",
      artist: "Gustavo Cerati",
      youtubeVideoId: "u7K_A06m51U",
      durationSeconds: 228,
    },
    lastCommand: null,
    commandSeq: 1,
  };

  it("renders bottom player bar and opens drawer on tap", async () => {
    mockFetchNight.mockResolvedValue(activeNightState);
    mockFetchPlayback.mockResolvedValue(defaultPlayback);

    render(<PanelPlaybackFooter slug="billar-aurora" />);

    await waitFor(() => {
      expect(screen.getAllByText("Crimen").length).toBeGreaterThan(0);
      expect(screen.getByTitle("Abrir cola y gestión de temas")).toBeInTheDocument();
    });

    // Drawer should not be visible initially
    expect(screen.queryByText("Control Maestro & Cola de Salón")).not.toBeInTheDocument();

    // Click on Cola trigger button
    const colaBtn = screen.getByTitle("Abrir cola y gestión de temas");
    fireEvent.click(colaBtn);

    // Drawer should now be visible
    await waitFor(() => {
      expect(screen.getByText("Control Maestro & Cola de Salón")).toBeInTheDocument();
      expect(screen.getByText("De Música Ligera")).toBeInTheDocument();
    });

    // Test Play Now action inside drawer
    const ponerYaBtns = screen.getAllByRole("button", { name: /poner ya/i });
    expect(ponerYaBtns.length).toBeGreaterThan(0);
    fireEvent.click(ponerYaBtns[0]);

    await waitFor(() => {
      expect(mockSendCommand).toHaveBeenCalledWith(
        "billar-aurora",
        "play_now",
        expect.objectContaining({
          track: expect.objectContaining({
            trackId: "t-1",
            title: "De Música Ligera",
          }),
        }),
      );
    });
  });

  it("allows switching tabs between queue and candidates, voting, and vetoing", async () => {
    mockFetchNight.mockResolvedValue(activeNightState);
    mockFetchPlayback.mockResolvedValue(defaultPlayback);

    render(<PanelPlaybackFooter slug="billar-aurora" />);

    // Wait for state to load
    await waitFor(() => {
      expect(screen.getByTitle("Abrir cola y gestión de temas")).toBeInTheDocument();
    });

    // Open drawer
    const colaBtn = screen.getByTitle("Abrir cola y gestión de temas");
    fireEvent.click(colaBtn);

    await waitFor(() => {
      expect(screen.getByText("Control Maestro & Cola de Salón")).toBeInTheDocument();
    });

    // Test boost vote on queued item
    const subirBtn = screen.getByTitle(/subir al tope de la cola/i);
    fireEvent.click(subirBtn);
    await waitFor(() => {
      expect(mockCastVote).toHaveBeenCalledWith("qi-1", "billar-aurora");
    });

    // Test veto item
    await waitFor(() => {
      expect(screen.getByTitle(/quitar de la cola/i)).toBeInTheDocument();
    });
    const vetarBtn = screen.getByTitle(/quitar de la cola/i);
    fireEvent.click(vetarBtn);
    await waitFor(() => {
      expect(mockVetoItem).toHaveBeenCalledWith("qi-1");
    });

    // Switch to candidates tab
    const candidatosTab = screen.getByRole("button", { name: /candidatas/i });
    fireEvent.click(candidatosTab);

    await waitFor(() => {
      expect(screen.getByText("Puente")).toBeInTheDocument();
      expect(screen.getByText("3/5 votos")).toBeInTheDocument();
    });
  });
});
