import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PartyModeControlBar } from "@/components/panel/party-mode-control-bar";
import { DEFAULT_PARTY_CONFIG } from "@/lib/domain/party";

describe("PartyModeControlBar component", () => {
  it("renders the 3 party modes and exposes optional vote limit & queue threshold controls in democratic mode", () => {
    const onChange = vi.fn();
    const onReloadVotes = vi.fn();
    render(
      <PartyModeControlBar
        slug="cumple-tincho"
        venueName="Cumple de Tincho"
        config={{ ...DEFAULT_PARTY_CONFIG, partyMode: "democratic", votesPerGuest: 5, minVotesToQueue: 3 }}
        queueItems={[]}
        onConfigChange={onChange}
        onReloadGuestVotes={onReloadVotes}
      />,
    );

    expect(screen.getByText(/Democrático/i)).toBeInTheDocument();
    expect(screen.getByText(/Híbrido Turbo/i)).toBeInTheDocument();
    expect(screen.getByText(/Duelos y Ruleta/i)).toBeInTheDocument();
    expect(screen.getByText(/Límite de votos por persona/i)).toBeInTheDocument();
    expect(screen.getByText(/Votos necesarios para ingresar a la cola/i)).toBeInTheDocument();

    const reloadBtn = screen.getByRole("button", { name: /Recargar votos a todos/i });
    fireEvent.click(reloadBtn);
    expect(onReloadVotes).toHaveBeenCalledTimes(1);
  });
});

