# PonelePlay Audio-Only 3-Way Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert PonelePlay into a video-free, music-only experience with 3-way audio routing (`CABINA_ONLY` default, `TV_ONLY`, `BOTH` synced), clock-driven TV progress, HTML5 `<audio>` support for uploaded MP3s on TV, and clean local/Netlify ECC verification + E2E passing.

**Architecture:** Cabina (`PanelAudioEngine` + `PanelPlaybackFooter`) remains the single authoritative playback controller and only activates Ready-Barrier (`useBarrier: true`) when `audioRouting === "BOTH"`. Web TV (`PlayerScreen`) removes all fullscreen video (`<iframe>` / WebRTC `<video>`) in favor of two music-only visual modes (`SALON` and `PORTADA`), drives its progress bar from `computeTargetPositionSec(anchor, estimatedServerMs())` at 250ms, and delegates optional hidden audio playback (`TV_ONLY` / `BOTH`) to a new isolated `TvAudioEngine` supporting both HTML5 `<audio>` (via `storagePath`) and hidden YouTube audio.

**Tech Stack:** Next.js 15.5 (App Router, React 19, TypeScript 5), Tailwind CSS v4, Supabase JS, Cloudflare Durable Objects WebSocket + WebRTC DataChannel, Vitest 5 + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-21-audio-only-sync-design.md`

## Global Constraints

- Base branch is `main` (Next.js 15 original version); keep `netlify.toml` (`command = "npm run build"`, `publish = ".next"`) and `next.config.ts` intact.
- Do not touch or commit untracked local `mobile/`, `pevc-android-ios-workflow.md`, or unrelated `package.json`/`package-lock.json` edits.
- Keep `PlaybackAnchor` wire format backward-compatible with `realtime-cloud`, `lan-hub`, and Android TV; `storagePath?: string | null` on `SyncTrack` is optional.
- Zero visible video on Web TV (`/player/[slug]`): only `"SALON"` and `"PORTADA"` modes exist; legacy `localStorage` values `"VIDEO"` / `"PLAYLIST"` map to `"SALON"` and `"CLEAN"` maps to `"PORTADA"`.
- Only Cabina dispatches `onTrackEnded -> handleSkipNext` while active (`lastAdminProgressAtRef` within 12s); TV only falls back to autonomous skip if Cabina has been silent >12s.
- All final ECC 6-phase checks (`build`, `tsc --noEmit`, `lint`, `vitest run`, security scan, diff review) and Playwright E2E must pass before declaring done.

## Review Focus

1. **Legacy `localStorage` TV modes (`"VIDEO"`, `"CLEAN"`, `"PLAYLIST"`):** Opening `/player/[slug]` on a browser with old saved mode must migrate seamlessly to `"SALON"` or `"PORTADA"` instead of rendering a blank screen or dead video state — pinned by Task 4 unit test.
2. **Uploaded MP3 track without `youtubeVideoId` (`source: "upload"`, `storagePath: "venues/1/song.mp3"`):** Must resolve via Supabase Storage `tracks` bucket and play in `<audio>` on TV in `TV_ONLY`/`BOTH` without falling back to the Soda Stereo YouTube ID — pinned by Task 2 & Task 3 unit tests.
3. **Switching `audioRouting` mid-song from `BOTH` / `TV_ONLY` to `CABINA_ONLY`:** Must immediately pause and mute `TvAudioEngine` and clear any drift timer so TV stops emitting audio and stops running seeks — pinned by Task 3 unit test.
4. **Browser autoplay rejection on TV (`audio.play()` rejecting in `TV_ONLY`/`BOTH`):** Must catch cleanly, invoke `onBlockedChange(true)` so the "Activar sonido en TV" button renders, and keep visual clock progress running — pinned by Task 3 unit test.
5. **Cabina starting a new song in `CABINA_ONLY` or `TV_ONLY` while Sync WS is connected:** Must NOT apply the 2400ms silent barrier hold (`useSyncBarrier = false`, `useBarrier = false`) so audio begins immediately — pinned by Task 5 unit test.

---

### Task 1: Fix Local Tooling Config (`tsconfig`, `eslint`, `pwa-provider`) and Broken Playwright E2E Specs

**Files:**
- Modify: `tsconfig.json:25-27`
- Modify: `eslint.config.mjs:14-22`
- Modify: `src/components/pwa-provider.tsx:40-51`
- Modify: `tests/e2e/mobile-ux.spec.ts:10-69`
- Modify: `tests/e2e/comprehensive-audit.spec.ts:3-48`

**Interfaces:**
- Consumes: none.
- Produces: clean `npm run typecheck`, fast `npm run lint` excluding untracked `mobile/`, zero `console.log` in `src/`, and Playwright E2E specs aligned with `baseURL` (`http://localhost:3000`) and real guest route `/p/[slug]`.

- [ ] **Step 1: Verify current failures before editing**

Run: `npx --no-install tsc --noEmit`
Expected: FAIL with 10 `TS2307` errors inside `mobile/app/...`.

- [ ] **Step 2: Exclude `mobile` and `.worktrees` from `tsconfig.json` and `eslint.config.mjs`, and remove `console.log` in `src/components/pwa-provider.tsx`**

- In `tsconfig.json`, update `"exclude"` to `["node_modules", "realtime-cloud", "lan-hub", "mobile", ".worktrees"]`.
- In `eslint.config.mjs`, add `"mobile/**"`, `".worktrees/**"`, `"lan-hub/**"`, `"realtime-cloud/**"` to `ignores`.
- In `src/components/pwa-provider.tsx:44-46`, remove the `console.log("[PWA] Service Worker registrado con éxito:", reg.scope);` call (keeping `.register("/sw.js").catch(...)`).

- [ ] **Step 3: Fix hardcoded port and invalid guest route in Playwright E2E specs**

- In `tests/e2e/mobile-ux.spec.ts`, replace every `http://localhost:3005/...` with relative paths (`/manifest.json`, `/sw.js`, `/icons/icon-192.png`, `/icons/icon-512.png`, `/icons/apple-touch-icon.png`, `/`, `/p/billar-aurora`) so Playwright uses `baseURL` from `playwright.config.ts`.
- In `tests/e2e/comprehensive-audit.spec.ts`, change `{ path: "/c/billar-aurora", name: "Client Guest (/c)" }` to `{ path: "/p/billar-aurora", name: "Client Guest (/p)" }` and raise navigation timeout on initial `page.goto` to `{ waitUntil: "domcontentloaded", timeout: 30000 }` with `test.setTimeout(60000)` on `test.describe` to tolerate cold-compile of `next dev`.

- [ ] **Step 4: Run typecheck and lint to verify Task 1 passes**

Run: `npm run typecheck && npm run lint`
Expected: `tsc --noEmit` exits 0; `eslint` finishes cleanly in <15s with 0 errors.

- [ ] **Step 5: Commit Task 1**

```bash
git add tsconfig.json eslint.config.mjs src/components/pwa-provider.tsx tests/e2e/mobile-ux.spec.ts tests/e2e/comprehensive-audit.spec.ts
git commit -m "chore(tooling): exclude mobile/worktrees from tsc & eslint and fix E2E baseURL/routes"
```

---

### Task 2: Propagate `storagePath` in Sync Protocol/API and Remove Dead WebRTC Video Streaming

**Files:**
- Delete: `src/lib/sync/webrtc-media.ts`
- Modify: `src/lib/sync/protocol.ts:12-30`, `src/lib/sync/protocol.ts:300-345`
- Modify: `src/lib/sync/client.ts` (remove `DirectMediaStreamer` wiring, `mediaStats`, `startLiveMediaBroadcast`, `stopLiveMediaBroadcast`, `getRemoteMediaStream`, `onMediaStream`)
- Modify: `src/app/api/tv/[slug]/route.ts` (ensure `storagePath` is mapped in `nowPlaying` and queue items when present)
- Modify: `src/app/api/playback/command/route.ts` (ensure `storagePath` is preserved on `current_track` during `play_now`/`skip` and `audioRouting` persists `cabinaMuted`/`tvMuted` cleanly)
- Test: `src/lib/sync/room-engine.test.ts`, `src/lib/sync/client.test.ts`

**Interfaces:**
- Consumes: existing `SyncTrack`, `sanitizeSyncTrack`, `PoneleSyncClient`.
- Produces:
  - `SyncTrack.storagePath?: string | null` preserved by `sanitizeSyncTrack(raw)`.
  - `SyncStatusState` without `mediaStats` (restored to `{ transport, preferenceMode, connected, rttMs, offsetMs, presence, lanEndpoints, peers, directStats }`).
  - `/api/tv/[slug]` returning `storagePath` on `nowPlaying` when present.

- [ ] **Step 1: Write failing unit test for `storagePath` preservation in `src/lib/sync/room-engine.test.ts`**

```ts
it("preserves storagePath on uploaded tracks in sanitizeSyncTrack", async () => {
  const { sanitizeSyncTrack } = await import("@/lib/sync/protocol");
  const track = sanitizeSyncTrack({
    itemId: "u1",
    trackId: "u1",
    title: "Mi MP3 Local",
    artist: "DJ Local",
    source: "upload",
    storagePath: "venues/bar-1/song.mp3",
    youtubeVideoId: null,
    durationSeconds: 195,
  });
  expect(track).not.toBeNull();
  expect(track?.source).toBe("upload");
  expect(track?.storagePath).toBe("venues/bar-1/song.mp3");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/sync/room-engine.test.ts`
Expected: FAIL because `track?.storagePath` is `undefined`.

- [ ] **Step 3: Implement `storagePath` in `protocol.ts` + `/api/tv/[slug]/route.ts`, remove `webrtc-media.ts` and media hooks from `client.ts` & `client.test.ts`**

- In `src/lib/sync/protocol.ts`, add `storagePath?: string | null;` to `SyncTrack` and extract `storagePath: typeof obj.storagePath === "string" && obj.storagePath.trim() ? obj.storagePath.trim() : null` in `sanitizeSyncTrack`.
- In `src/app/api/tv/[slug]/route.ts`, include `storagePath` in `QueueItemFeed` and in the mapped `nowPlaying` object.
- Delete `src/lib/sync/webrtc-media.ts`.
- In `src/lib/sync/client.ts`, remove `DirectMediaStreamer` import/field/methods, `mediaStats` from `SyncStatusState`, and `channel === "media"` branch in `handleOutbound`.
- In `src/lib/sync/client.test.ts`, remove the `negotiates Option 2 live WebRTC MediaStream...` test (no longer applicable in audio-only design).
- Note: temporarily check if `lan-sync-modal.tsx`, `panel-playback-footer.tsx`, or `player-screen.tsx` fail `tsc` due to removed `mediaStats`/`onMediaStream`; keep Task 2 commit cleanly compiling OR remove the dead `mediaStats` read in Task 4/5 (better: keep `client.test.ts` & `room-engine.test.ts` green here and run full `tsc` once Tasks 3–5 finish, or remove `mediaStats` references cleanly in Task 5).

- [ ] **Step 4: Run sync unit tests to verify pass**

Run: `npx vitest run src/lib/sync/room-engine.test.ts src/lib/sync/client.test.ts`
Expected: PASS (all sync tests green).

- [ ] **Step 5: Commit Task 2**

```bash
git add src/lib/sync/protocol.ts src/lib/sync/client.ts src/lib/sync/room-engine.test.ts src/lib/sync/client.test.ts src/app/api/tv/[slug]/route.ts
git rm src/lib/sync/webrtc-media.ts
git commit -m "refactor(sync): propagate storagePath for uploaded tracks and drop video WebRTC streamer"
```

---

### Task 3: Create Isolated `TvAudioEngine` Component (Audio-Only Hidden Engine for TV)

**Files:**
- Create: `src/components/player/tv-audio-engine.tsx`
- Test: `tests/unit/tv-audio-engine.test.tsx`

**Interfaces:**
- Consumes:
  - `PlayerTrack` (`@/lib/api/player`)
  - `createIframeEngine`, `resolveVideoId` (`@/components/player/iframe-engine`)
  - `computeAdaptiveSeekLeadSec`, `computeElasticPlaybackRate`, `computeTargetPositionSec`, `type PlaybackAnchor` (`@/lib/sync/protocol`)
  - `createBrowserSupabase` (`@/lib/api/supabase/browser`)
- Produces:
  - `export interface TvAudioEngineProps`:
    - `track: PlayerTrack | null`
    - `audioActive: boolean` (`!tvMuted` — `false` in `CABINA_ONLY`)
    - `syncBothMode: boolean` (`!cabinaMuted && !tvMuted`)
    - `isPaused: boolean`
    - `volume: number` (`0..100`)
    - `anchor: PlaybackAnchor | null`
    - `estimatedServerMs: () => number`
    - `onBlockedChange?: (blocked: boolean) => void`
    - `onCued?: (videoId: string) => void`
    - `onEnded?: () => void`
  - `export interface TvAudioEngineRef`:
    - `cue(track: PlayerTrack, startSec?: number): Promise<void>`
    - `playAt(startSec?: number): void`
    - `seekTo(seconds: number): void`
    - `unlockAudio(): void`
  - `export function resolveUploadAudioUrl(track: Pick<PlayerTrack, "storagePath" | "youtubeVideoId">): string`
  - `export const TvAudioEngine = forwardRef<TvAudioEngineRef, TvAudioEngineProps>(...)`

- [ ] **Step 1: Write failing unit tests in `tests/unit/tv-audio-engine.test.tsx`**

Include tests covering all Review Focus cases owned by `TvAudioEngine`:
1. `does not play audio or mount active playback when audioActive is false (CABINA_ONLY)` — renders with `audioActive={false}`, verifies `<audio>.play` is never called and YouTube iframe is not rendered.
2. `plays uploaded MP3 track via HTML5 <audio> using storagePath when audioActive is true (TV_ONLY)` — mocks `createBrowserSupabase().storage.from("tracks").getPublicUrl(...)`, verifies `<audio src="https://.../song.mp3">` plays without rendering any YouTube iframe.
3. `pauses and mutes immediately when switching from TV_ONLY/BOTH to CABINA_ONLY mid-song` — rerenders with `audioActive={false}`, verifies `audio.pause()` is called and `audio.muted === true`.
4. `applies continuous elastic playbackRate (0.95..1.05) in BOTH mode for uploaded HTML5 <audio> drift` — advances fake timer while `audio.currentTime` lags expected anchor by `0.35s`, verifies `audio.playbackRate > 1 && audio.playbackRate <= 1.05` (no hard `currentTime` jump).
5. `reports blocked state via onBlockedChange(true) when browser rejects autoplay play()` — mocks `audio.play()` returning rejected promise, verifies `onBlockedChange(true)` is called and `ref.current.unlockAudio()` retries `play()` and calls `onBlockedChange(false)`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/tv-audio-engine.test.tsx`
Expected: FAIL with module not found `@/components/player/tv-audio-engine`.

- [ ] **Step 3: Implement `TvAudioEngine` in `src/components/player/tv-audio-engine.tsx`**

- Mount `<audio ref={html5AudioRef} preload="auto" className="hidden" />` always (lightweight) and mount the hidden YouTube `<iframe ref={ytIframeRef} ... />` (`fixed -left-[9999px] -top-[9999px] w-[200px] h-[112px] opacity-0 pointer-events-none`) **only when `audioActive && track && track.source !== "upload"`** so `CABINA_ONLY` and MP3 tracks have zero YouTube iframe overhead.
- Implement `resolveUploadAudioUrl`: uses `createBrowserSupabase().storage.from("tracks").getPublicUrl(track.storagePath).data.publicUrl` if `storagePath` exists, else `track.youtubeVideoId` if it starts with `"http"`.
- In `BOTH` mode, run a `250ms` drift loop:
  - For `<audio>` (`source === "upload"`): skip while `audio.readyState < 3 || audio.seeking`; compute `driftSec = audio.currentTime - expected`; call `computeElasticPlaybackRate(driftSec, null, { isEarlyWindow: expected < 10, isMuted: false })`; apply `audio.playbackRate = decision.playbackRate` or set `audio.currentTime = expected` if `decision.action === "seek"`.
  - For YouTube hidden iframe: skip while `engine.isBuffering()`; call `computeElasticPlaybackRate(driftSec, engine.getAvailablePlaybackRates(), { isEarlyWindow: expected < 10, isMuted: false })`; apply `seekTo(expected + adaptiveSeekLeadSec)` on `"seek"` with cooldown and EMA calibration.
- In `TV_ONLY` mode (`syncBothMode === false`), skip tight drift loops except large divergence (`> 2.0s` or explicit `seekTo` via ref).
- When `audioActive` becomes `false`, immediately pause + mute `<audio>` (resetting `playbackRate = 1`) and pause + mute YouTube engine.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/unit/tv-audio-engine.test.tsx`
Expected: PASS (all 5 tests green).

- [ ] **Step 5: Commit Task 3**

```bash
git add src/components/player/tv-audio-engine.tsx tests/unit/tv-audio-engine.test.tsx
git commit -m "feat(tv): add isolated TvAudioEngine supporting HTML5 upload audio and hidden YouTube 3-way routing"
```

---

### Task 4: Migrate `PlayerScreen` and `TvSettingsModal` to Video-Free Musical Modes (`SALON` / `PORTADA`) + Clock-Driven Progress

**Files:**
- Modify: `src/components/player/tv-settings-modal.tsx:1-165`
- Modify: `src/components/player/player-screen.tsx`
- Test: `tests/unit/player-runtime.test.tsx`

**Interfaces:**
- Consumes: `TvAudioEngine`, `type TvAudioEngineRef` from Task 3; `SyncTrack.storagePath` from Task 2; `computeTargetPositionSec` from `@/lib/sync/protocol`.
- Produces:
  - `export type TvDisplayMode = "SALON" | "PORTADA"` and `export function normalizeTvDisplayMode(raw: string | null | undefined): TvDisplayMode` (maps `"VIDEO"` / `"PLAYLIST"` → `"SALON"`, `"CLEAN"` / `"PORTADA"` → `"PORTADA"`).
  - `TvSettingsModal` accepting `screenMode: TvDisplayMode` and `audioRouting: "CABINA_ONLY" | "TV_ONLY" | "BOTH"` with clean copy (no unused imports `Volume2`, `VolumeX`, `DedicationStyle`).
  - `PlayerScreen` rendering zero fullscreen `<iframe>` or `<video>` tags, showing `"SALON"` by default, `"PORTADA"` minimal album-art view when toggled (`V`), clock-driven `elapsed` ticker (`250ms`), and `"Activar sonido en TV"` button when `tvAudioBlocked && !isMuted`.

- [ ] **Step 1: Write failing unit tests in `tests/unit/player-runtime.test.tsx`**

Add tests for:
1. `normalizeTvDisplayMode migrates legacy VIDEO/PLAYLIST/CLEAN values cleanly to SALON and PORTADA` (`"VIDEO" -> "SALON"`, `"PLAYLIST" -> "SALON"`, `"CLEAN" -> "PORTADA"`, `null -> "SALON"`).
2. Existing player runtime tests updated/verified so no fullscreen video iframe is expected in `PlayerScreen`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/player-runtime.test.tsx`
Expected: FAIL with `normalizeTvDisplayMode` not exported.

- [ ] **Step 3: Update `tv-settings-modal.tsx` and refactor `player-screen.tsx` to music-only UI + `TvAudioEngine`**

- In `src/components/player/tv-settings-modal.tsx`:
  - Export `TvDisplayMode = "SALON" | "PORTADA"` and `normalizeTvDisplayMode(raw)`.
  - Remove unused imports (`Volume2`, `VolumeX`, `DedicationStyle`).
  - Update mode switcher labels to `"🎵 MODO SALÓN (Vinilo, Cola, Votos y QR)"` (`SALON`) and `"✨ MODO PORTADA (Carátula Minimalista y QR)"` (`PORTADA`).
  - Show clear 3-way audio status badge (`Solo Cabina` / `Audio en TV` / `Cabina + TV Sincronizado`).
- In `src/components/player/player-screen.tsx`:
  - Remove `iframeRef`, `createIframeEngine`, `remoteMediaStream`, `remoteMediaVideoRef`, `liveStreamAudioBlocked`, `unsubMedia`, `driftTimer`, the fullscreen `<iframe>` container, and the `screenMode !== "PLAYLIST"` video overlay layer.
  - Default `screenMode` state to `"SALON"` using `normalizeTvDisplayMode` on `localStorage` load and `applyDisplayConfigPayload`.
  - Mount `<TvAudioEngine ref={tvAudioRef} track={nowPlaying} audioActive={!isMuted} syncBothMode={audioRouting === "BOTH"} isPaused={!isPlaying} volume={volume} anchor={syncAnchorState} estimatedServerMs={() => syncClientRef.current ? syncClientRef.current.estimatedServerMs() : Date.now()} onBlockedChange={setTvAudioBlocked} onCued={handleTvAudioCued} onEnded={handleTvAudioEnded} />`.
  - Wire `sync:preload` → if `audioRoutingRef.current === "BOTH"`, call `tvAudioRef.current?.cue(incoming, startPositionSec)` and emit `sendReady(barrierId)`; otherwise emit `sendReady(barrierId)` immediately.
  - Wire `sync:go` → schedule `tvAudioRef.current?.playAt(startPositionSec)` at `startAtServerMs` when `!anchor.tvMuted`.
  - Add a clean `250ms` clock ticker computing `elapsed` from `computeTargetPositionSec(syncAnchorRef.current, syncClientRef.current.estimatedServerMs())` whenever `isPlayingRef.current` is true (or `masterTargetTimeRef` fallback).
  - Add the `"PORTADA"` full-bleed blurred-artwork music view (0 video) alongside the existing `"SALON"` 3-column layout, keeping all party overlays (dedications, duels, roulette, skip vote, QR modal, standby pairing screen) intact.
  - Render a clickable `"🔊 Activar sonido en TV"` button whenever `!isMuted && tvAudioBlocked` calling `tvAudioRef.current?.unlockAudio()`.
  - Remove unused `Mic`, `sidebarTab`, etc. warnings in `player-screen.tsx`.

- [ ] **Step 4: Run player unit tests to verify pass**

Run: `npx vitest run tests/unit/player-runtime.test.tsx tests/unit/party-guest-and-tv.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/components/player/tv-settings-modal.tsx src/components/player/player-screen.tsx tests/unit/player-runtime.test.tsx
git commit -m "feat(tv): migrate PlayerScreen to video-free SALON/PORTADA modes with clock progress and TvAudioEngine"
```

---

### Task 5: Update Cabina (`PanelAudioEngine`, `PanelPlaybackFooter`, `LanSyncModal`) for `CABINA_ONLY` Default and Conditional Barrier

**Files:**
- Modify: `src/components/panel/panel-audio-engine.tsx`
- Modify: `src/components/panel/panel-playback-footer.tsx`
- Modify: `src/components/panel/lan-sync-modal.tsx`
- Test: `tests/unit/panel-playback-footer.test.tsx`

**Interfaces:**
- Consumes: `SyncTrack.storagePath` and cleaned `SyncStatusState` from Task 2.
- Produces:
  - `PanelAudioEngineProps` with `useSyncBarrier?: boolean` (replacing `liveMonitorVisible`/`onCloseMonitor` and removing `getVideoSurfaceElement`).
  - `PanelPlaybackFooter` defaulting `audioRouting` to `"CABINA_ONLY"`, passing `useSyncBarrier={syncStatus.connected && audioRouting === "BOTH"}`, setting `useBarrier: audioRouting === "BOTH"` on `sendCommand`, propagating `storagePath` on `sendProgress`, and removing `onStartLiveMedia`/`onStopLiveMedia`/`liveMonitorVisible`.
  - `LanSyncModal` without the WebRTC Video Stream card.

- [ ] **Step 1: Write failing unit test in `tests/unit/panel-playback-footer.test.tsx`**

Add a test asserting:
- Default audio routing renders `Solo Cabina` active (`CABINA_ONLY`), not `BOTH`.
- Switching routing to `Ambos` updates active state and allows switching to `Solo TV` and back.
- No "Stream Cabina en Vivo" video broadcast button appears inside `LanSyncModal`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/panel-playback-footer.test.tsx`
Expected: FAIL because `audioRouting` currently defaults to `"BOTH"`.

- [ ] **Step 3: Implement updates across `panel-audio-engine.tsx`, `panel-playback-footer.tsx`, and `lan-sync-modal.tsx`**

- In `src/components/panel/panel-audio-engine.tsx`:
  - Replace `liveMonitorVisible` / `onCloseMonitor` / `getVideoSurfaceElement` with `useSyncBarrier?: boolean` (default `false`).
  - Change line `const holdMs = syncConnectedRef.current ? 2400 : 220;` to `const holdMs = useSyncBarrierRef.current ? 2400 : 0;` so `CABINA_ONLY` and `TV_ONLY` never pause silently for 2.4s on track changes.
  - Keep container permanently hidden `160x90 opacity-0 pointer-events-none`.
- In `src/components/panel/panel-playback-footer.tsx`:
  - Default `audioRouting` to `"CABINA_ONLY"` (and `tvMuted` initial state to `true` until server/user state loads).
  - Keep the 3-way selector (`Cabina` / `Ambos` / `TV`) in mobile & desktop bars.
  - Set `useBarrier: audioRoutingRef.current === "BOTH"` in `sendCommand` calls (`play_now`, `skip`, `seek`).
  - Include `storagePath: currentTrack.storagePath ?? null` in `sendProgress` track payload and `play_now` / `skip` payloads.
  - Remove `mediaStats`, `liveMonitorVisible`, `onStartLiveMedia`, `onStopLiveMedia`, and the `LIVE 0ms` badge text; remove unused `handleToggleTvMute`.
- In `src/components/panel/lan-sync-modal.tsx`:
  - Remove `onStartLiveMedia`, `onStopLiveMedia`, `startingLive`, `mediaMsg`, `mediaStats`, and the WebRTC Video Stream section, keeping the 3 clean transport options (**1. Modo Cloud Estable**, **2. Modo Directo P2P**, **3. Hub LAN Local**).

- [ ] **Step 4: Run panel unit tests to verify pass**

Run: `npx vitest run tests/unit/panel-playback-footer.test.tsx tests/unit/night-dashboard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add src/components/panel/panel-audio-engine.tsx src/components/panel/panel-playback-footer.tsx src/components/panel/lan-sync-modal.tsx tests/unit/panel-playback-footer.test.tsx
git commit -m "feat(panel): default to CABINA_ONLY audio routing, gate barrier to BOTH mode, and remove video stream UI"
```

---

### Task 6: Full ECC 6-Phase Verification Loop + Playwright E2E Suite

**Files:**
- Verify all modified files across `src/`, `tests/`, `tsconfig.json`, `eslint.config.mjs`, `lan-hub/`, `realtime-cloud/`.

**Interfaces:**
- Consumes: deliverables from Tasks 1–5.
- Produces: complete `VERIFICATION REPORT` (PASS across all 6 ECC phases + Playwright E2E green).

- [ ] **Step 1: Run ECC Phases 2–5 (Typecheck, Lint, Vitest, Security Scan)**

Run: `npm run typecheck && npm run lint && npx vitest run`
Expected: 0 TS errors, 0 ESLint errors, 100% Vitest suites passing.

Run security grep on `src/`:
- Verify 0 hardcoded `sk-` / API keys and 0 `console.log` in `src/`.

- [ ] **Step 2: Run ECC Phase 1 (Production Build) cleanly without breaking local dev server**

Stop any running `next dev` process first, run `npm run build`, verify exit code 0 and `.next/` generated cleanly.

- [ ] **Step 3: Run ECC Playwright E2E (`npx playwright test`) against production server (`npm run start`) or clean dev server**

Start `npm run start` on port `3000` (eliminates dev cold-compile timeouts and matches Netlify production behavior!), run `npx playwright test --reporter=list`, then stop the temporary server.
Expected: 100% E2E tests in `mobile-ux.spec.ts` and `comprehensive-audit.spec.ts` PASS.

- [ ] **Step 4: Verify `lan-hub` and `realtime-cloud` checks remain clean**

Run: `cd lan-hub && npm run typecheck && npm test && cd ../realtime-cloud && npx tsc --noEmit`
Expected: exit 0, 2/2 `lan-hub` tests pass.

- [ ] **Step 5: Run ECC Phase 6 (Diff Review) and present final report before any push/deploy**

Run: `git status -s` and `git diff --stat e0c767f..HEAD`
Expected: Only planned files modified/added/deleted; `mobile/`, `package.json`, `package-lock.json` untouched in git commits.
