# Party Mode (Fiestas, Jodas, Reuniones y Cumpleaños) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar la versión personalizada de PonelePlay para Fiestas, Jodas, Reuniones y Cumpleaños (`venue_type = 'party'`) con todo desbloqueado, panel minimalista, 3 modos de dinámica en vivo (Democrático con límite de votos y umbral de subida configurables, Híbrido con Fueguitos Turbo y Divertido con Duelos 1v1 y Ruleta en TV), dedicatorias en pantalla y karaoke con nombre, sin alterar la versión existente de Bares (`venue_type = 'bar'`).

**Architecture:** Se extiende el esquema de `venue_settings` y `queue_items` junto con los contratos Zod y el dominio de cola para soportar `venueType: 'bar' | 'party'` y `partyConfig` (`partyMode`, `votesPerGuest`, `minVotesToQueue`, `allowDedications`, `allowGuestKaraoke`, `turboCooldownSeconds`). El frontend adapta dinámicamente el registro (`/signup`), el panel de administración (`PanelShell`, `NightDashboard`, `PartyModeControlBar`), la vista del invitado (`ClientNightScreen`, `ProposalSearch`) y la Pantalla TV (`PlayerScreen`) manteniendo compatibilidad 100% hacia atrás con locales de tipo Bar.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, Zod, Supabase (PostgreSQL + Realtime Broadcast), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-04-party-mode-design.md`

## Global Constraints

- Preservar intacto el comportamiento actual cuando `venueType === 'bar'` (default para salas sin `partyConfig`).
- En `venueType === 'party'`, ocultar las pestañas `"Códigos"` y `"Personal"` en `PanelShell`, mostrando solo `"Cabina en Vivo"`, `"Catálogo"` y `"Ajustes"`.
- Soportar los 3 modos de fiesta conmutables en vivo: `'democratic'`, `'hybrid_turbo'` y `'party_games'`.
- En `'democratic'`, permitir al administrador configurar opcionalmente:
  - `votesPerGuest` (`0` = ilimitado por defecto, o un entero `> 0` como límite de votos por persona + acción de recargar votos a todos).
  - `minVotesToQueue` (`1` = pasa directo a la cola activa por defecto, o un entero `>= 1` requerido para subir de propuesta a cola activa).
- Soportar `guestName`, `dedication` (máx. 90 caracteres en UI, 120 en DB) e `isKaraoke` al pedir canciones y mostrarlos en Cola, Cabina y Pantalla TV.

## Review Focus

- Salas existentes de tipo Bar que no envían el bloque `partyConfig` desde respuestas legacy o mocks de test deben parsear sin error en `nightStateSchema` asumiendo `venueType: 'bar'` y valores por defecto.
- Cuando `venueType === 'party'` y `minVotesToQueue === 1`, `partitionQueueAndProposals` debe clasificar todas las canciones propuestas o encoladas dentro de `activeQueue` sin exigir el umbral de 5 votos de Bares.
- Cuando `venueType === 'party'` y el admin configura `minVotesToQueue > 1` (ej. `3` votos en modo Democrático), los ítems con `< 3` votos deben permanecer en `candidateProposals` y pasar a `activeQueue` al llegar a `>= 3` votos.
- En modo Democrático con `votesPerGuest > 0`, si un invitado llega a `0` votos disponibles, el botón de votar debe informar claramente que alcanzó su límite hasta que el anfitrión recargue votos.
- Dedicatorias vacías o con solo espacios no deben renderizar banners vacíos en la Pantalla TV.

---

### Task 1: Dominio de Fiesta, Contratos Zod y Particionado Dinámico de Cola

**Files:**
- Create: `src/lib/domain/party.ts`
- Modify: `src/lib/api/contracts.ts`
- Modify: `src/lib/domain/queue.ts`
- Test: `tests/unit/party-domain.test.ts`

**Interfaces:**
- Produces:
  - `VenueType = "bar" | "party"`
  - `PartyMode = "democratic" | "hybrid_turbo" | "party_games"`
  - `PartyConfig` (`venueType`, `partyMode`, `votesPerGuest`, `minVotesToQueue`, `allowDedications`, `allowGuestKaraoke`, `turboCooldownSeconds`)
  - `DEFAULT_PARTY_CONFIG` & `DEFAULT_BAR_PARTY_CONFIG`
  - `resolveEffectiveQueueThreshold(partyConfig?: Partial<PartyConfig> | null): number`
  - `canGuestCastVote(partyConfig: PartyConfig, guestVotesRemaining: number): { allowed: boolean; reason?: string }`
  - Extended `queueItemViewSchema` (`guestName?: string | null`, `dedication?: string | null`, `isKaraoke?: boolean`) and `nightStateSchema` (`partyConfig?: PartyConfig`)

- [ ] **Step 1: Write the failing test in `tests/unit/party-domain.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARTY_CONFIG,
  resolveEffectiveQueueThreshold,
  canGuestCastVote,
} from "@/lib/domain/party";
import { partitionQueueAndProposals } from "@/lib/domain/queue";
import { nightStateSchema } from "@/lib/api/contracts";

describe("Party Mode domain & queue rules", () => {
  it("uses threshold 1 by default in party mode and custom minVotesToQueue in democratic mode", () => {
    expect(resolveEffectiveQueueThreshold({ venueType: "bar" })).toBe(5);
    expect(resolveEffectiveQueueThreshold({ venueType: "party", partyMode: "hybrid_turbo", minVotesToQueue: 1 })).toBe(1);
    expect(resolveEffectiveQueueThreshold({ venueType: "party", partyMode: "democratic", minVotesToQueue: 4 })).toBe(4);
  });

  it("partitions items directly into activeQueue when party threshold is 1", () => {
    const items = [
      { id: "1", voteCount: 1, createdAt: "2026-11-04T20:00:00Z", status: "proposed" },
    ];
    const { activeQueue, candidateProposals } = partitionQueueAndProposals(items, [], 1);
    expect(activeQueue).toHaveLength(1);
    expect(candidateProposals).toHaveLength(0);
  });

  it("respects custom minVotesToQueue > 1 in democratic party mode", () => {
    const items = [
      { id: "1", voteCount: 2, createdAt: "2026-11-04T20:00:00Z", status: "proposed" },
      { id: "2", voteCount: 3, createdAt: "2026-11-04T20:01:00Z", status: "proposed" },
    ];
    const { activeQueue, candidateProposals } = partitionQueueAndProposals(items, [], 3);
    expect(activeQueue.map((i) => i.id)).toEqual(["2"]);
    expect(candidateProposals.map((i) => i.id)).toEqual(["1"]);
  });

  it("enforces optional votesPerGuest limit in democratic mode and unlimited when 0", () => {
    expect(
      canGuestCastVote({ ...DEFAULT_PARTY_CONFIG, partyMode: "democratic", votesPerGuest: 0 }, 0),
    ).toEqual({ allowed: true });
    expect(
      canGuestCastVote({ ...DEFAULT_PARTY_CONFIG, partyMode: "democratic", votesPerGuest: 5 }, 2),
    ).toEqual({ allowed: true });
    expect(
      canGuestCastVote({ ...DEFAULT_PARTY_CONFIG, partyMode: "democratic", votesPerGuest: 5 }, 0),
    ).toEqual({
      allowed: false,
      reason: "Usaste todos tus votos disponibles. Pedile al anfitrión que recargue los votos.",
    });
  });

  it("parses legacy bar nightState without partyConfig and party nightState with dedication/karaoke", () => {
    const parsed = nightStateSchema.parse({
      venue: { id: "v1", slug: "cumple-tincho", name: "Cumple Tincho", accentColor: "#ec4899", logoUrl: null, joinMessage: null },
      night: { id: "n1", status: "open", openedAt: "2026-11-04T20:00:00Z" },
      nowPlaying: {
        id: "q1",
        trackId: "t1",
        title: "La Morocha",
        artist: "Luck Ra",
        source: "youtube",
        durationSeconds: 180,
        thumbnailUrl: null,
        voteCount: 4,
        createdAt: "2026-11-04T20:00:00Z",
        status: "playing",
        myVote: false,
        guestName: "Franco",
        dedication: "¡Feliz cumple amigo!",
        isKaraoke: true,
      },
      queue: [],
      me: { participantId: "p1", credits: 99999, proposalsUsed: 0 },
      settings: {
        proposalsEnabled: true,
        explicitFilterEnabled: false,
        maxQueueSize: 100,
        maxProposalsPerParticipant: 999,
        maxSongDurationSeconds: 900,
        defaultCreditsPerCode: 999,
        maxCreditsPerCode: 999,
      },
      partyConfig: {
        venueType: "party",
        partyMode: "democratic",
        votesPerGuest: 5,
        minVotesToQueue: 2,
        allowDedications: true,
        allowGuestKaraoke: true,
        turboCooldownSeconds: 180,
      },
      serverTime: "2026-11-04T20:05:00Z",
    });
    expect(parsed.partyConfig?.venueType).toBe("party");
    expect(parsed.nowPlaying?.guestName).toBe("Franco");
    expect(parsed.nowPlaying?.dedication).toBe("¡Feliz cumple amigo!");
    expect(parsed.nowPlaying?.isKaraoke).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/party-domain.test.ts`
Expected: FAIL with module `@/lib/domain/party` not found.

- [ ] **Step 3: Implement `src/lib/domain/party.ts`, update `src/lib/api/contracts.ts` and `src/lib/domain/queue.ts`**

Create `src/lib/domain/party.ts` with `PartyConfig`, `DEFAULT_PARTY_CONFIG`, `resolveEffectiveQueueThreshold`, `canGuestCastVote`, and `sanitizeDedication(text?: string | null): string | null`. Update `queue.ts` so `partitionQueueAndProposals` uses the passed `threshold` even when `candidateItems` are provided from the backend if `threshold <= 1` or when items in `candidateItems` already meet `voteCount >= threshold`. Update `contracts.ts` to add optional `guestName`, `dedication`, `isKaraoke` to `queueItemViewSchema` and optional `partyConfig` to `nightStateSchema`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/party-domain.test.ts`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/party.ts src/lib/api/contracts.ts src/lib/domain/queue.ts tests/unit/party-domain.test.ts
git commit -m "feat(party): add party domain rules, zod contracts and dynamic queue thresholds"
```

---

### Task 2: Migración SQL de Supabase y API de Configuración / Acciones de Fiesta

**Files:**
- Create: `supabase/migrations/20261105010000_party_mode_system.sql`
- Create: `src/lib/api/party-control.ts`
- Modify: `src/lib/api/proposals.ts`
- Test: `tests/unit/party-control.test.ts`

**Interfaces:**
- Consumes: `PartyConfig`, `PartyMode`, `VenueType` from `src/lib/domain/party.ts`
- Produces:
  - `updatePartyConfig(slug: string, patch: Partial<PartyConfig>): Promise<PartyConfig>`
  - `resetPartyGuestVotes(slug: string): Promise<{ ok: boolean; creditsResetTo: number }>`
  - `castPartyTurboVote(slug: string, queueItemId: string): Promise<{ itemId: string; voteCount: number }>`
  - `triggerPartyDuel(slug: string, trackA: QueueItemView, trackB: QueueItemView, durationSeconds?: number): Promise<void>`
  - `triggerPartyRoulette(slug: string, candidates: QueueItemView[], winner: QueueItemView): Promise<void>`
  - Updated `proposeTrack` in `src/lib/api/proposals.ts` accepting `guestName?: string`, `dedication?: string`, `isKaraoke?: boolean`

- [ ] **Step 1: Write the failing test in `tests/unit/party-control.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import {
  buildPartyBroadcastPayload,
  normalizePartyConfigPatch,
} from "@/lib/api/party-control";

describe("Party Control API & Broadcast Helpers", () => {
  it("normalizes party config patch clamping negative votesPerGuest to 0 and minVotesToQueue to >= 1", () => {
    const patch = normalizePartyConfigPatch({
      venueType: "party",
      partyMode: "democratic",
      votesPerGuest: -3,
      minVotesToQueue: 0,
    });
    expect(patch.votesPerGuest).toBe(0);
    expect(patch.minVotesToQueue).toBe(1);
  });

  it("builds duel and roulette realtime payloads cleanly", () => {
    const duel = buildPartyBroadcastPayload("party_duel_start", {
      duelId: "d-1",
      durationSeconds: 30,
    });
    expect(duel.event).toBe("party_event");
    expect(duel.payload.type).toBe("party_duel_start");
    expect(duel.payload.durationSeconds).toBe(30);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/party-control.test.ts`
Expected: FAIL with `@/lib/api/party-control` not found.

- [ ] **Step 3: Implement `supabase/migrations/20261105010000_party_mode_system.sql`, `src/lib/api/party-control.ts` and update `src/lib/api/proposals.ts`**

Create the SQL migration adding `venue_type`, `party_mode`, `party_votes_per_guest`, `party_min_votes_to_queue`, `allow_dedications`, `allow_guest_karaoke`, `turbo_cooldown_seconds` to `venue_settings`; `guest_name`, `dedication`, `is_karaoke` to `queue_items`; and updating `join_night`, `propose_track`, `cast_vote`, `get_night_state`, plus adding `update_party_settings`, `reset_party_guest_votes`, and `cast_party_turbo_vote`. Implement `src/lib/api/party-control.ts` with Supabase RPC + localStorage/Realtime broadcast fallback so it works seamlessly both with and without migration applied in local/demo environments.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/party-control.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261105010000_party_mode_system.sql src/lib/api/party-control.ts src/lib/api/proposals.ts tests/unit/party-control.test.ts
git commit -m "feat(party): add supabase migration and party control API with realtime events"
```

---

### Task 3: Selector Bar vs Fiesta en Registro (`/signup`), Panel Minimalista (`PanelShell`) y Ajustes

**Files:**
- Modify: `src/app/signup/page.tsx`
- Modify: `src/app/api/auth/register-owner/route.ts`
- Modify: `src/components/panel/panel-shell.tsx`
- Modify: `src/app/panel/[slug]/ajustes/page.tsx`
- Test: `tests/unit/party-panel-shell.test.tsx`

**Interfaces:**
- Consumes: `PartyConfig`, `VenueType` from `src/lib/domain/party.ts`, `updatePartyConfig` from `src/lib/api/party-control.ts`
- Produces:
  - Selector visual `venueType: 'bar' | 'party'` en `/signup` y persistencia en `/api/auth/register-owner`
  - `PanelShell` que oculta `"Códigos"` y `"Personal"` cuando `venueType === 'party'` y muestra el badge `"🎉 MODO FIESTA"`
  - Selector en `/panel/[slug]/ajustes` para alternar entre modo **Bar Comercial** y **Fiesta / Cumpleaños / Joda** y configurar parámetros de fiesta

- [ ] **Step 1: Write the failing test in `tests/unit/party-panel-shell.test.tsx`**

```tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getVisiblePanelNavItems } from "@/components/panel/panel-shell";

describe("PanelShell navigation items by venueType", () => {
  it("returns all 5 sections for bar mode", () => {
    const items = getVisiblePanelNavItems("bar");
    expect(items.map((i) => i.segment)).toEqual(["", "/codigos", "/catalogo", "/personal", "/ajustes"]);
  });

  it("hides /codigos and /personal in party mode leaving minimalist 3-item navigation", () => {
    const items = getVisiblePanelNavItems("party");
    expect(items.map((i) => i.segment)).toEqual(["", "/catalogo", "/ajustes"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/party-panel-shell.test.tsx`
Expected: FAIL with `getVisiblePanelNavItems` not exported.

- [ ] **Step 3: Implement `getVisiblePanelNavItems` in `panel-shell.tsx`, update `signup/page.tsx`, `register-owner/route.ts` and `ajustes/page.tsx`**

Export `getVisiblePanelNavItems(venueType: VenueType)` in `src/components/panel/panel-shell.tsx`, read the venue's `partyConfig.venueType` (from `useVenueNight` / `party-control`), hide `"Códigos"` and `"Personal"` when `venueType === "party"`, and add the selector in `/signup` and `/panel/[slug]/ajustes`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/party-panel-shell.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/panel/panel-shell.tsx src/app/signup/page.tsx src/app/api/auth/register-owner/route.ts src/app/panel/[slug]/ajustes/page.tsx tests/unit/party-panel-shell.test.tsx
git commit -m "feat(party): add bar vs party selector on signup, minimalist panel nav and settings"
```

---

### Task 4: Barra de Control de Modos de Fiesta en la Cabina (`PartyModeControlBar`)

**Files:**
- Create: `src/components/panel/party-mode-control-bar.tsx`
- Modify: `src/components/panel/night-dashboard.tsx`
- Test: `tests/unit/party-mode-control-bar.test.tsx`

**Interfaces:**
- Consumes: `PartyConfig`, `PartyMode` from `src/lib/domain/party.ts`, `updatePartyConfig`, `resetPartyGuestVotes`, `triggerPartyDuel`, `triggerPartyRoulette` from `src/lib/api/party-control.ts`
- Produces:
  - `PartyModeControlBar` component integrated into `NightDashboard` when `venueType === 'party'` (plus a quick button to switch to Party Mode if desired)
  - Live switching between **🗳️ Democrático**, **🔥 Híbrido Turbo**, and **🎰 Duelos y Ruleta**
  - In **🗳️ Democrático**: live controls for **Límite de votos por persona** (`Ilimitado`, `3`, `5`, `10`, o valor manual + botón `"🔄 Recargar votos a todos"`) and **Votos para que la canción suba** (`1 (Directo)`, `2`, `3`, `5`, `8`, o valor manual)
  - In **🎰 Duelos y Ruleta**: buttons `"⚡ Lanzar Duelo 1v1 (30s)"` and `"🎡 Girar Ruleta en TV"`
  - Modal de **Cartel QR / Link de Invitación de Fiesta** para compartir rápido a los invitados

- [ ] **Step 1: Write the failing test in `tests/unit/party-mode-control-bar.test.tsx`**

```tsx
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
    expect(screen.getByText(/Votos para que la canción suba/i)).toBeInTheDocument();

    const reloadBtn = screen.getByRole("button", { name: /Recargar votos a todos/i });
    fireEvent.click(reloadBtn);
    expect(onReloadVotes).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/party-mode-control-bar.test.tsx`
Expected: FAIL with `@/components/panel/party-mode-control-bar` not found.

- [ ] **Step 3: Implement `src/components/panel/party-mode-control-bar.tsx` and integrate into `src/components/panel/night-dashboard.tsx`**

Build `PartyModeControlBar` with the 3 mode tabs, the Democratic Mode controls (`votesPerGuest`, `minVotesToQueue`, `"🔄 Recargar votos a todos"`), the Party Games triggers (`"⚡ Lanzar Duelo 1v1"` & `"🎡 Girar Ruleta en TV"`), and the QR Invitation modal. Render it in `NightDashboard` and display `guestName`, `dedication`, and `isKaraoke` badges on queue cards.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/party-mode-control-bar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/panel/party-mode-control-bar.tsx src/components/panel/night-dashboard.tsx tests/unit/party-mode-control-bar.test.tsx
git commit -m "feat(party): add PartyModeControlBar with democratic controls, duels and roulette triggers"
```

---

### Task 5: Experiencia del Invitado Todo Desbloqueado (`/p/[slug]`) y Pantalla TV (`/player/[slug]`)

**Files:**
- Modify: `src/components/client/client-night-screen.tsx`
- Modify: `src/components/client/parts/proposal-search.tsx`
- Modify: `src/components/client/parts/queue-list.tsx`
- Modify: `src/components/player/player-screen.tsx`
- Modify: `src/app/api/tv/[slug]/route.ts`
- Test: `tests/unit/party-guest-and-tv.test.tsx`

**Interfaces:**
- Consumes: `PartyConfig`, `QueueItemView` from `src/lib/api/contracts.ts`, `castPartyTurboVote` from `src/lib/api/party-control.ts`
- Produces:
  - En `ClientNightScreen` (`venueType === 'party'`):
    - Sin caja de códigos de mozo; barra de bienvenida festiva con input de **Tu Nombre / Apodo**, indicador del modo activo (*Democrático*, *Híbrido con Fueguitos 🔥*, *Duelos y Ruleta 🎰*), contador de votos disponibles (si `votesPerGuest > 0`) o contador de **🔥 Fueguitos Turbo** recargables.
    - Modal interactivo en vivo cuando el anfitrión lanza un **⚡ Duelo 1 vs 1** para votar por Tema A o Tema B.
  - En `ProposalSearch`:
    - Switch **"🎤 Quiero cantarla en Karaoke"** y campo **"💬 Dedicatoria / Mensaje para la TV"** cuando `venueType === 'party'`.
  - En `PlayerScreen` y `/api/tv/[slug]`:
    - Banner de **Dedicatoria y Karaoke con Nombre** cuando suena un tema (`nowPlaying`), y overlays visuales en vivo para **⚡ Duelo 1 vs 1** y **🎡 Ruleta Fiestera**.

- [ ] **Step 1: Write the failing test in `tests/unit/party-guest-and-tv.test.tsx`**

```tsx
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProposalSearch } from "@/components/client/parts/proposal-search";

vi.mock("@/lib/api/youtube", () => ({
  searchYoutubeVideos: vi.fn().mockResolvedValue([
    {
      youtubeVideoId: "yt123456789",
      title: "Tu Turrito",
      artist: "Rei, Callejero Fino",
      durationSeconds: 195,
      thumbnailUrl: "https://example.com/thumb.jpg",
    },
  ]),
}));

describe("Party Guest ProposalSearch with Dedication and Karaoke", () => {
  it("allows guest to enter dedication and toggle karaoke before proposing a track in party mode", async () => {
    const onPropose = vi.fn().mockResolvedValue(undefined);
    render(
      <ProposalSearch
        slug="cumple-tincho"
        queuedTrackIds={new Set()}
        queuedVideoIds={new Set()}
        credits={99999}
        isPartyMode={true}
        defaultGuestName="Franco"
        allowDedications={true}
        allowGuestKaraoke={true}
        onPropose={onPropose}
      />,
    );

    const dedicationInput = screen.getByPlaceholderText(/Feliz cumple/i);
    fireEvent.change(dedicationInput, { target: { value: "¡Feliz cumple Tincho! 🍻" } });

    const karaokeToggle = screen.getByRole("checkbox", { name: /Karaoke/i });
    fireEvent.click(karaokeToggle);

    const searchInput = screen.getByPlaceholderText(/Buscar en YouTube/i);
    fireEvent.change(searchInput, { target: { value: "Tu Turrito" } });

    const proposeBtn = await screen.findByRole("button", { name: /Pedir|Agregar/i });
    fireEvent.click(proposeBtn);

    expect(onPropose).toHaveBeenCalledWith(
      expect.objectContaining({
        youtubeVideoId: "yt123456789",
        guestName: "Franco",
        dedication: "¡Feliz cumple Tincho! 🍻",
        isKaraoke: true,
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/party-guest-and-tv.test.tsx`
Expected: FAIL because `isPartyMode`, `dedication`, and `isKaraoke` props do not exist on `ProposalSearch`.

- [ ] **Step 3: Implement Party Mode enhancements in `proposal-search.tsx`, `queue-list.tsx`, `client-night-screen.tsx`, `player-screen.tsx` and `/api/tv/[slug]/route.ts`**

Add the guest nickname, dedication input, karaoke switch, turbo vote button (`🔥 +3`), democratic vote counter, and live 1v1 Duel / Roulette overlays across the guest screen and TV player.

- [ ] **Step 4: Run full test suite and production build to verify everything passes**

Run: `npm test && npm run build`
Expected: All unit tests PASS and Next.js production build succeeds with exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/client/ src/components/player/ src/app/api/tv/ tests/unit/party-guest-and-tv.test.tsx
git commit -m "feat(party): unlock guest experience with dedications, karaoke, turbo votes and TV duel/roulette overlays"
```

