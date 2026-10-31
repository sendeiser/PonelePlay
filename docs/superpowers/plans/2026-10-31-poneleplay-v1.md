# PonelePlay v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship PonelePlay v1: a QR voting experience for clients, an operations panel for the bar, and a full-screen player that turns the winning queue into music.

**Architecture:** Next.js 15 hosts three surfaces. Supabase is the source of truth: Postgres with RLS, RPCs for every client mutation, Edge Functions for YouTube, staff tokens, and player tokens. Clients and the panel read with Realtime plus a polling fallback; the player polls an Edge Function with a revocable device token. The existing mockups in `src/components/client`, `src/components/panel`, and `src/components/player` are the visual baseline; this plan replaces demo state with the real contracts without changing the design language.

**Tech Stack:** Next.js 15.5.28, React 19.1, TypeScript 5, Tailwind CSS v4, Supabase (Postgres, Auth anónimo, Realtime, Storage, Edge Functions), Vitest 5, Testing Library, pgTAP, Playwright, Vercel.

**Spec:** `docs/specs/01-arquitectura-y-spec.md`

## Global Constraints

- UI copy is Spanish (es-AR); code identifiers are English.
- Client viewport minimum 360 px; interactive targets at least 44 × 44 px. Panel minimum 1280 px. Player is TV-first at 1440 × 900 and must remain legible at 3–5 m.
- One `open` night per venue, enforced by `night_one_open_per_venue`; a second open is rejected.
- 1 credit = 1 vote. No free votes. No refunds for skip, veto, or playback failure.
- Vote codes are 8 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`; credits per code are 1–50; codes expire when the night closes.
- Queue order is `vote_count DESC, created_at ASC`; one vote per participant per track per night; a track cannot be voted twice by the same participant even if re-queued.
- Proposals are free, enter the queue immediately, max 3 per participant per night and 1 every 30 seconds; queue maximum 30 active items.
- YouTube proposals: region AR, top 10, no live, embeddable, duration ≤ `max_song_duration_seconds` (default 480 s). Links may be `watch?v=`, `youtu.be`, or `shorts`; proposals by link do not consume YouTube search quota.
- Staff PIN is 6 digits, bcrypt cost 10; 5 failures in 15 minutes lock the PIN for 15 minutes; sessions last 12 hours and are revocable.
- Player polls every 5 s, heartbeats every 15 s; “connected” means `last_seen_at < 45 s`. MP3 signed URLs live 15 minutes. Fallback playlist loops in explicit order.
- Realtime is the fast path; if the socket drops, clients poll every 10 s and show an offline banner.
- `SUPABASE_SERVICE_ROLE_KEY`, `YOUTUBE_API_KEY`, staff tokens, and player tokens never reach the browser bundle. Clients mutate only through RPC/Edge Functions.
- Follow the existing “Fieltro y Neón” tokens in `src/app/globals.css`; do not introduce a second palette. Respect `prefers-reduced-motion`.
- Node 24.15 or newer is required by `jsdom@30`; if the runner stays on 24.14, pin `jsdom` to a compatible 26.x release before starting.
- Every task ends with `npm run typecheck`, its focused test run, and a commit. Full `npm run lint && npm run test && npm run build` runs before the phase gate.

## Review Focus

- **Concurrent money/queue changes:** two clients redeeming the same code or voting with one credit at the same time must produce exactly one success and one explicit failure, never double credit, double spend, or a lost vote count. Tests: Task 17 (redeem), Task 18 (vote), Task 25 (E2E parallel RPCs).
- **Realtime loss and offline clients:** when the WebSocket drops, the queue must keep moving via 10 s polling, actions must be disabled with a clear banner, and the player must keep its current song and resync later. Tests: Task 10 (hook fallback), Task 22 (player reconnect), Task 25 (network-off E2E).
- **YouTube reality:** live videos, videos over 8 minutes, non-embeddable videos, private videos, and IFrame errors must be rejected at proposal time or auto-skipped at playback with a panel warning. Tests: Task 3 (pure validation), Task 13 (proposal), Task 21 (playback failure), Task 25 (test-mode E2E).
- **Token and role leakage:** staff tokens expire after 12 h, player tokens are revocable, `pin_hash` is never returned, and privileged accounts cannot vote or join as participants. Tests: Task 5 (RLS/privileged writes), Task 7 (staff auth), Task 20 (player auth), Task 25 (bundle secret scan).
- **Upload and content validation:** an MP3 upload with a spoofed MIME, wrong size, or explicit title must not enter the catalog; the explicit filter must normalize accents/case and avoid false positives. Tests: Task 2 (explicit filter), Task 14 (upload validation and storage RLS), Task 25 (E2E).

## Execution Prerequisites

These are blocked today; the foundation tasks cannot be fully verified until they are resolved.

- Docker Desktop installed and running, then `npx supabase start` and `npx supabase db reset`.
- A Supabase project (or the local stack) with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
- `YOUTUBE_API_KEY` available to Edge Functions; `RATE_LIMIT_SALT` generated with 32 random bytes.
- `npx playwright install chromium` once.
- Node ≥ 24.15 (or pin `jsdom` to 26.x).

## File Structure

- `src/lib/domain/` — pure rules with no I/O: codes, queue, explicit filter, YouTube URLs/metadata, player state, upload validation.
- `src/lib/api/` — typed clients and contracts: Supabase browser/server/admin, RPC wrappers, Edge Function wrappers, error mapping.
- `src/hooks/` — `use-night-state`, `use-player-runtime`, staff session, permissions.
- `src/components/client/` — real client surfaces; extract reusable pieces from `client-demo.tsx`.
- `src/components/panel/` — panel shell, night dashboard, catalog, codes, staff, settings.
- `src/components/player/` — playback engines and the real player screen.
- `src/app/` — routes: `/p/[slug]`, `/panel/[slug]` plus subroutes, `/player/[slug]`, `/login`, `/signup`.
- `supabase/migrations/` — schema (already present) plus one migration per phase task.
- `supabase/functions/` — `_shared/` helpers and `staff`, `youtube-search`, `propose-track`, `player`.
- `supabase/tests/` — pgTAP RLS, RPC, and concurrency tests.
- `tests/e2e/` — Playwright flows; `tests/unit/` reserved for cross-module tests.

---

## Phase F0 · Base

### Task 1: Test Harness and Vote-Code Domain

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Create: `src/lib/domain/codes.ts`
- Create: `src/lib/domain/codes.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `CODE_ALPHABET`, `CODE_LENGTH`, `generateCode(random?: () => number): string`, `normalizeCode(input: string): string`, `isValidCode(code: string): boolean`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { CODE_ALPHABET, CODE_LENGTH, generateCode, isValidCode, normalizeCode } from "./codes";

describe("vote codes", () => {
  it("generates eight characters from the unambiguous alphabet", () => {
    const sequence = [0, 1, 2, 3, 4, 5, 6, 7];
    let cursor = 0;
    const code = generateCode(() => sequence[cursor++] / 32);
    expect(code).toBe("ABCDEFGH");
    expect(code).toHaveLength(CODE_LENGTH);
    expect(CODE_ALPHABET).not.toMatch(/[IO01]/);
  });

  it("normalizes dictation and strips separators", () => {
    expect(normalizeCode(" ab-cd efgh ")).toBe("ABCDEFGH");
  });

  it("rejects ambiguous or wrong-length codes", () => {
    expect(isValidCode("ABCDEFG0")).toBe(false);
    expect(isValidCode("IIIIIIII")).toBe(false);
    expect(isValidCode("ABCDEFG")).toBe(false);
    expect(isValidCode("ABCDEFGH")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run src/lib/domain/codes.test.ts`
Expected: FAIL because `src/lib/domain/codes.ts` does not exist.

- [ ] **Step 3: Configure Vitest and implement the code domain**

`vitest.config.ts` must use `@vitejs/plugin-react`, alias `@` to `./src`, `environment: "jsdom"`, `setupFiles: ["./tests/setup.ts"]`, and include `src/**/*.test.{ts,tsx}` plus `supabase/functions/_shared/**/*.test.ts`.

`tests/setup.ts` imports `@testing-library/jest-dom/vitest`.

`src/lib/domain/codes.ts` exports:

```ts
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 8;
export function generateCode(random: () => number = Math.random): string;
export function normalizeCode(input: string): string;
export function isValidCode(code: string): boolean;
```

`generateCode` uses `Math.floor(random() * CODE_ALPHABET.length)` without modulo bias for this alphabet length; `normalizeCode` uppercases and removes every character outside `A–Z0–9`; `isValidCode` checks exact length and alphabet membership.

Add `"test:db": "supabase test db"` and `"test:unit": "vitest run"` to `package.json` scripts.

- [ ] **Step 4: Run tests and static checks**

Run: `npx vitest run src/lib/domain/codes.test.ts && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add package.json vitest.config.ts tests/setup.ts src/lib/domain/codes.ts src/lib/domain/codes.test.ts
git commit -m "test: add vote-code domain and vitest harness"
```

### Task 2: Queue Ordering and Explicit Filter

**Files:**
- Create: `src/lib/domain/queue.ts`
- Create: `src/lib/domain/queue.test.ts`
- Create: `src/lib/domain/explicit.ts`
- Create: `src/lib/domain/explicit.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type QueueCandidate = { id: string; voteCount: number; createdAt: string }`
  - `compareQueue(a: QueueCandidate, b: QueueCandidate): number`
  - `sortQueue<T extends QueueCandidate>(items: T[]): T[]`
  - `normalizeForMatch(input: string): string`
  - `findExplicitKeyword(text: string, keywords: string[]): string | null`
  - `DEFAULT_EXPLICIT_KEYWORDS: readonly string[]`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { sortQueue } from "./queue";

it("orders by votes desc, then oldest proposal first", () => {
  const items = [
    { id: "newer", voteCount: 4, createdAt: "2026-10-31T21:10:00Z" },
    { id: "older", voteCount: 4, createdAt: "2026-10-31T21:05:00Z" },
    { id: "leader", voteCount: 7, createdAt: "2026-10-31T21:20:00Z" },
  ];
  expect(sortQueue(items).map((item) => item.id)).toEqual(["leader", "older", "newer"]);
});
```

```ts
import { describe, expect, it } from "vitest";
import { findExplicitKeyword, normalizeForMatch } from "./explicit";

it("normalizes accents and case", () => {
  expect(normalizeForMatch("  PÚTA  Madre ")).toBe("puta madre");
});

it("matches whole words only", () => {
  expect(findExplicitKeyword("La Puta Madre", ["puta"])).toBe("puta");
  expect(findExplicitKeyword("FUCK this", ["fuck"])).toBe("fuck");
  expect(findExplicitKeyword("Sexto sentido", ["sex"])).toBeNull();
});
```

- [ ] **Step 2: Run both tests and verify they fail**

Run: `npx vitest run src/lib/domain/queue.test.ts src/lib/domain/explicit.test.ts`
Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement the pure rules**

`queue.ts` compares `voteCount` descending and ISO `createdAt` ascending; `sortQueue` returns a new sorted array.

`explicit.ts` normalizes with `normalize("NFD").replace(/\p{Diacritic}/gu, "")`, lowercasing and collapsing whitespace. It builds a Unicode-aware boundary regex per keyword: `(^|[^\\p{L}\\p{N}])keyword($|[^\\p{L}\\p{N}])`. It returns the matched keyword exactly as provided in the list or `null`. Default keywords come from the spec’s base list in Spanish/English.

- [ ] **Step 4: Run tests and static checks**

Run: `npx vitest run src/lib/domain/queue.test.ts src/lib/domain/explicit.test.ts && npm run typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/queue.ts src/lib/domain/queue.test.ts src/lib/domain/explicit.ts src/lib/domain/explicit.test.ts
git commit -m "test: add queue ordering and explicit-filter rules"
```

### Task 3: YouTube and Player Domain

**Files:**
- Create: `src/lib/domain/youtube.ts`
- Create: `src/lib/domain/youtube.test.ts`
- Create: `src/lib/domain/player.ts`
- Create: `src/lib/domain/player.test.ts`

**Interfaces:**
- Consumes: `maxSongDurationSeconds` from venue settings.
- Produces:
  - `parseYoutubeVideoId(input: string): string | null`
  - `youtubeDedupeKey(videoId: string): string`
  - `type YoutubeMeta = { videoId: string; title: string; channelTitle: string; durationSeconds: number; thumbnailUrl: string; embeddable: boolean; isLive: boolean }`
  - `validateYoutubeMeta(meta: YoutubeMeta, maxDurationSeconds: number): "live" | "not_embeddable" | "too_long" | null`
  - `type PlaybackStatus = "idle" | "playing" | "failed" | "ended"`
  - `type PlaybackState = { status: PlaybackStatus; currentId: string | null; failures: number }`
  - `type PlaybackEvent = { type: "start"; id: string } | { type: "ended" } | { type: "failed" } | { type: "skip"; nextId: string | null } | { type: "reset" }`
  - `reducePlayback(state: PlaybackState, event: PlaybackEvent): PlaybackState`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { parseYoutubeVideoId, validateYoutubeMeta, youtubeDedupeKey } from "./youtube";

it("normalizes every supported YouTube URL shape", () => {
  expect(parseYoutubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  expect(parseYoutubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=10")).toBe("dQw4w9WgXcQ");
  expect(parseYoutubeVideoId("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  expect(parseYoutubeVideoId("https://vimeo.com/123")).toBeNull();
  expect(youtubeDedupeKey("dQw4w9WgXcQ")).toBe("yt:dQw4w9WgXcQ");
});

it("rejects live, non-embeddable, and overlong videos", () => {
  const meta = { videoId: "x", title: "t", channelTitle: "c", durationSeconds: 300, thumbnailUrl: "", embeddable: true, isLive: false };
  expect(validateYoutubeMeta(meta, 480)).toBeNull();
  expect(validateYoutubeMeta({ ...meta, isLive: true }, 480)).toBe("live");
  expect(validateYoutubeMeta({ ...meta, embeddable: false }, 480)).toBe("not_embeddable");
  expect(validateYoutubeMeta({ ...meta, durationSeconds: 481 }, 480)).toBe("too_long");
});
```

```ts
import { describe, expect, it } from "vitest";
import { reducePlayback } from "./player";

it("moves through playing, ended, failed, and skip", () => {
  const idle = { status: "idle" as const, currentId: null, failures: 0 };
  const playing = reducePlayback(idle, { type: "start", id: "a" });
  expect(playing).toEqual({ status: "playing", currentId: "a", failures: 0 });
  expect(reducePlayback(playing, { type: "ended" })).toEqual({ status: "ended", currentId: null, failures: 0 });
  expect(reducePlayback(playing, { type: "failed" })).toEqual({ status: "failed", currentId: null, failures: 1 });
  expect(reducePlayback(playing, { type: "skip", nextId: "b" })).toEqual({ status: "playing", currentId: "b", failures: 0 });
  expect(reducePlayback(playing, { type: "skip", nextId: null })).toEqual({ status: "idle", currentId: null, failures: 0 });
});
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `npx vitest run src/lib/domain/youtube.test.ts src/lib/domain/player.test.ts`
Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement URL parsing, validation, and the reducer**

`parseYoutubeVideoId` accepts only `youtube.com`, `www.youtube.com`, `m.youtube.com`, and `youtu.be`; extracts an 11-character ID from `v`, the path segment, or `/shorts/`; returns `null` for anything else. `validateYoutubeMeta` checks in order: live, embeddable, duration. `reducePlayback` is a pure switch with the exact transitions above.

- [ ] **Step 4: Run tests and static checks**

Run: `npx vitest run src/lib/domain/youtube.test.ts src/lib/domain/player.test.ts && npm run typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/youtube.ts src/lib/domain/youtube.test.ts src/lib/domain/player.ts src/lib/domain/player.test.ts
git commit -m "test: add YouTube validation and player state machine"
```

### Task 4: Environment, Generated Types, Supabase Clients, and Seed

**Files:**
- Create: `src/lib/api/env.ts`
- Create: `src/lib/api/env.test.ts`
- Create: `src/lib/api/supabase/browser.ts`
- Create: `src/lib/api/supabase/server.ts`
- Create: `src/lib/api/supabase/admin.ts`
- Create: `src/lib/api/supabase/middleware.ts`
- Create: `src/middleware.ts`
- Generate: `src/lib/database.types.ts`
- Create: `supabase/seed.sql`
- Modify: `.env.example`
- Modify: `package.json` if the generated types script needs a path fix

**Interfaces:**
- Consumes: `database.types.ts` generated from the migrations.
- Produces:
  - `parsePublicEnv(source: Record<string, string | undefined>): { url: string; anonKey: string; appUrl: string }`
  - `createBrowserSupabase(): SupabaseClient<Database>`
  - `createServerSupabase(): Promise<SupabaseClient<Database>>`
  - `createAdminSupabase(): SupabaseClient<Database>`
  - `updateSession(request: NextRequest): Promise<NextResponse>`
- Seed data: venue `billar-aurora`, owner `dueno@poneleplay.demo` / `PonelePlay2026!`, staff `Luz` PIN `123456` and `Sofi` PIN `654321`, 8 tracks, one open night, one active 5-credit code `MESAPLAY`.

- [ ] **Step 1: Write the failing env test**

```ts
import { describe, expect, it } from "vitest";
import { parsePublicEnv } from "./env";

it("accepts a complete public environment", () => {
  expect(
    parsePublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    }),
  ).toEqual({
    url: "http://127.0.0.1:54321",
    anonKey: "anon",
    appUrl: "http://localhost:3000",
  });
});

it("names the missing variable", () => {
  expect(() => parsePublicEnv({})).toThrow("NEXT_PUBLIC_SUPABASE_URL");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/lib/api/env.test.ts`
Expected: FAIL because `env.ts` does not exist.

- [ ] **Step 3: Generate types, implement env/clients, and seed**

Start the stack first: `npx supabase start`, `npx supabase db reset`, then `npm run db:types`. If Docker is unavailable, stop this task and report the blocker; do not hand-write the full database type file.

`env.ts` uses Zod schemas and throws `Missing environment variable: <name>` for the first missing value. `browser.ts` uses `createBrowserClient<Database>`; `server.ts` uses `createServerClient<Database>` with the Next 15 async `cookies()` adapter and `getAll`/`setAll`; `admin.ts` starts with `import "server-only"` and reads `SUPABASE_SERVICE_ROLE_KEY`; `middleware.ts` implements the standard Supabase SSR cookie refresh and protects `/panel/:path*` except the staff-login state. The root `middleware.ts` matcher is `["/panel/:path*"]`.

`supabase/seed.sql` inserts the demo auth owner, venue, settings, two staff members with bcrypt hashes, 8 tracks, one open night, and the `MESAPLAY` code. Use fixed UUIDs so tests can reference them. Auth rows must include `auth.users` and `auth.identities` so the owner can sign in locally.

- [ ] **Step 4: Verify env test, build, and a local API call**

Run: `npx vitest run src/lib/api/env.test.ts && npm run typecheck && npm run build`
Expected: all pass. Then call `curl "http://127.0.0.1:54321/rest/v1/venues?select=slug" -H "apikey: $ANON_KEY"` and expect `[{"slug":"billar-aurora"}]`.

- [ ] **Step 5: Commit**

```bash
git add .env.example package.json src/lib/api src/lib/database.types.ts src/middleware.ts supabase/seed.sql
git commit -m "feat: add typed Supabase clients and local seed"
```

### Task 5: RLS and pgTAP Foundation

**Files:**
- Create: `supabase/tests/000_helpers.sql`
- Create: `supabase/tests/010_rls.test.sql`
- Create: `supabase/tests/020_privileged_writes.test.sql`
- Modify: `package.json` (`test:db` already added)

**Interfaces:**
- Consumes: existing tables, policies, and `is_venue_owner`, `is_my_participant`, `is_night_open`.
- Produces: a repeatable RLS gate executed with `npm run test:db`.

- [ ] **Step 1: Write the failing RLS tests**

`000_helpers.sql` defines `tests.set_user(p_user uuid, p_anonymous boolean default false)` which sets `request.jwt.claims` and the role. `010_rls.test.sql` asserts at least:

```sql
begin;
select plan(8);
select tests.create_owner('00000000-0000-0000-0000-000000000001');
select tests.set_user('00000000-0000-0000-0000-000000000001');
select lives_ok($$ insert into public.venues (owner_id, name, slug) values ('00000000-0000-0000-0000-000000000001', 'Billar Aurora', 'billar-aurora') $$, 'owner creates venue');
select tests.set_user('00000000-0000-0000-0000-000000000002');
select throws_ok($$ insert into public.venues (owner_id, name, slug) values ('00000000-0000-0000-0000-000000000002', 'Otro', 'otro-bar') $$, '42501', null, 'client cannot create a venue');
select is((select count(*)::int from public.vote_codes), 0, 'anonymous client cannot read codes');
select is((select count(*)::int from public.staff_sessions), 0, 'client cannot read staff sessions');
select * from finish();
rollback;
```

`020_privileged_writes.test.sql` asserts that an anonymous client cannot insert into `votes`, `vote_codes`, `credit_transactions`, `staff_members`, or `queue_items`, and that the owner can read only their own venue’s codes, participants, and audit rows.

- [ ] **Step 2: Run the suite and verify it fails**

Run: `npm run test:db`
Expected: FAIL, because the helper schema and tests do not exist yet.

- [ ] **Step 3: Add helpers and make the assertions pass**

Helpers create auth users with `insert into auth.users` plus `auth.identities` as needed, and clean up with rollbacks. Do not weaken policies to make tests pass. If a policy is missing for a spec-mandated read, add a migration instead of a grant.

- [ ] **Step 4: Run the full DB suite**

Run: `npm run test:db`
Expected: `All tests successful` and no skipped RLS assertions.

- [ ] **Step 5: Commit**

```bash
git add supabase/tests
git commit -m "test: add pgTAP RLS and privileged-write coverage"
```

### Task 6: Night Lifecycle RPCs

**Files:**
- Create: `supabase/migrations/20261031220000_night_rpc.sql`
- Create: `supabase/tests/030_night_rpc.test.sql`
- Create: `src/lib/api/contracts.ts`
- Create: `src/lib/api/contracts.test.ts`

**Interfaces:**
- Consumes: tables from `20261031210000_init_schema.sql` and seed helpers.
- Produces:
  - `join_night(p_venue_slug text) returns jsonb` → `{ participantId, credits, proposalsUsed }`
  - `get_night_state(p_venue_slug text) returns jsonb` → `NightState` with camelCase keys.
  - `owner_open_night() returns jsonb` → `{ nightId, status: "open" }`
  - `owner_close_night() returns jsonb` → `{ nightId, status: "closed" }`
  - TypeScript `NightState`, `QueueItemView`, `NightPhase`, and Zod schemas in `contracts.ts`.

`NightState` shape:

```ts
type NightState = {
  venue: { id: string; slug: string; name: string; accentColor: string; logoUrl: string | null; joinMessage: string | null };
  night: { id: string; status: "open" | "closed"; openedAt: string } | null;
  nowPlaying: QueueItemView | null;
  queue: QueueItemView[];
  me: { participantId: string; credits: number; proposalsUsed: number } | null;
  settings: { proposalsEnabled: boolean; explicitFilterEnabled: boolean; maxQueueSize: number; maxProposalsPerParticipant: number; maxSongDurationSeconds: number; defaultCreditsPerCode: number; maxCreditsPerCode: number };
  serverTime: string;
};
type QueueItemView = { id: string; trackId: string; title: string; artist: string; source: "youtube" | "upload" | "spotify"; durationSeconds: number | null; thumbnailUrl: string | null; voteCount: number; createdAt: string; status: "queued" | "playing"; myVote: boolean };
```

- [ ] **Step 1: Write the failing pgTAP tests**

Assert:
- `join_night('billar-aurora')` twice with the same JWT returns the same `participantId` and 0 credits.
- `join_night` rejects a non-anonymous JWT (`is_anonymous` absent or false).
- `get_night_state` returns queue ordered by votes desc/created_at asc, `me` only for the current participant, and `nowPlaying` separated from `queue`.
- `owner_open_night()` twice: the second raises `night_already_open`.
- `owner_close_night()` sets the night `closed`, expires every `active` code of that night, writes a negative `night_close` ledger row for every positive balance, zeros balances, and writes an audit row.
- `join_night` after close raises `night_closed`.

- [ ] **Step 2: Run the focused DB test and verify it fails**

Run: `npx supabase test db supabase/tests/030_night_rpc.test.sql`
Expected: FAIL because the RPCs do not exist.

- [ ] **Step 3: Implement the SQL and TS contracts**

All three RPCs are `security definer`, `set search_path = public`, and granted to `authenticated`. `join_night` and `get_night_state` require an anonymous JWT; `owner_open_night`/`owner_close_night` require `auth.uid()` to own the venue. Use `select ... for update` around participant and code state. Build JSON with `jsonb_build_object` using camelCase keys. `get_night_state` returns only `queued` and `playing` items; the queue excludes the playing item.

`contracts.ts` defines the TS types and Zod schemas used to parse RPC results; `contracts.test.ts` rejects a state with a missing `settings` object and accepts the documented shape.

- [ ] **Step 4: Verify DB and unit tests**

Run: `npx supabase test db supabase/tests/030_night_rpc.test.sql && npx vitest run src/lib/api/contracts.test.ts && npm run typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261031220000_night_rpc.sql supabase/tests/030_night_rpc.test.sql src/lib/api/contracts.ts src/lib/api/contracts.test.ts
git commit -m "feat: add night lifecycle RPCs and contracts"
```

### Task 7: Staff Authentication

**Files:**
- Create: `supabase/migrations/20261031221000_staff_auth.sql`
- Create: `supabase/tests/040_staff_auth.test.sql`
- Create: `supabase/functions/_shared/cors.ts`
- Create: `supabase/functions/_shared/supabase-admin.ts`
- Create: `supabase/functions/_shared/staff-auth.ts`
- Create: `supabase/functions/staff/index.ts`
- Modify: `supabase/config.toml` (`[functions.staff] verify_jwt = false`)

**Interfaces:**
- Consumes: `staff_members`, `staff_sessions`, `staff_actions`.
- Produces:
  - `staff_login(p_venue_slug text, p_pin text) returns jsonb` → `{ token, expiresAt, staff: { id, name }, venue: { id, slug, name } }`
  - `staff_authorize(p_token text) returns jsonb` → `{ staffId, venueId, staffName }`
  - `staff_logout(p_token text) returns void`
  - Edge Function actions: `login`, `logout`, `night_state`.
  - Client contract: `StaffSession = { token: string; expiresAt: string; staff: { id: string; name: string }; venue: { id: string; slug: string; name: string } }`.

- [ ] **Step 1: Write the failing pgTAP tests**

Assert:
- Correct 6-digit PIN creates a session whose `expires_at` is 12 h after `created_at`.
- Five wrong PINs set `locked_until` to ~15 minutes ahead; a correct PIN during the lock returns `pin_locked` with remaining seconds.
- An expired or revoked token is rejected by `staff_authorize`.
- `pin_hash` is never returned by `staff_login`, `staff_authorize`, or the Edge Function.
- A staff member from venue A cannot authorize against venue B.

- [ ] **Step 2: Run the focused DB test and verify it fails**

Run: `npx supabase test db supabase/tests/040_staff_auth.test.sql`
Expected: FAIL because the RPCs do not exist.

- [ ] **Step 3: Implement SQL, Edge Function, and config**

Use `extensions.crypt(p_pin, pin_hash) = pin_hash` for verification and `gen_random_bytes(32)` → hex for the token; store `digest(token, 'sha256')` in `staff_sessions.token_hash`. Reset `failed_attempts` and `locked_until` on success. All RPCs are executable by `service_role` only.

The Edge Function parses `{ action, ... }`, validates with Zod, calls the RPCs with the service-role client, and returns JSON with CORS headers. It uses `x-staff-token` for subsequent actions. `night_state` returns the open night, queue, and player connection status for the staff member’s venue.

`supabase/config.toml` adds `[functions.staff]` with `verify_jwt = false`; the function performs its own token check.

- [ ] **Step 4: Verify SQL and a local Edge call**

Run: `npx supabase test db supabase/tests/040_staff_auth.test.sql`
Expected: pass. Then `npx supabase functions serve staff --no-verify-jwt` and:

```bash
curl -s -X POST http://127.0.0.1:54321/functions/v1/staff \
  -H "Content-Type: application/json" \
  -d '{"action":"login","venueSlug":"billar-aurora","pin":"123456"}'
```

Expected: JSON with a 64-character `token` and `staff.name = "Luz"`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261031221000_staff_auth.sql supabase/tests/040_staff_auth.test.sql supabase/functions supabase/config.toml
git commit -m "feat: add staff PIN authentication and edge function"
```

### Task 8: Owner Authentication and Venue Onboarding

**Files:**
- Create: `src/lib/domain/venue.ts`
- Create: `src/lib/domain/venue.test.ts`
- Create: `src/lib/api/auth.ts`
- Create: `src/app/login/page.tsx`
- Create: `src/app/signup/page.tsx`
- Create: `src/app/(auth)/auth-form.tsx`
- Modify: `src/app/panel/[slug]/page.tsx`
- Modify: `src/middleware.ts`

**Interfaces:**
- Consumes: Supabase SSR clients, `parsePublicEnv`.
- Produces:
  - `slugifyVenueName(input: string): string`
  - `signInOwner(email: string, password: string): Promise<{ error?: string }>`
  - `signUpOwner(input: { email; password; venueName; slug }): Promise<{ error?: string; slug?: string }>`
  - `signOutOwner(): Promise<void>`
  - Auth routes `/login`, `/signup`.

- [ ] **Step 1: Write the failing venue-slug test**

```ts
import { expect, it } from "vitest";
import { slugifyVenueName } from "./venue";

it("creates a URL-safe venue slug", () => {
  expect(slugifyVenueName("Billar Aurora!")).toBe("billar-aurora");
  expect(slugifyVenueName("  Café  y  Billar  ")).toBe("cafe-y-billar");
  expect(slugifyVenueName("###")).toBe("");
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run src/lib/domain/venue.test.ts`
Expected: FAIL because `venue.ts` does not exist.

- [ ] **Step 3: Implement auth, slug, and guards**

`slugifyVenueName` normalizes accents, lowercases, replaces non-alphanumerics with `-`, and trims dashes. `signUpOwner` calls `supabase.auth.signUp`, then inserts a venue with `owner_id = user.id`; a duplicate slug returns `Ese slug ya está en uso.`. `signInOwner` uses `signInWithPassword`.

Build accessible forms with labels, `role="alert"` for errors, and at least 44 px targets. Both pages use the “Fieltro y Neón” tokens and link to each other. On success, redirect to `/panel/<slug>`.

The panel page server component calls `createServerSupabase()`, gets the user, and redirects to `/login` when absent. Client `/p/[slug]` stays public. Middleware refreshes cookies and protects the panel route.

- [ ] **Step 4: Verify tests and build**

Run: `npx vitest run src/lib/domain/venue.test.ts && npm run typecheck && npm run build`
Expected: pass; visiting `/panel/billar-aurora` without a session redirects to `/login`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/venue.ts src/lib/domain/venue.test.ts src/lib/api/auth.ts src/app/login src/app/signup src/app/panel src/middleware.ts
git commit -m "feat: add owner authentication and venue onboarding"
```

### Task 9: Panel Shell and Staff Login

**Files:**
- Create: `src/lib/api/staff.ts`
- Create: `src/lib/domain/permissions.ts`
- Create: `src/lib/domain/permissions.test.ts`
- Create: `src/components/panel/panel-shell.tsx`
- Create: `src/components/panel/staff-login.tsx`
- Create: `src/components/ui/confirm-dialog.tsx`
- Modify: `src/app/panel/[slug]/page.tsx`
- Modify: `src/components/panel/panel-demo.tsx`

**Interfaces:**
- Consumes: `StaffSession`, staff Edge Function, owner session, `NightState`.
- Produces:
  - `staffLogin(slug: string, pin: string): Promise<StaffSession>`
  - `staffLogout(token: string): Promise<void>`
  - `staffInvoke<T>(token: string, body: StaffAction): Promise<T>`
  - `getPanelRole(owner: boolean, staffSession: StaffSession | null): "owner" | "staff" | "guest"`
  - `panelNavFor(role: PanelRole): PanelNavItem[]`
  - `ConfirmDialog` with `title`, `description`, `confirmLabel`, `onConfirm`, `onCancel`.

- [ ] **Step 1: Write the failing permission test**

```ts
import { expect, it } from "vitest";
import { panelNavFor } from "./permissions";

it("staff only sees night and codes", () => {
  expect(panelNavFor("staff").map((item) => item.href)).toEqual([
    "/panel/billar-aurora",
    "/panel/billar-aurora/codigos",
  ]);
});

it("owner sees the full panel", () => {
  expect(panelNavFor("owner").map((item) => item.label)).toEqual([
    "Noche",
    "Catálogo",
    "Códigos",
    "Personal",
    "Ajustes",
  ]);
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run src/lib/domain/permissions.test.ts`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the shell and staff login**

`staffLogin` calls the Edge Function with `{ action: "login", venueSlug: slug, pin }`, validates the response with Zod, stores it in `sessionStorage` under `poneleplay.staff.<slug>`, and returns it. `staffInvoke` adds `x-staff-token`. A custom event or React context updates the shell after login/logout.

`PanelShell` renders the existing sidebar and header from `panel-demo.tsx` but accepts `role` and `children`. Owner nav shows five items; staff nav shows only Noche and Códigos. The guest state renders `StaffLogin` with a 6-digit PIN input (`inputMode="numeric"`, maxLength 6) and a link to owner `/login`.

`ConfirmDialog` is an accessible modal (`role="dialog"`, `aria-modal`, Escape closes, focus returns to trigger) used by open/close night and destructive actions. Create a small test for Escape and confirm callback.

- [ ] **Step 4: Verify tests and static checks**

Run: `npx vitest run src/lib/domain/permissions.test.ts && npm run typecheck && npm run lint`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/staff.ts src/lib/domain/permissions.ts src/lib/domain/permissions.test.ts src/components/panel/panel-shell.tsx src/components/panel/staff-login.tsx src/components/ui/confirm-dialog.tsx src/app/panel src/components/panel/panel-demo.tsx
git commit -m "feat: add role-aware panel shell and staff login"
```

### Task 10: Client Anonymous Join, Night State, and Realtime Fallback

**Files:**
- Create: `src/lib/api/anon.ts`
- Create: `src/lib/api/night-state.ts`
- Create: `src/hooks/use-night-state.ts`
- Create: `tests/unit/use-night-state.test.tsx`
- Extract: `src/components/client/parts/queue-row.tsx`, `now-playing-card.tsx`, `balance-card.tsx`, `closed-state.tsx`, `offline-banner.tsx`
- Create: `src/components/client/client-night.tsx`
- Modify: `src/app/p/[slug]/page.tsx`
- Reuse: `src/components/client/client-demo.tsx` visuals

**Interfaces:**
- Consumes: `NightState`, `join_night`, `get_night_state`, Supabase browser client.
- Produces:
  - `ensureAnonymousParticipant(slug: string): Promise<{ participantId: string }>`
  - `fetchNightState(slug: string): Promise<NightState>`
  - `createNightStateSource(slug: string): NightStateSource`
  - `useNightState(source: NightStateSource, options?: { pollMs?: number }): { state: NightState | null; loading: boolean; offline: boolean; refresh: () => Promise<void> }`
  - `NightStateSource = { fetch: () => Promise<NightState>; subscribe: (onChange: () => void) => () => void }`

- [ ] **Step 1: Write the failing hook test with a fake source**

```tsx
import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useNightState } from "@/hooks/use-night-state";

it("loads, refetches on realtime change, and polls after unsubscribe", async () => {
  vi.useFakeTimers();
  const state = { venue: { slug: "billar-aurora" } } as never;
  const fetch = vi.fn().mockResolvedValue(state);
  let onChange = () => {};
  const source = { fetch, subscribe: (cb: () => void) => { onChange = cb; return () => {}; } };
  const { result } = renderHook(() => useNightState(source, { pollMs: 10_000 }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(fetch).toHaveBeenCalledTimes(1);
  act(() => onChange());
  expect(fetch).toHaveBeenCalledTimes(2);
  act(() => { vi.advanceTimersByTime(10_000); });
  expect(fetch).toHaveBeenCalledTimes(3);
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run tests/unit/use-night-state.test.tsx`
Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Implement anonymous auth, source, and hook**

`ensureAnonymousParticipant` checks `getSession()`; if no session, calls `signInAnonymously()`; then calls `join_night(slug)` and surfaces `night_closed`. `fetchNightState` calls `get_night_state` and parses with Zod.

`createNightStateSource` subscribes to `postgres_changes` on `queue_items` and `night_sessions` filtered by venue/night, calls `onChange`, and returns the unsubscribe. The hook debounces refetches by 150 ms, polls every 10 s as a fallback, pauses polling when `document.hidden`, and sets `offline` when fetch throws; it clears `offline` on the next success.

`ClientNight` replaces `ClientDemo`’s demo state with `useNightState`, keeps the visual components, and renders loading, closed, empty-queue, no-credits, and offline states. The existing vote/propose/redeem buttons stay visible but call the real API tasks next; until then, disable them with an accessible “Próximamente” explanation rather than silently doing nothing.

- [ ] **Step 4: Verify hook tests and build**

Run: `npx vitest run tests/unit/use-night-state.test.tsx && npm run typecheck && npm run build`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/anon.ts src/lib/api/night-state.ts src/hooks/use-night-state.ts tests/unit/use-night-state.test.tsx src/components/client src/app/p
git commit -m "feat: join anonymous clients and sync night state with fallback polling"
```

### Task 11: Panel Night Dashboard

**Files:**
- Create: `src/lib/api/panel-actions.ts`
- Create: `src/lib/domain/night.ts`
- Create: `src/lib/domain/night.test.ts`
- Create: `src/components/panel/night-dashboard.tsx`
- Create: `src/components/panel/player-status.tsx`
- Modify: `src/app/panel/[slug]/page.tsx`
- Reuse: `panel-demo.tsx` sections for now-playing, queue, toggles, and stats.

**Interfaces:**
- Consumes: `NightState`, staff token/session, owner session, `ConfirmDialog`.
- Produces:
  - `type NightPhase = "closed" | "open" | "closing"`
  - `nightPhase(state: NightState | null): NightPhase`
  - `openNight(token?: string): Promise<void>`
  - `closeNight(token?: string): Promise<void>`
  - `setProposalsEnabled(enabled: boolean, token?: string): Promise<void>`
  - `skipCurrent(token?: string): Promise<void>`
  - `vetoItem(itemId: string, token?: string): Promise<void>`

- [ ] **Step 1: Write the failing night-phase test**

```ts
import { expect, it } from "vitest";
import { nightPhase } from "./night";

it("maps missing, open, and closed nights", () => {
  expect(nightPhase(null)).toBe("closed");
  expect(nightPhase({ night: { status: "open" } } as never)).toBe("open");
  expect(nightPhase({ night: { status: "closed" } } as never)).toBe("closed");
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run src/lib/domain/night.test.ts`
Expected: FAIL because `night.ts` does not exist.

- [ ] **Step 3: Implement owner/staff action adapters and the dashboard**

Owner actions call RPCs with the server or browser owner session. Staff actions call `staffInvoke` with the action; both expose the same function signatures above. `openNight`/`closeNight` require `ConfirmDialog` with explicit copy (“Los códigos y créditos van a vencer”). After success, refresh night state.

`NightDashboard` renders the current song, queue with veto/skip, stats, proposal toggle, and player status. Staff see only allowed actions; hide/disallow catalog/personal/settings. `PlayerStatus` shows “Conectado” when `last_seen_at < 45 s`, otherwise “Desconectado” with a warning.

- [ ] **Step 4: Verify tests and build**

Run: `npx vitest run src/lib/domain/night.test.ts && npm run typecheck && npm run build`
Expected: pass; opening and closing the night works against the local stack.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/panel-actions.ts src/lib/domain/night.ts src/lib/domain/night.test.ts src/components/panel src/app/panel
git commit -m "feat: wire panel night dashboard and staff actions"
```

**Phase F0–F1 gate:** `npm run lint && npm run typecheck && npm run test && npm run test:db && npm run build`; manual: owner signs up, staff logs in with PIN, opens night, client joins with 0 credits, panel sees the join, closing shows “Noche cerrada”.

---

## Phase F2 · Catalog and Proposals

### Task 12: Rate-Limit Helper and YouTube Search

**Files:**
- Create: `supabase/migrations/20261031230000_rate_limits.sql`
- Create: `supabase/tests/050_rate_limits.test.sql`
- Create: `supabase/functions/_shared/rate-limit.ts`
- Create: `supabase/functions/_shared/youtube.ts`
- Create: `supabase/functions/_shared/youtube.test.ts`
- Create: `supabase/functions/youtube-search/index.ts`
- Modify: `supabase/config.toml` (`[functions.youtube-search] verify_jwt = true`)
- Modify: `.env.example` (`RATE_LIMIT_SALT`, `YOUTUBE_API_KEY`)

**Interfaces:**
- Consumes: `rate_limits`, `youtube_search_cache`, anonymous JWT.
- Produces:
  - `consume_rate_limit(p_key text, p_limit int, p_window_seconds int, p_ttl_seconds int) returns boolean`
  - `cleanup_rate_limits() returns void`
  - `buildYoutubeCacheKey(query: string, region: string, maxResults: number): string`
  - `filterYoutubeResults(items: YoutubeSearchItem[], maxDurationSeconds: number): YoutubeSearchItem[]`
  - Edge response: `{ results: YoutubeSearchItem[]; quotaExhausted: boolean }`

- [ ] **Step 1: Write the failing pure tests**

```ts
import { expect, it } from "vitest";
import { buildYoutubeCacheKey, filterYoutubeResults } from "./youtube";

it("normalizes the cache key", () => {
  expect(buildYoutubeCacheKey("  Soda   Stereo ", "AR", 10)).toBe("soda stereo|ar|10");
});

it("filters live, long, and non-embeddable results", () => {
  const base = { videoId: "x", title: "t", channelTitle: "c", durationSeconds: 200, thumbnailUrl: "", embeddable: true, isLive: false };
  expect(filterYoutubeResults([base, { ...base, videoId: "live", isLive: true }, { ...base, videoId: "long", durationSeconds: 481 }], 480).map((item) => item.videoId)).toEqual(["x"]);
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `npx vitest run supabase/functions/_shared/youtube.test.ts`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the limit RPC, cache, and Edge Function**

`consume_rate_limit` is atomic with `insert ... on conflict (key) do update`, resets the window when it expired, increments otherwise, and returns `count <= p_limit`. `cleanup_rate_limits` deletes rows with `expires_at < now()`; schedule it with `pg_cron` every 15 minutes.

`rate-limit.ts` hashes the client IP with `RATE_LIMIT_SALT` via Web Crypto and builds keys such as `search:<hash>`; it calls the RPC with the service role. `youtube-search/index.ts` verifies the anonymous/owner JWT, validates `query` (1–100 chars), normalizes the cache key, returns cached results when fresh, otherwise calls YouTube `search.list` and `videos.list`, filters, writes the cache for 24 h, and returns `quota_exhausted` on API quota errors. A link proposal never calls this function.

- [ ] **Step 4: Verify DB test and function contract**

Run: `npx supabase test db supabase/tests/050_rate_limits.test.sql && npx vitest run supabase/functions/_shared/youtube.test.ts`
Expected: pass. Then serve functions and call `youtube-search` with a real query; expect ≤10 filtered results and no API key in the response.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261031230000_rate_limits.sql supabase/tests/050_rate_limits.test.sql supabase/functions/_shared supabase/functions/youtube-search supabase/config.toml .env.example
git commit -m "feat: add atomic rate limits and YouTube search proxy"
```

### Task 13: Propose Track

**Files:**
- Create: `supabase/migrations/20261031231000_proposals.sql`
- Create: `supabase/tests/060_proposals.test.sql`
- Create: `supabase/functions/_shared/proposal.ts`
- Create: `supabase/functions/_shared/proposal.test.ts`
- Create: `supabase/functions/propose-track/index.ts`
- Modify: `supabase/config.toml` (`[functions.propose-track] verify_jwt = true`)

**Interfaces:**
- Consumes: YouTube validation from Task 3/12, `consume_rate_limit`, `tracks`, `queue_items`, `participants`, `venue_settings`.
- Produces:
  - `evaluateProposal(input: { title; artist; explicitKeywords; filterEnabled; existingActive; queueSize; maxQueueSize; proposalsUsed; maxProposals }): "explicit" | "duplicate_active" | "queue_full" | "proposal_limit" | null`
  - `propose_track_internal(p_participant_id uuid, p_night_session_id uuid, p_track jsonb) returns jsonb`
  - Edge response: `{ itemId, trackId, duplicate: boolean, voteCount: 0 }` or `{ error: "explicit" | "duplicate_active" | "queue_full" | "proposal_limit" | "proposals_disabled" | "night_closed" | "rate_limited" }`.

- [ ] **Step 1: Write the failing evaluation test**

```ts
import { expect, it } from "vitest";
import { evaluateProposal } from "./proposal";

const base = { title: "De Música Ligera", artist: "Soda Stereo", explicitKeywords: ["puta"], filterEnabled: true, existingActive: false, queueSize: 4, maxQueueSize: 30, proposalsUsed: 1, maxProposals: 3 };

it("blocks explicit, duplicate, full, and over-limit proposals", () => {
  expect(evaluateProposal({ ...base, title: "La Puta Madre" })).toBe("explicit");
  expect(evaluateProposal({ ...base, existingActive: true })).toBe("duplicate_active");
  expect(evaluateProposal({ ...base, queueSize: 30 })).toBe("queue_full");
  expect(evaluateProposal({ ...base, proposalsUsed: 3 })).toBe("proposal_limit");
  expect(evaluateProposal(base)).toBeNull();
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run supabase/functions/_shared/proposal.test.ts`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the SQL transaction and Edge Function**

`propose_track_internal` is service-role-only, locks the participant row, re-checks proposals limits and queue size, rejects when `proposals_enabled` is false or the night is closed, reuses a track by `(venue_id, dedupe_key)`, inserts a `queue_items` row with 0 votes, increments `proposals_used`, and writes an audit payload only if the insert is new. Active duplicates return `duplicate_active` without consuming a proposal.

The Edge Function verifies the anonymous JWT, resolves the participant for the open night, consumes the 1-per-30-seconds limit (key `proposal:<participant_id>`), resolves either a YouTube link or the result of `youtube-search`, fetches `videos.list` metadata, validates duration/embed/live, runs `evaluateProposal`, and calls the internal RPC with the service role.

- [ ] **Step 4: Verify DB and unit tests**

Run: `npx supabase test db supabase/tests/060_proposals.test.sql && npx vitest run supabase/functions/_shared/proposal.test.ts`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261031231000_proposals.sql supabase/tests/060_proposals.test.sql supabase/functions/_shared/proposal.ts supabase/functions/_shared/proposal.test.ts supabase/functions/propose-track supabase/config.toml
git commit -m "feat: add proposal validation and atomic queue insertion"
```

### Task 14: Catalog, MP3 Upload, and Fallback Playlist

**Files:**
- Create: `src/lib/domain/upload.ts`
- Create: `src/lib/domain/upload.test.ts`
- Create: `src/lib/api/catalog.ts`
- Create: `src/components/panel/catalog-manager.tsx`
- Create: `src/components/panel/track-form.tsx`
- Create: `src/components/panel/upload-track.tsx`
- Create: `src/components/panel/fallback-list.tsx`
- Create: `src/app/panel/[slug]/catalogo/page.tsx`
- Create: `supabase/migrations/20261031232000_fallback_order.sql`
- Create: `supabase/tests/070_catalog.test.sql`

**Interfaces:**
- Consumes: `tracks`, `fallback_tracks`, `track-audio` bucket, `create_proposal` metadata rules.
- Produces:
  - `validateUpload(file: { name: string; size: number; type: string }): "too_large" | "invalid_type" | null`
  - `sha256File(file: File): Promise<string>`
  - `uploadTrackPath(venueId: string, sha256: string): string`
  - `reorderFallback(p_track_ids uuid[]) returns jsonb`
  - `addTrackByUrl(url: string): Promise<TrackRow>` and `archiveTrack(id: string): Promise<void>`.

- [ ] **Step 1: Write the failing upload test**

```ts
import { expect, it } from "vitest";
import { validateUpload } from "./upload";

it("accepts audio under 25 MB and rejects spoofable inputs", () => {
  expect(validateUpload({ name: "song.mp3", size: 25 * 1024 * 1024, type: "audio/mpeg" })).toBeNull();
  expect(validateUpload({ name: "song.mp3", size: 25 * 1024 * 1024 + 1, type: "audio/mpeg" })).toBe("too_large");
  expect(validateUpload({ name: "song.mp3", size: 10, type: "application/octet-stream" })).toBe("invalid_type");
  expect(validateUpload({ name: "song.exe", size: 10, type: "audio/mpeg" })).toBe("invalid_type");
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run src/lib/domain/upload.test.ts`
Expected: FAIL because `upload.ts` does not exist.

- [ ] **Step 3: Implement upload validation, catalog UI, and fallback order**

Client validation requires a `.mp3` extension and an audio MIME, plus ≤ 25 MB. Compute SHA-256 with Web Crypto before upload; upload to `track-audio` at `${venueId}/${sha256}.mp3` with `upsert: false`. Read duration by loading the object URL into `<audio>` metadata. Insert the track with `dedupe_key = file:<sha256>`; if the insert conflicts, reuse the existing track.

`fallback_tracks` ordering is an owner-only RPC: it locks the venue rows, deletes/reinserts positions 0..n-1 from the provided IDs, and validates that every track belongs to the venue and is active. `CatalogManager` lists active/archived tracks, offers YouTube URL/link add, MP3 upload, explicit toggle, archive, and a fallback list with up/down buttons.

Storage policies from `20261031213000_storage_track_audio.sql` already restrict the bucket to the venue owner; add a pgTAP assertion that another owner cannot read or upload.

- [ ] **Step 4: Verify tests, storage policies, and build**

Run: `npx vitest run src/lib/domain/upload.test.ts && npx supabase test db supabase/tests/070_catalog.test.sql && npm run build`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/upload.ts src/lib/domain/upload.test.ts src/lib/api/catalog.ts src/components/panel src/app/panel supabase/migrations/20261031232000_fallback_order.sql supabase/tests/070_catalog.test.sql
git commit -m "feat: add catalog management, MP3 uploads, and fallback ordering"
```

### Task 15: Client Search and Proposal UI

**Files:**
- Create: `src/lib/api/proposals.ts`
- Create: `src/lib/api/error-messages.ts`
- Create: `src/lib/api/error-messages.test.ts`
- Modify: `src/components/client/client-night.tsx`
- Modify: `src/components/client/parts/queue-row.tsx`

**Interfaces:**
- Consumes: `youtube-search`, `propose-track`, `NightState`.
- Produces:
  - `searchYouTube(query: string): Promise<SearchResult[]>`
  - `proposeTrack(input: { videoId?: string; url?: string }): Promise<{ itemId: string; duplicate: boolean }>`
  - `messageForApiError(code: ApiErrorCode): string`

- [ ] **Step 1: Write the failing error-mapping test**

```ts
import { expect, it } from "vitest";
import { messageForApiError } from "./error-messages";

it("maps proposal errors to Spanish copy", () => {
  expect(messageForApiError("duplicate_active")).toBe("Ese tema ya está en la cola. Votalo para que suene antes.");
  expect(messageForApiError("explicit")).toBe("Ese tema está bloqueado por el filtro de contenido.");
  expect(messageForApiError("queue_full")).toBe("La cola está llena. Podés votar los temas que ya están.");
  expect(messageForApiError("rate_limited")).toBe("Esperá 30 segundos antes de proponer otro tema.");
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run src/lib/api/error-messages.test.ts`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement search/propose and wire the client**

Debounce search at 350 ms, cancel stale results, show YouTube thumbnails, and offer “Proponer” or “Votar” when the item already exists. Read `proposals_enabled` and `night.status` from `NightState`; hide the search entry point and disable the function path when proposals are closed. Enforce the 30-second cooldown in the UI with a countdown, but always trust the server error. After a proposal, refetch night state and switch to the queue tab.

- [ ] **Step 4: Verify tests and build**

Run: `npx vitest run src/lib/api/error-messages.test.ts && npm run typecheck && npm run build`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/proposals.ts src/lib/api/error-messages.ts src/lib/api/error-messages.test.ts src/components/client
git commit -m "feat: wire YouTube search and proposals into the client"
```

---

## Phase F3 · Credits and Votes

### Task 16: Vote-Code Generation, Tickets, and History

**Files:**
- Create: `supabase/migrations/20261031240000_vote_codes.sql`
- Create: `supabase/tests/080_vote_codes.test.sql`
- Create: `src/lib/api/codes.ts`
- Create: `src/components/panel/code-generator.tsx`
- Create: `src/components/panel/code-history.tsx`
- Create: `src/components/ticket-ticket.tsx` only if `ticket-code.tsx` needs a print wrapper; otherwise reuse `src/components/ticket-code.tsx`
- Create: `src/app/panel/[slug]/codigos/page.tsx`
- Modify: `src/components/panel/panel-shell.tsx`
- Modify: `src/lib/api/contracts.ts`

**Interfaces:**
- Consumes: `vote_codes`, `staff_actions`, existing ticket component.
- Produces:
  - `generate_vote_code(p_credits int) returns jsonb` (service-role internal; owner wrapper `owner_generate_code(p_credits int)`)
  - `staff_generate_code` action in the staff function
  - `increment_code_prints(p_code_id uuid) returns void`
  - `CodeRow = { id; code; credits; status; createdAt; printedCount; createdByKind; createdByName }`
  - Client `generateCode(credits, token?): Promise<CodeRow>` and `getCodeHistory(): Promise<CodeRow[]>`.

- [ ] **Step 1: Write the failing DB tests**

Assert:
- Codes match `^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$` and are unique across 500 iterations.
- Credits outside 1–50 raise `invalid_credits`.
- A closed night rejects generation with `night_closed`.
- A staff member can generate at most 200 codes per night; the 201st returns `code_limit_reached`.
- `increment_code_prints` increments `printed_count` and writes an audit row.
- Only the owner reads history; the returned rows do not include hashes or auth data.

- [ ] **Step 2: Run the focused DB test and verify it fails**

Run: `npx supabase test db supabase/tests/080_vote_codes.test.sql`
Expected: FAIL because the RPCs do not exist.

- [ ] **Step 3: Implement SQL, ticket UI, and history**

Generate the code in Postgres using `gen_random_bytes(8)`, mapping each byte modulo 32 (unbiased because 256 is divisible by 32) into the exact alphabet; retry on `unique_violation`. Set `created_by_owner_id` or `created_by_staff_id`, enforce the night is open, and write `staff_actions` for every generation. The staff Edge Function exposes `generate_code` and verifies the token.

The code page reuses `TicketCode` with the existing print CSS, adds “Copiar”, “Imprimir”, and “Pantalla grande” (a large modal for dictation), and calls `increment_code_prints` on print. History shows time, staff name, credits, and status; status uses text plus color, never color alone.

- [ ] **Step 4: Verify DB tests and print view**

Run: `npx supabase test db supabase/tests/080_vote_codes.test.sql && npm run build`
Expected: pass; `window.print` is called by the print button (stub it in the later E2E).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261031240000_vote_codes.sql supabase/tests/080_vote_codes.test.sql src/lib/api/codes.ts src/components/panel src/components/ticket-code.tsx src/app/panel src/lib/api/contracts.ts
git commit -m "feat: generate vote codes and print tickets"
```

### Task 17: Redeem Code

**Files:**
- Create: `supabase/migrations/20261031241000_redeem_code.sql`
- Create: `supabase/tests/090_redeem_code.test.sql`
- Create: `src/lib/api/redeem.ts`
- Create: `src/lib/api/redeem.test.ts`
- Modify: `src/components/client/client-night.tsx`
- Modify: `src/components/client/parts/balance-card.tsx` if extracted

**Interfaces:**
- Consumes: `vote_codes`, `participants`, `credit_transactions`, `consume_rate_limit`.
- Produces:
  - `redeem_code(p_code text) returns jsonb` → `{ ok: true; code; credits; balance } | { ok: false; error: "invalid" | "used" | "expired" | "night_closed" | "rate_limited" }`
  - `mapRedeemResult(result: RedeemResult): { tone: "ok" | "error"; message: string }`

- [ ] **Step 1: Write the failing unit test**

```ts
import { expect, it } from "vitest";
import { mapRedeemResult } from "./redeem";

it("maps duplicate and successful redeems", () => {
  expect(mapRedeemResult({ ok: false, error: "used" })).toEqual({ tone: "error", message: "Ese código ya fue usado." });
  expect(mapRedeemResult({ ok: true, code: "MESAPLAY", credits: 5, balance: 8 })).toEqual({ tone: "ok", message: "Se sumaron 5 votos. Tenés 8." });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run src/lib/api/redeem.test.ts`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the atomic RPC and client sheet**

`redeem_code` requires an anonymous participant in the open night, locks the code row `for update`, checks `status = 'active'`, marks it `redeemed` with participant/time, updates the balance, inserts a `code_redeem` ledger row with `balance_after`, and returns the new balance. On failure, increment a `redeem_fail:<participant_id>` rate limit; after 5 failures in 10 minutes return `rate_limited`. The code is never re-activated.

Wire the existing bottom sheet to the RPC; on success show the ticket and new balance, with the focus returning to the balance card; on error show `role="alert"` and keep the input.

- [ ] **Step 4: Verify tests and build**

Run: `npx vitest run src/lib/api/redeem.test.ts && npx supabase test db supabase/tests/090_redeem_code.test.sql && npm run build`
Expected: pass; a second redeem of the same code returns `used`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261031241000_redeem_code.sql supabase/tests/090_redeem_code.test.sql src/lib/api/redeem.ts src/lib/api/redeem.test.ts src/components/client
git commit -m "feat: redeem vote codes atomically"
```

### Task 18: Cast Vote and Live Queue

**Files:**
- Create: `supabase/migrations/20261031242000_cast_vote.sql`
- Create: `supabase/tests/100_cast_vote.test.sql`
- Create: `src/lib/api/votes.ts`
- Create: `src/lib/api/votes.test.ts`
- Modify: `src/components/client/client-night.tsx`
- Modify: `src/components/client/parts/queue-row.tsx`
- Modify: `src/hooks/use-night-state.ts`

**Interfaces:**
- Consumes: `votes`, `participants`, `queue_items`, `credit_transactions`, `consume_rate_limit`.
- Produces:
  - `cast_vote(p_queue_item_id uuid) returns jsonb` → `{ ok: true; voteCount; balance } | { ok: false; error: "no_credits" | "duplicate" | "item_closed" | "night_closed" | "rate_limited" }`
  - `voteErrorMessage(error: VoteError): string`

- [ ] **Step 1: Write the failing vote-error test**

```ts
import { expect, it } from "vitest";
import { voteErrorMessage } from "./votes";

it("explains no credits, duplicates, and closed items", () => {
  expect(voteErrorMessage("no_credits")).toBe("Te quedaste sin votos. Canjeá un código.");
  expect(voteErrorMessage("duplicate")).toBe("Ya votaste este tema esta noche.");
  expect(voteErrorMessage("item_closed")).toBe("Ese tema ya no está en la cola. Actualizamos la lista.");
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run src/lib/api/votes.test.ts`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the atomic vote and wire the button**

`cast_vote` requires an anonymous participant, locks the participant row, checks `credits_balance >= 1`, checks the queue item belongs to the open night and is `queued`, inserts the vote (the unique constraint blocks duplicates), decrements the balance, increments `vote_count`, inserts a `vote` ledger row, and returns the new count/balance. Rate limit `vote:<participant_id>` at 10 per minute after successful validation. A failed duplicate must not decrement credits.

The client calls the RPC on `+`, disables the button while pending, updates the row from the returned count, marks the row as voted, and refetches night state. Realtime updates other clients; polling covers drops. The plus button has `aria-label="Votar por <tema>"` and a 44 px target.

- [ ] **Step 4: Verify tests and build**

Run: `npx vitest run src/lib/api/votes.test.ts && npx supabase test db supabase/tests/100_cast_vote.test.sql && npm run build`
Expected: pass; duplicate vote leaves credits unchanged.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261031242000_cast_vote.sql supabase/tests/100_cast_vote.test.sql src/lib/api/votes.ts src/lib/api/votes.test.ts src/components/client src/hooks/use-night-state.ts
git commit -m "feat: cast atomic votes and sync the live queue"
```

### Task 19: Skip, Veto, and Audit

**Files:**
- Create: `supabase/migrations/20261031243000_moderation.sql`
- Create: `supabase/tests/110_moderation.test.sql`
- Modify: `src/lib/api/panel-actions.ts`
- Modify: `src/components/panel/night-dashboard.tsx`
- Modify: `supabase/functions/staff/index.ts` (`skip`, `veto`, `toggle_proposals` actions)

**Interfaces:**
- Consumes: `queue_items`, `staff_actions`, `night_sessions`.
- Produces:
  - `queue_action(p_item_id uuid, p_action text) returns jsonb` (service-role internal)
  - Owner wrapper `owner_queue_action(p_item_id uuid, p_action text)`
  - Staff Edge actions `skip` and `veto`.
  - Both return `{ ok: true } | { ok: false; error: "not_found" | "not_queued" | "night_closed" | "forbidden" }`.

- [ ] **Step 1: Write the failing DB tests**

Assert:
- Skip on the `playing` item sets it `skipped` with `ended_at`; the next queued item remains `queued` for the player to start.
- Veto on a `queued` item sets it `vetoed`; veto on `playing` returns `not_queued` (use skip for current).
- Neither action touches any participant balance or ledger.
- Every action writes `staff_actions` with actor kind/id and an item payload.
- Staff from another venue cannot act; owner-only actions reject staff tokens.

- [ ] **Step 2: Run the focused DB test and verify it fails**

Run: `npx supabase test db supabase/tests/110_moderation.test.sql`
Expected: FAIL because the RPCs do not exist.

- [ ] **Step 3: Implement moderation and audit**

Use a single internal `queue_action` that checks venue ownership/staff venue, locks the item, and updates it. Write the audit row in the same transaction. Add staff Edge actions with token authorization. Update the panel to call the correct adapter (owner RPC or staff function), show a confirm dialog for veto, and display “Sin devolución de créditos” in the copy. The player will notice the missing playing item on its next poll and start the next queued item.

- [ ] **Step 4: Verify tests and build**

Run: `npx supabase test db supabase/tests/110_moderation.test.sql && npm run typecheck && npm run build`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261031243000_moderation.sql supabase/tests/110_moderation.test.sql src/lib/api/panel-actions.ts src/components/panel/night-dashboard.tsx supabase/functions/staff/index.ts
git commit -m "feat: add skip, veto, and audit trail"
```

**Phase F3 gate:** the core loop works end-to-end: staff generates a code, client redeems, votes, queue reorders, skip/veto reflect live, close night invalidates credits and codes. Run unit + pgTAP + a manual two-browser smoke test.

---

## Phase F4 · Player

### Task 20: Player Pairing and Device Function

**Files:**
- Create: `supabase/migrations/20261031250000_player.sql`
- Create: `supabase/tests/120_player.test.sql`
- Create: `supabase/functions/player/index.ts`
- Create: `supabase/functions/_shared/player-auth.ts`
- Create: `src/lib/api/player.ts`
- Create: `src/lib/domain/player-connection.ts`
- Create: `src/lib/domain/player-connection.test.ts`
- Create: `src/components/panel/pair-player.tsx`
- Modify: `supabase/config.toml` (`[functions.player] verify_jwt = false`)
- Modify: `src/app/player/[slug]/page.tsx`

**Interfaces:**
- Consumes: `player_devices`, `tracks`, `queue_items`, `fallback_tracks`, Storage signed URLs.
- Produces:
  - `owner_pair_player(p_name text) returns jsonb` → `{ deviceId, name, token }` (token shown once)
  - `owner_revoke_player(p_device_id uuid) returns void`
  - `player_authorize(p_token text) returns jsonb` → `{ deviceId, venueId }`
  - `player_state(p_token text) returns jsonb` → `{ nowPlaying: PlayerTrack | null; queue: PlayerTrack[]; fallback: PlayerTrack[]; serverTime }`
  - `player_event(p_token text, p_action text, p_item_id uuid, p_reason text) returns jsonb`
  - `isPlayerConnected(lastSeenAt: string | null, now: Date): boolean` → true only when `now - lastSeenAt < 45_000 ms`.

- [ ] **Step 1: Write the failing connection test**

```ts
import { expect, it } from "vitest";
import { isPlayerConnected } from "./player-connection";

it("uses a 45 second heartbeat tolerance", () => {
  const now = new Date("2026-10-31T23:00:45Z");
  expect(isPlayerConnected("2026-10-31T23:00:01Z", now)).toBe(true);
  expect(isPlayerConnected("2026-10-31T23:00:00Z", now)).toBe(false);
  expect(isPlayerConnected(null, now)).toBe(false);
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run src/lib/domain/player-connection.test.ts`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement pairing, player auth, and the Edge Function**

`owner_pair_player` generates 32 random bytes as a hex token, stores only `digest(token, 'sha256')`, returns the plaintext token once, and writes audit. `player_authorize` checks the device is not revoked, updates `last_seen_at`, and returns its venue. `player_state` returns the playing item, up to 3 queued items, and the fallback list; for `source = 'upload'` it creates a 15-minute signed URL via the service-role Storage client. `player_event` handles `started` (queued→playing), `finished` (playing→played), and `failed` (playing→failed with reason).

The panel’s pairing UI calls `owner_pair_player`, writes the token to `localStorage` under `poneleplay.player.<slug>` for “esta PC”, and offers copy for another device. The player page without a token shows a paste-token screen; with a token it shows the start button and polls `player_state` every 5 s, heartbeat every 15 s.

- [ ] **Step 4: Verify tests and function smoke test**

Run: `npx vitest run src/lib/domain/player-connection.test.ts && npx supabase test db supabase/tests/120_player.test.sql`
Expected: pass. Pair a device, call `player_state` with curl, revoke it, and expect 401.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261031250000_player.sql supabase/tests/120_player.test.sql supabase/functions/player supabase/functions/_shared/player-auth.ts src/lib/api/player.ts src/lib/domain/player-connection.ts src/lib/domain/player-connection.test.ts src/components/panel/pair-player.tsx src/app/player supabase/config.toml
git commit -m "feat: add revocable player pairing and state endpoint"
```

### Task 21: Playback Engines and Auto-Advance

**Files:**
- Create: `src/components/player/engine.ts`
- Create: `src/components/player/youtube-engine.tsx`
- Create: `src/components/player/audio-engine.tsx`
- Create: `src/components/player/player-runtime.tsx`
- Create: `tests/unit/player-runtime.test.tsx`
- Create: `src/types/youtube.d.ts`
- Modify: `src/lib/api/player.ts`
- Modify: `src/lib/api/env.ts` (`NEXT_PUBLIC_PONELEPLAY_TEST_MODE`)

**Interfaces:**
- Consumes: `player_state`, `reducePlayback`, `PlayerTrack`.
- Produces:
  - `type PlaybackEngine = { load(track: PlayerTrack): Promise<void>; play(): Promise<void>; stop(): void; onEnded(cb: () => void): () => void; onError(cb: (reason: string) => void): () => void }`
  - `createYoutubeEngine(): PlaybackEngine`, `createAudioEngine(): PlaybackEngine`
  - `PlayerRuntime` component that calls `player_event` on ended/failed and refreshes state after each transition.

- [ ] **Step 1: Write the failing runtime test with a fake engine**

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PlayerRuntime } from "@/components/player/player-runtime";

it("marks the current item finished and loads the next one", async () => {
  const engine = { load: vi.fn().mockResolvedValue(undefined), play: vi.fn().mockResolvedValue(undefined), stop: vi.fn(), onEnded: vi.fn(), onError: vi.fn() };
  const source = { fetch: vi.fn().mockResolvedValue({ nowPlaying: { itemId: "a", title: "A" }, queue: [{ itemId: "b", title: "B" }], fallback: [] }), event: vi.fn().mockResolvedValue({}) };
  render(<PlayerRuntime engine={engine} source={source} testMode />);
  await waitFor(() => expect(engine.load).toHaveBeenCalledWith(expect.objectContaining({ title: "A" })));
  expect(source.event).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run tests/unit/player-runtime.test.tsx`
Expected: FAIL because the runtime does not exist.

- [ ] **Step 3: Implement engines and runtime**

The YouTube engine loads `https://www.youtube.com/iframe_api` once, creates `YT.Player`, and maps `onStateChange` ENDED/PLAYING/ERROR to the callbacks. The audio engine uses `<audio>` with `onEnded`/`onError` and refreshes signed URLs on every load. `PlayerRuntime` renders the start gate (required for autoplay), loads the playing item, and on ended calls `player_event("finished")`, then fetches state and loads the next; on error it calls `player_event("failed")` and fetches state after 1 s. If there is no playing item, it uses the first fallback item, loops the fallback list, and shows the waiting state when the fallback is empty. In test mode, a synthetic engine fires ended after 1.5 s and error when `?error=1` is present.

- [ ] **Step 4: Verify tests and build**

Run: `npx vitest run tests/unit/player-runtime.test.tsx && npm run typecheck && npm run build`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/player src/types/youtube.d.ts src/lib/api/player.ts src/lib/api/env.ts tests/unit/player-runtime.test.tsx
git commit -m "feat: add YouTube/MP3 engines with auto-advance"
```

### Task 22: Real Player Screen and Panel Status

**Files:**
- Modify: `src/components/player/player-demo.tsx` → real data props
- Modify: `src/app/player/[slug]/page.tsx`
- Create: `src/components/panel/player-status.tsx`
- Modify: `src/components/panel/night-dashboard.tsx`
- Create: `tests/e2e/player.spec.ts` (test-mode only; full suite in Task 25)

**Interfaces:**
- Consumes: `PlayerRuntime`, `player_state`, `isPlayerConnected`, QR code URL `${appUrl}/p/${slug}`.
- Produces: a `/player/[slug]` screen with current song, progress, source, QR, “A continuación” (3 items), fallback indicator, connection/time, and error banner/retry.

- [ ] **Step 1: Write the failing test-mode browser check**

```ts
import { expect, test } from "@playwright/test";

test("player shows current song and qr", async ({ page }) => {
  await page.goto("/player/billar-aurora?test=1");
  await expect(page.getByText("De Música Ligera")).toBeVisible();
  await expect(page.getByRole("img", { name: /QR para votar/i })).toBeVisible();
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx playwright test tests/e2e/player.spec.ts`
Expected: FAIL because the real player screen is not wired yet (or because the dev server/test mode is not configured; document the exact failure).

- [ ] **Step 3: Integrate the player screen**

Replace demo `now`/`queue` with `player_state` and `PlayerRuntime`; keep the existing visual layout and TV typography. Show signed MP3 badges and YouTube source. The QR must encode `${NEXT_PUBLIC_APP_URL}/p/${slug}`. When the player is disconnected, show “Sin conexión, reintentando” but keep the current song; when the fallback is active, show “Reproduciendo fondo”. Panel `PlayerStatus` reads `player_devices.last_seen_at` (owner) or the staff `night_state` response and shows connected/ disconnected with the 45 s rule.

- [ ] **Step 4: Verify the test-mode check**

Run: `npx playwright test tests/e2e/player.spec.ts`
Expected: pass with the synthetic engine; the test must not call YouTube.

- [ ] **Step 5: Commit**

```bash
git add src/components/player src/app/player src/components/panel/player-status.tsx src/components/panel/night-dashboard.tsx tests/e2e/player.spec.ts
git commit -m "feat: render the real player screen and connection status"
```

**Phase F4 gate:** pair the PC, start playback, queue a YouTube track, queue an MP3, force an error in test mode, verify auto-skip and panel warning, close the night and verify fallback/waiting.

---

## Phase F5 · Operation

### Task 23: Staff Management, Settings, Night Summary, and Venue QR

**Files:**
- Create: `supabase/migrations/20261031260000_owner_ops.sql`
- Create: `supabase/tests/130_owner_ops.test.sql`
- Create: `src/lib/api/owner-ops.ts`
- Create: `src/components/panel/staff-manager.tsx`
- Create: `src/components/panel/settings-form.tsx`
- Create: `src/components/panel/night-summary.tsx`
- Create: `src/components/panel/venue-qr.tsx`
- Create: `src/app/panel/[slug]/personal/page.tsx`
- Create: `src/app/panel/[slug]/ajustes/page.tsx`
- Modify: `src/app/panel/[slug]/page.tsx`
- Modify: `src/components/panel/panel-shell.tsx`

**Interfaces:**
- Consumes: `staff_members`, `venue_settings`, `venues`, `vote_codes`, `credit_transactions`, `staff_actions`.
- Produces:
  - `owner_create_staff(p_name text, p_pin text) returns jsonb` (hashes PIN, never returns it)
  - `owner_reset_staff_pin(p_staff_id uuid, p_pin text) returns void`
  - `owner_list_staff() returns jsonb` (id, name, active, failed_attempts, locked_until, last_login_at; no `pin_hash`)
  - `owner_night_summary() returns jsonb` (votes, credits issued, credits spent, codes generated/redeemed, top tracks)
  - `revoke select on public.staff_members from authenticated;`
  - `venueQrUrl(appUrl: string, slug: string): string`.

- [ ] **Step 1: Write the failing summary/QR test**

```ts
import { expect, it } from "vitest";
import { venueQrUrl } from "@/lib/api/owner-ops";

it("builds the public client URL", () => {
  expect(venueQrUrl("https://poneleplay.app", "billar-aurora")).toBe("https://poneleplay.app/p/billar-aurora");
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run src/lib/api/owner-ops.test.ts`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement owner operations and screens**

`owner_create_staff` and `owner_reset_staff_pin` validate 6-digit PINs and use `crypt(pin, gen_salt('bf',10))`; they are owner-only security-definer RPCs. Revoke direct `select` on `staff_members`; the owner list must go through the RPC so `pin_hash` never leaves the database. The settings form updates `venues` and `venue_settings` through owner RLS and validates duration/limits with Zod. The summary aggregates the current/last night. The QR component uses `qrcode` to generate a data URL and offers print/copy; it is not the player pairing QR.

`/personal` shows staff cards with active/locked state, create/reset/deactivate actions. `/ajustes` shows venue identity, explicit keywords, limits, and Spotify “fase 2” disabled. Staff navigation must never render these routes.

- [ ] **Step 4: Verify tests and build**

Run: `npx vitest run src/lib/api/owner-ops.test.ts && npx supabase test db supabase/tests/130_owner_ops.test.sql && npm run build`
Expected: pass; `owner_list_staff()` output has no `pin_hash`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261031260000_owner_ops.sql supabase/tests/130_owner_ops.test.sql src/lib/api/owner-ops.ts src/components/panel src/app/panel
git commit -m "feat: add staff management, settings, summary, and venue QR"
```

### Task 24: Responsive and Accessibility Pass

**Files:**
- Modify: `src/app/globals.css` (focus/reduced-motion only if needed)
- Modify: client, panel, and player components as findings require
- Create: `tests/e2e/a11y.spec.ts`
- Add: `@axe-core/playwright` dev dependency

**Interfaces:**
- Consumes: all surfaces.
- Produces: a verified 360 px / 390 × 844 / 1280 px / 1440 × 900 experience, AA contrast, visible focus, 44 px targets, no color-only status.

- [ ] **Step 1: Write the failing accessibility smoke test**

```ts
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("client has no serious axe violations", async ({ page }) => {
  await page.goto("/p/billar-aurora");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
});
```

- [ ] **Step 2: Run it and record failures**

Run: `npx playwright test tests/e2e/a11y.spec.ts`
Expected: FAIL on real violations (or pass if none); record the exact violation IDs.

- [ ] **Step 3: Fix layout, focus, and semantics**

Check 360 px: no horizontal scroll; vote buttons ≥44 px; bottom nav clears content; tables/cards wrap. Check keyboard: login forms, code sheet, confirm dialog, QR overlay, tabs. Ensure every status has text/icon, errors use `role="alert"`, images have alt, decorative SVG is `aria-hidden`. Respect reduced motion for queue reordering and equalizers. Do not reduce contrast to make the design look softer.

- [ ] **Step 4: Verify axe on client, panel, and player**

Run: `npx playwright test tests/e2e/a11y.spec.ts && npm run lint && npm run build`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src tests/e2e/a11y.spec.ts
git commit -m "fix: responsive and accessibility pass"
```

**Phase F5 gate:** manual 58/80 mm print using the bar printer; QR scan from three phones; 360 px client review; owner/staff permission walkthrough.

---

## Phase F6 · Hardening and Launch

### Task 25: Full Rate-Limit Coverage, Security Audit, E2E, CI, and Runbook

**Files:**
- Create: `supabase/migrations/20261031270000_hardening.sql`
- Create: `supabase/tests/140_hardening.test.sql`
- Create: `tests/e2e/core-loop.spec.ts`
- Create: `tests/e2e/roles.spec.ts`
- Create: `tests/e2e/offline.spec.ts`
- Create: `playwright.config.ts`
- Create: `.github/workflows/ci.yml`
- Create: `docs/runbook.md`
- Create: `docs/deploy.md`
- Modify: `next.config.ts` (security headers)
- Modify: all Edge Functions to apply documented limits

**Interfaces:**
- Consumes: everything.
- Produces: CI gates, concurrency E2E, security headers, a runbook for the PC/printer/QR, and a deployment checklist.

- [ ] **Step 1: Write the failing E2E core loop and offline tests**

`core-loop.spec.ts` uses two browser contexts:
- Staff logs in with PIN, generates a 5-credit code.
- Client A redeems it, votes, sees balance 4 and the queue count increase.
- Client B proposes a track (mock YouTube search via a test-only function response or seeded metadata), sees it at 0 votes.
- Client A cannot vote the same track twice.
- Panel skips/vetoes and both clients update within 2 s.
- Closing the night makes code redemption and voting fail with “Noche cerrada”.

`offline.spec.ts`:
- Loads the client, sets `context.setOffline(true)`, triggers a refetch, expects the offline banner and disabled actions.
- Restores online and expects the queue to resync.
- Player test mode keeps the current song while offline and resumes polling.

`roles.spec.ts`: anonymous client cannot open `/panel`, staff sees only Noche/Códigos, owner sees all, expired staff token returns to PIN login.

- [ ] **Step 2: Run the new tests and verify they fail**

Run: `npx playwright test tests/e2e/core-loop.spec.ts tests/e2e/offline.spec.ts tests/e2e/roles.spec.ts`
Expected: FAIL on at least the missing rate-limit/security setup; record each failure.

- [ ] **Step 3: Implement hardening**

Apply `consume_rate_limit` to every documented action: search 10/min + 30/night, proposals 1/30 s + 3/night, redeem 5 fails/10 min, votes 10/min, staff login 5/15 min, code generation 200/night/staff, owner search 30/min. Schedule `cleanup_rate_limits` and expired `youtube_search_cache` with `pg_cron`. Add `next.config.ts` headers: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, and a CSP that permits YouTube IFrame on the player route and Supabase connections. Use `outputFileTracingIncludes` only if needed for `qrcode`.

Run the secret scan: `git grep -nE "service_role|YOUTUBE_API_KEY|SUPABASE_SERVICE_ROLE_KEY" -- . ':!*.md' ':!*.example'` and assert no secret values, only variable names. Verify no service-role import reaches a client component with `npx next build` and route bundle inspection.

Write `docs/runbook.md`: open Chrome in kiosk, pair the PC, test audio, print 58/80 mm tickets, QR placement, staff PIN reset, close-night checklist, reconnect steps. Write `docs/deploy.md`: create Supabase project, link, push migrations, set secrets, deploy functions, set Vercel env, custom domain, and post-deploy smoke test.

`playwright.config.ts` runs against `npm run dev` with a 120 s timeout, Chromium only, base URL `http://localhost:3000`, trace on first retry, and a `webServer` reuse flag. CI runs `npm ci`, lint, typecheck, unit, `supabase start`, `supabase db reset`, `npm run test:db`, build, Playwright, and uploads artifacts.

- [ ] **Step 4: Run the full gate**

Run: `npm run lint && npm run typecheck && npm run test && npm run test:db && npm run build && npx playwright test`
Expected: all pass, no console errors, 30 acceptance criteria covered, no serious axe violations.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261031270000_hardening.sql supabase/tests/140_hardening.test.sql tests/e2e playwright.config.ts .github/workflows/ci.yml next.config.ts docs/runbook.md docs/deploy.md supabase/functions
git commit -m "chore: harden rate limits, security, CI, and launch runbook"
```

---

## Acceptance Criteria Map

| Criterion | Tasks |
|---|---|
| AC-01 owner account/panel, client blocked | 8, 9, 25 |
| AC-02 staff PIN, lockout, limited screens | 7, 9, 25 |
| AC-03 anonymous QR join | 10 |
| AC-04 single open night | 6, 11 |
| AC-05 catalog by search/link/MP3 | 13, 14 |
| AC-06 fallback loop | 14, 21, 22 |
| AC-07 close invalidates codes/balances/queue | 6, 17, 19, 25 |
| AC-08 client search/propose | 12, 15 |
| AC-09 duplicate proposal | 13, 15 |
| AC-10 explicit filter + keywords | 2, 13, 23 |
| AC-11 proposal limits | 12, 13 |
| AC-12 proposals disabled | 6, 11, 13, 15 |
| AC-13 code N credits, copy, print | 16 |
| AC-14 redeem, double redeem fails | 17, 25 |
| AC-15 codes/balances unusable after close | 6, 17 |
| AC-16 code history | 16, 23 |
| AC-17 vote updates queue live | 18 |
| AC-18 duplicate vote rejected | 18, 25 |
| AC-19 no-credit vote rejected | 18 |
| AC-20 queue order | 2, 6, 18 |
| AC-21 concurrent atomicity | 17, 18, 25 |
| AC-22 skip/veto live, no refunds | 19, 25 |
| AC-23 pair and play YouTube/MP3 | 20, 21 |
| AC-24 failure auto-skip and panel warning | 21, 22, 25 |
| AC-25 heartbeat/connected state | 20, 22 |
| AC-26 TV screen QR/current/next | 22 |
| AC-27 unauthorized writes fail, no secrets | 5, 14, 25 |
| AC-28 responsive/AA | 24 |
| AC-29 realtime <2 s + polling fallback | 10, 18, 25 |
| AC-30 suites pass in CI | 25 |

## Self-Review Notes

- The plan covers all seven delivery phases and every AC in the spec; F7 Spotify is intentionally omitted because the spec marks it optional and non-blocking for v1.
- The plan reuses the approved mockups’ visual components; do not regenerate the design from scratch.
- The current environment has no Docker. Tasks 4–7, 12–14, 16–20, and 23–25 cannot be fully verified until `supabase start` works; do not mark them complete on unit tests alone.
- The current Node 24.14 runtime is one patch behind `jsdom`’s engine requirement; resolve it in Task 1 before trusting component tests.
