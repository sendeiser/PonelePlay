import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProposalSearch } from "@/components/client/parts/proposal-search";
import type { QueueItemView } from "@/lib/api/contracts";

afterEach(() => {
  cleanup();
});

const mockProposeTrack = vi.fn().mockResolvedValue({
  itemId: "qi-new",
  trackId: "t-new",
  duplicate: false,
  voteCount: 0,
});

vi.mock("@/lib/api/proposals", () => ({
  searchYouTube: vi.fn().mockResolvedValue([
    {
      videoId: "v-1",
      title: "Canción Animal",
      artist: "Soda Stereo",
      duration: "4:08",
      durationSeconds: 248,
      thumbnailUrl: "",
    },
    {
      videoId: "v-2",
      title: "Trátame Suavemente",
      artist: "Soda Stereo",
      duration: "3:22",
      durationSeconds: 202,
      thumbnailUrl: "",
    },
  ]),
  proposeTrack: (input: unknown) => mockProposeTrack(input),
}));

describe("ProposalSearch component", () => {
  const mockQueue: QueueItemView[] = [
    {
      id: "qi-existing",
      trackId: "t-existing",
      title: "Canción Animal",
      artist: "Soda Stereo",
      source: "youtube",
      durationSeconds: 248,
      thumbnailUrl: null,
      voteCount: 3,
      createdAt: "2026-10-31T20:00:00Z",
      status: "queued",
      myVote: false,
    },
  ];

  it("renders search bar and shows suggestions", () => {
    render(
      <ProposalSearch
        queue={[]}
        proposalsEnabled={true}
        onProposed={vi.fn()}
        onNotify={vi.fn()}
      />,
    );

    expect(
      screen.getByPlaceholderText(/artista, canción o link/i),
    ).toBeInTheDocument();
  });

  it("displays search results and marks already queued tracks", async () => {
    render(
      <ProposalSearch
        queue={mockQueue}
        proposalsEnabled={true}
        onProposed={vi.fn()}
        onNotify={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText(/artista, canción o link/i);
    fireEvent.change(input, { target: { value: "Soda" } });

    await waitFor(() => {
      expect(screen.getByText("Canción Animal")).toBeInTheDocument();
      expect(screen.getByText("Trátame Suavemente")).toBeInTheDocument();
    });

    // "Canción Animal" is in mockQueue -> button should show "En la cola"
    expect(screen.getByText("En la cola")).toBeInTheDocument();

    // "Trátame Suavemente" is NOT in mockQueue -> button should show "Proponer"
    expect(screen.getByText("Proponer")).toBeInTheDocument();
  });

  it("submits a proposal and notifies", async () => {
    const onProposed = vi.fn();
    const onNotify = vi.fn();

    render(
      <ProposalSearch
        queue={mockQueue}
        proposalsEnabled={true}
        onProposed={onProposed}
        onNotify={onNotify}
      />,
    );

    const input = screen.getByPlaceholderText(/artista, canción o link/i);
    fireEvent.change(input, { target: { value: "Soda" } });

    await waitFor(() => {
      expect(screen.getByText("Trátame Suavemente")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Proponer"));

    await waitFor(() => {
      expect(mockProposeTrack).toHaveBeenCalledWith({
        title: "Trátame Suavemente",
        artist: "Soda Stereo",
        durationSeconds: 202,
        youtubeVideoId: "v-2",
        thumbnailUrl: "",
      });
      expect(onProposed).toHaveBeenCalled();
      expect(onNotify).toHaveBeenCalledWith(
        "«Trátame Suavemente» fue propuesta. Con 5 votos entra a la cola.",
        "ok",
      );
    });
  });

  it("shows paused message when proposals are disabled", () => {
    render(
      <ProposalSearch
        queue={[]}
        proposalsEnabled={false}
        onProposed={vi.fn()}
        onNotify={vi.fn()}
      />,
    );

    expect(screen.getByText("Propuestas pausadas")).toBeInTheDocument();
  });
});
