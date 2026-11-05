import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProposalSearch } from "@/components/client/parts/proposal-search";

const mockProposeTrack = vi.fn().mockResolvedValue({
  itemId: "qi-party-1",
  trackId: "t-party-1",
  duplicate: false,
  voteCount: 1,
});

vi.mock("@/lib/api/proposals", () => ({
  searchYouTube: vi.fn().mockResolvedValue([
    {
      videoId: "yt123456789",
      title: "Tu Turrito",
      artist: "Rei, Callejero Fino",
      duration: "3:15",
      durationSeconds: 195,
      thumbnailUrl: "https://example.com/thumb.jpg",
    },
  ]),
  proposeTrack: (input: unknown) => mockProposeTrack(input),
}));

describe("Party Guest ProposalSearch with Dedication and Karaoke", () => {
  it("allows guest to enter dedication and toggle karaoke before proposing a track in party mode", async () => {
    const onProposed = vi.fn();
    const onNotify = vi.fn();

    render(
      <ProposalSearch
        queue={[]}
        proposalsEnabled={true}
        isPartyMode={true}
        defaultGuestName="Franco"
        allowDedications={true}
        allowGuestKaraoke={true}
        minVotesToQueue={1}
        onProposed={onProposed}
        onNotify={onNotify}
      />,
    );

    const dedicationInput = screen.getByPlaceholderText(/Feliz cumple/i);
    fireEvent.change(dedicationInput, { target: { value: "¡Feliz cumple Tincho! 🍻" } });

    const karaokeToggle = screen.getByRole("checkbox", { name: /Karaoke/i });
    fireEvent.click(karaokeToggle);

    const searchInput = screen.getByPlaceholderText(/artista, canción o link/i);
    fireEvent.change(searchInput, { target: { value: "Tu Turrito" } });

    const proposeBtn = await screen.findByRole("button", { name: /Proponer|Pedir/i });
    fireEvent.click(proposeBtn);

    await waitFor(() => {
      expect(mockProposeTrack).toHaveBeenCalledWith(
        expect.objectContaining({
          youtubeVideoId: "yt123456789",
          guestName: "Franco",
          dedication: "¡Feliz cumple Tincho! 🍻",
          isKaraoke: true,
        }),
      );
    });
  });
});

