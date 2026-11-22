# Hybrid Fullscreen Karaoke & Lyrics Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a hybrid Karaoke experience across Web TV, Cabina, and Android TV `v3.3.0` that shows fullscreen YouTube Karaoke video (reusing the existing single YouTube surface with zero double audio and a discreet corner QR) for YouTube karaoke tracks, repairs `/api/lyrics` Netlify CDN caching for normal songs in Karaoke mode (0% video), and keeps all normal music 100% audio-only.

**Architecture:** A pure domain resolver (`resolveKaraokePresentation`) maps `(track, boothKaraokeMode, overrideMode, videoEmbedFailed)` to `"none" | "video" | "lyrics"` identically in TypeScript and Kotlin. `TvAudioEngine` (Web) and `NativeVideoPlayer` (Android TV) promote their existing single YouTube iframe/WebView to fullscreen when `videoVisible === true` (forcing `muted = true` + clock sync in `CABINA_ONLY`, and unmuted audio in `TV_ONLY` / `BOTH`), eliminating double streams and audio echoes. `/api/lyrics` disables edge CDN caching (`Cache-Control: no-store`, `Netlify-CDN-Cache-Control: no-store`) and stops permanently caching misses.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Vitest, Testing Library, Cloudflare/LAN/Supabase Realtime sync (`party:event`), Android TV Jetpack Compose + WebView + Gradle (`versionCode = 12`, `versionName = "3.3.0"`).

**Spec:** [docs/superpowers/specs/2026-11-22-karaoke-hybrid-design.md](file:///d:/Vibe%20Coding%20Practica/docs/superpowers/specs/2026-11-22-karaoke-hybrid-design.md)

## Global Constraints

- Normal music (`presentation === "none"`) MUST remain 0% video in both `SALON` and `PORTADA` modes; in `CABINA_ONLY`, the TV YouTube player MUST stay unmounted during normal music.
- Single YouTube player instance only — NEVER mount a second iframe or second WebView for karaoke video.
- In `CABINA_ONLY` + karaoke video (`videoVisible = true, audioActive = false`), the TV YouTube player MUST start and stay `muted = true`, sync to Cabina's anchor clock (`>0.35s` drift correction), and MUST NOT trigger `onBlockedChange(true)` or compete with Cabina's `onEnded`.
- Fullscreen karaoke overlay MUST show only a compact top-left pill (`🎤 KARAOKE` + title/artist + audio routing badge) and a discreet bottom-right QR (`~72px`), keeping dedications and vote-to-skip overlays above it.
- `/api/lyrics` MUST return `Cache-Control: no-store, no-cache, must-revalidate, max-age=0`, `CDN-Cache-Control: no-store`, and `Netlify-CDN-Cache-Control: no-store`.
- Android TV release MUST bump to `versionCode = 12`, `versionName = "3.3.0"` in `android-tv/app/build.gradle.kts` and `src/app/api/tv/version/route.ts`, and publish release APKs to `public/tv.apk`, `public/poneleplay-tv.apk`, and `dist-apk/poneleplay-tv.apk`.
- Untouchable local files: NEVER stage, modify, or delete `package.json`, `package-lock.json`, `skills-lock.json`, `mobile/`, or `pevc-android-ios-workflow.md`.

## Review Focus

1. **Audio leak during `CABINA_ONLY` Karaoke Video:** Switching from normal song to YouTube Karaoke while `audioRouting === "CABINA_ONLY"` must mount the iframe/WebView with `mute=1` from frame 0 so there is zero audio burst/echo from the TV speakers (tested in Task 3).
2. **False-positive "Instrumental" normal songs:** A regular non-karaoke track titled `"Bohemian Rhapsody (Instrumental)"` with `isKaraoke: false` must NOT trigger fullscreen video unless paired with karaoke keywords or `isKaraoke: true` (tested in Task 1).
3. **YouTube embed restriction (errors 100/101/150/152) on a karaoke video:** Must immediately flip `karaokeVideoEmbedFailed = true` for the current track and degrade to `"lyrics"` instead of leaving a black YouTube error frame fullscreen (tested in Task 1 & wired in Tasks 3, 4, 6).
4. **Switching `CABINA_ONLY ↔ TV_ONLY ↔ BOTH` mid-karaoke:** Must toggle mute/volume on the already-mounted fullscreen YouTube player without unmounting or reloading the video from `0:00` (tested in Task 3 & wired in Task 6).
5. **Poisoned negative lyrics cache:** A transient lookup miss (`found: false`) must NOT be cached for 6 hours in server memory or indefinitely in `CLIENT_LYRICS_CACHE` / `nativeLyricsCache`, and Netlify CDN must never serve song A's response to song B (tested in Task 2).

---

### Task 1: Pure Karaoke Presentation Engine

**Files:**
- Create: `src/lib/domain/karaoke.ts`
- Test: `tests/unit/karaoke-mode.test.ts`

**Interfaces:**
- Consumes: none (pure domain module)
- Produces:
  - `export type KaraokeOverrideMode = "auto" | "force_video" | "force_lyrics" | "off";`
  - `export type KaraokePresentation = "none" | "video" | "lyrics";`
  - `export interface KaraokeTrackLike { title?: string | null; artist?: string | null; source?: string | null; youtubeVideoId?: string | null; isKaraoke?: boolean | null; }`
  - `export function isTrackKaraokeCandidate(track: KaraokeTrackLike | null | undefined): boolean`
  - `export function resolveKaraokePresentation(params: { track: KaraokeTrackLike | null | undefined; boothKaraokeMode: boolean; overrideMode?: KaraokeOverrideMode; videoEmbedFailed?: boolean; }): KaraokePresentation`

- [ ] **Step 1: Write the failing test in `tests/unit/karaoke-mode.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import {
  isTrackKaraokeCandidate,
  resolveKaraokePresentation,
} from "@/lib/domain/karaoke";

describe("karaoke presentation domain logic", () => {
  it("detects explicit isKaraoke flag and clear karaoke keywords in title/artist", () => {
    expect(isTrackKaraokeCandidate({ title: "De Música Ligera", artist: "Soda Stereo", isKaraoke: true })).toBe(true);
    expect(isTrackKaraokeCandidate({ title: "La Bikina (Karaoke)", artist: "Luis Miguel" })).toBe(true);
    expect(isTrackKaraokeCandidate({ title: "Despacito Pista Karaoke", artist: "Canal Musical" })).toBe(true);
    expect(isTrackKaraokeCandidate({ title: "Flowers", artist: "Sing King" })).toBe(true);
    expect(isTrackKaraokeCandidate({ title: "Persiana Americana (Con Letra)", artist: "Soda" })).toBe(true);
  });

  it("avoids false positives on plain instrumental tracks without karaoke signal", () => {
    expect(isTrackKaraokeCandidate({ title: "Bohemian Rhapsody (Instrumental)", artist: "Queen", isKaraoke: false })).toBe(false);
    expect(isTrackKaraokeCandidate({ title: "De Música Ligera", artist: "Soda Stereo" })).toBe(false);
  });

  it("resolves hybrid presentation cleanly across auto, overrides, uploads, and embed errors", () => {
    const ytKaraoke = { title: "Lamento Boliviano Karaoke", artist: "KaraFun", source: "youtube", youtubeVideoId: "abc12345678", isKaraoke: false };
    const ytNormal = { title: "Lamento Boliviano", artist: "Enanitos Verdes", source: "youtube", youtubeVideoId: "xyz12345678", isKaraoke: false };
    const mp3Karaoke = { title: "Lamento Boliviano Karaoke", artist: "DJ", source: "upload", youtubeVideoId: null, isKaraoke: true };

    expect(resolveKaraokePresentation({ track: ytKaraoke, boothKaraokeMode: false })).toBe("video");
    expect(resolveKaraokePresentation({ track: ytNormal, boothKaraokeMode: false })).toBe("none");
    expect(resolveKaraokePresentation({ track: ytNormal, boothKaraokeMode: true })).toBe("lyrics");
    expect(resolveKaraokePresentation({ track: mp3Karaoke, boothKaraokeMode: false })).toBe("lyrics");
    expect(resolveKaraokePresentation({ track: ytKaraoke, boothKaraokeMode: true, videoEmbedFailed: true })).toBe("lyrics");
    expect(resolveKaraokePresentation({ track: ytKaraoke, boothKaraokeMode: true, overrideMode: "off" })).toBe("none");
    expect(resolveKaraokePresentation({ track: ytKaraoke, boothKaraokeMode: true, overrideMode: "force_lyrics" })).toBe("lyrics");
    expect(resolveKaraokePresentation({ track: ytNormal, boothKaraokeMode: false, overrideMode: "force_video" })).toBe("video");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/karaoke-mode.test.ts`
Expected: FAIL with module not found `@/lib/domain/karaoke`.

- [ ] **Step 3: Implement `src/lib/domain/karaoke.ts`**

Export `KaraokeOverrideMode`, `KaraokePresentation`, `KaraokeTrackLike`, `isTrackKaraokeCandidate`, and `resolveKaraokePresentation` matching the exact rules from Spec Section 3.1 (keyword regex covers `karaoke`, `pista karaoke`, `con letra`, `sing along`, `sing king`, `karafun`, `versi[oó]n karaoke`, `karaoke version`, `instrumental con letra`, `pista musical`, without matching bare `instrumental`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/karaoke-mode.test.ts`
Expected: PASS (3/3 tests).

- [ ] **Step 5: Commit**

```powershell
git add src/lib/domain/karaoke.ts tests/unit/karaoke-mode.test.ts
git commit -m "feat(karaoke): add pure hybrid karaoke presentation resolver"
```

---

### Task 2: Fix `/api/lyrics` Netlify CDN Cache Poisoning & Client Miss Caching

**Files:**
- Modify: `src/app/api/lyrics/route.ts:29-49,258-387`
- Modify: `src/lib/domain/lyrics.ts:65-101`
- Modify: `src/components/player/karaoke-lyrics-overlay.tsx:70-115`
- Test: `tests/unit/lyrics.test.ts`

**Interfaces:**
- Consumes: `src/lib/domain/lyrics.ts` (`cleanTrackQuery`, parsers)
- Produces:
  - `GET /api/lyrics` returning `Cache-Control: no-store, no-cache, must-revalidate, max-age=0`, `CDN-Cache-Control: no-store`, `Netlify-CDN-Cache-Control: no-store`
  - Memory cache TTL: `6 * 60 * 60 * 1000` for `found: true`, `60_000` for `found: false`
  - `stripAccentsForLyricsSearch(input: string): string` fallback lookup when exact/primary search has no synced hit
  - `CLIENT_LYRICS_CACHE` in `KaraokeLyricsOverlay` only caches `parsed.found === true`

- [ ] **Step 1: Add failing test to `tests/unit/lyrics.test.ts`**

Add a test importing `GET` from `@/app/api/lyrics/route` (mocking `global.fetch` cleanly) asserting:
1. Two sequential `GET /api/lyrics` requests for different songs return distinct lyrics payloads.
2. Response headers include `Cache-Control` containing `no-store` and `Netlify-CDN-Cache-Control` equal to `no-store`.
3. A `found: false` response is not stuck forever if TTL expires (verified via short negative TTL constant exported or testable via distinct query / mocked clock).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lyrics.test.ts`
Expected: FAIL because `Cache-Control` is currently `public, max-age=300` and `Netlify-CDN-Cache-Control` is absent.

- [ ] **Step 3: Implement CDN cache fix, short negative TTL, accent-stripped LRCLIB fallback, and client miss-cache fix**

- In `src/app/api/lyrics/route.ts`:
  - Replace `CORS_HEADERS` with `no-store, no-cache, must-revalidate, max-age=0`, `CDN-Cache-Control: no-store`, `Netlify-CDN-Cache-Control: no-store`.
  - Update `setCache(key, value)` to use `NEGATIVE_CACHE_TTL_MS = 60_000` when `!value.found` and `CACHE_TTL_MS = 6 * 60 * 60 * 1000` when `value.found`.
  - Add an accent-stripped / simplified LRCLIB fallback query when `(!resolved || !resolved.synced)` and the normalized ASCII title differs from `title`.
- In `src/components/player/karaoke-lyrics-overlay.tsx`:
  - Only call `CLIENT_LYRICS_CACHE.set(cacheKey, parsed)` when `parsed.found` is true (so transient failures retry cleanly on next track visit).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lyrics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/app/api/lyrics/route.ts src/lib/domain/lyrics.ts src/components/player/karaoke-lyrics-overlay.tsx tests/unit/lyrics.test.ts
git commit -m "fix(lyrics): disable Netlify CDN caching and stop sticky negative cache"
```

---

### Task 3: Single-Surface Promotable `TvAudioEngine` & `iframe-engine`

**Files:**
- Modify: `src/components/player/iframe-engine.ts:28-30,78-88`
- Modify: `src/components/player/tv-audio-engine.tsx:24-45,155-205,305-405,445-510,606-645`
- Test: `tests/unit/tv-audio-engine.test.tsx`

**Interfaces:**
- Consumes: `IframePlaybackEngine.onError` and `buildEmbedUrl(videoId, startSeconds?, autoplay?, startMuted?)`
- Produces:
  - `TvAudioEngineProps` extended with `videoVisible?: boolean` and `onVideoError?: (reason: string) => void`
  - Container class toggles between hidden (`fixed bottom-0 right-0 w-[200px] h-[112px] opacity-[0.01] pointer-events-none overflow-hidden -z-10`) and fullscreen (`fixed inset-0 z-30 bg-black pointer-events-none overflow-hidden`)
  - Single YouTube iframe stays mounted across `CABINA_ONLY ↔ TV_ONLY ↔ BOTH` while `videoVisible === true` without reloading

- [ ] **Step 1: Add failing tests to `tests/unit/tv-audio-engine.test.tsx`**

Add tests asserting:
1. When `audioActive={false}` and `videoVisible={false}` (`CABINA_ONLY` normal music), `#poneleplay-tv-audio-iframe` is NOT rendered.
2. When `audioActive={false}` and `videoVisible={true}` (`CABINA_ONLY` Karaoke Video), `#poneleplay-tv-audio-iframe` IS rendered inside `#poneleplay-tv-audio-engine` with `fixed inset-0` fullscreen class, its initial `src` includes `mute=1`, and `onBlockedChange(true)` is NOT called.
3. Switching `audioActive` from `false` to `true` while `videoVisible={true}` keeps the same iframe element mounted (no unmount/remount) and calls `unMute()` + `setVolume(...)`.
4. When `ytEngine` emits an error while `videoVisible={true}`, `onVideoError` is invoked.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/tv-audio-engine.test.tsx`
Expected: FAIL because `videoVisible` / `onVideoError` and `mute=1` URL support do not exist yet.

- [ ] **Step 3: Update `iframe-engine.ts` and `tv-audio-engine.tsx`**

- In `src/components/player/iframe-engine.ts`:
  - Add optional `startMuted = false` fourth parameter to `buildEmbedUrl`, appending `&mute=1` when `startMuted` is true.
- In `src/components/player/tv-audio-engine.tsx`:
  - Add `videoVisible = false` and `onVideoError` props + refs (`videoVisibleRef`, `onVideoErrorRef`).
  - Set `shouldMountYoutube = Boolean((audioActive || videoVisible) && track && !isUploadTrack)`.
  - Pass `!audioActiveRef.current` as `startMuted` to `ytEngine.buildEmbedUrl(...)` so `CABINA_ONLY` karaoke video starts muted from frame 0.
  - Subscribe `ytEngine.onError((reason) => onVideoErrorRef.current?.(reason))` inside the mount effect.
  - In the track-load, play/pause, volume/mute, `onLoad`, and drift-guard effects:
    - When `audioActive` is true: unmute + apply volume + existing drift logic (`TV_ONLY` / `BOTH`).
    - When `!audioActive && videoVisible`: keep `ytEngine.mute()` forced, play when `!isPaused` (without calling `scheduleYtAutoplayCheck()` or `onBlockedChange(true)`), ignore `onEnded` so Cabina remains authoritative, and run the 250ms clock drift guard syncing the muted video to `anchor` whenever `Math.abs(driftSec) > 0.35` (rate trim or seek with cooldown 1200ms).
  - Toggle `#poneleplay-tv-audio-engine` classes and `aria-hidden={!videoVisible}` cleanly when `videoVisible` changes.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/tv-audio-engine.test.tsx`
Expected: PASS (all existing + new tests).

- [ ] **Step 5: Commit**

```powershell
git add src/components/player/iframe-engine.ts src/components/player/tv-audio-engine.tsx tests/unit/tv-audio-engine.test.tsx
git commit -m "feat(tv-engine): support single-surface fullscreen karaoke video with muted sync"
```

---

### Task 4: Web TV Fullscreen Karaoke View & Live Override Sync

**Files:**
- Modify: `src/components/player/player-screen.tsx`

**Interfaces:**
- Consumes: `resolveKaraokePresentation`, `KaraokeOverrideMode` from `src/lib/domain/karaoke.ts`; `videoVisible` and `onVideoError` on `TvAudioEngine`
- Produces:
  - Live `party:event` and Supabase broadcast listener for `type === "karaoke_override"` (`mode: KaraokeOverrideMode`)
  - Fullscreen karaoke minimal overlay (`z-40`) with top-left compact pill (`🎤 KARAOKE` + title/artist + audio routing badge) and bottom-right discreet QR (`size-16`)
  - Automatic reset of `karaokeOverride = "auto"` and `karaokeVideoEmbedFailed = false` on track change
  - Automatic fallback to `"lyrics"` when `TvAudioEngine` fires `onVideoError`

- [ ] **Step 1: Wire `karaokeOverride`, `karaokeVideoEmbedFailed`, and `karaokePresentation` in `src/components/player/player-screen.tsx`**

- Add state `karaokeOverride` (`"auto"`) and `karaokeVideoEmbedFailed` (`false`), resetting both whenever `[nowPlaying?.itemId, nowPlaying?.youtubeVideoId]` changes.
- Compute `karaokePresentation = resolveKaraokePresentation({ track: nowPlaying, boothKaraokeMode: karaokeMode, overrideMode: karaokeOverride, videoEmbedFailed: karaokeVideoEmbedFailed })`.
- Listen for `karaoke_override` in both `applyPartyEventPayload` (`party:event`) and legacy Supabase broadcast channel, updating `karaokeOverride` and showing a concise HUD toast (`🎬 Video Karaoke`, `📝 Solo Letra`, `🎧 Vista Normal`).
- Pass `videoVisible={karaokePresentation === "video"}` and `onVideoError={() => setKaraokeVideoEmbedFailed(true)}` to `<TvAudioEngine />`.
- When `karaokePresentation === "video"`:
  - Render the fullscreen minimal overlay (`z-40`, `pointer-events-none` container with clickable discreet bottom-right QR card `size-16` and compact top-left pill `🎤 KARAOKE • Title — Artist` + audio routing indicator).
  - Hide `PORTADA` and `SALON` main layouts while `karaokePresentation === "video"` so the promoted fullscreen iframe shines cleanly underneath `z-40`, while keeping dedications, vote-to-skip, audio unlock button, and modals on top (`z-50+`).
- When `karaokePresentation === "lyrics"`:
  - Render `<KaraokeLyricsOverlay />` inside `PORTADA` and `SALON` (replacing the old `karaokeMode || nowPlaying?.isKaraoke` boolean check with `karaokePresentation === "lyrics"`).

- [ ] **Step 2: Run Web typecheck + tests**

Run: `npm run typecheck; npx vitest run tests/unit/player-runtime.test.tsx tests/unit/party-guest-and-tv.test.tsx`
Expected: PASS (0 TS errors, all tests green).

- [ ] **Step 3: Commit**

```powershell
git add src/components/player/player-screen.tsx
git commit -m "feat(tv-web): render fullscreen karaoke video with discreet QR and live override sync"
```

---

### Task 5: Cabina Karaoke Status Indicator & Live Mode Override Controls

**Files:**
- Modify: `src/components/panel/panel-playback-footer.tsx`
- Test: `tests/unit/panel-playback-footer.test.tsx`

**Interfaces:**
- Consumes: `resolveKaraokePresentation`, `isTrackKaraokeCandidate`, `KaraokeOverrideMode` from `src/lib/domain/karaoke.ts`
- Produces:
  - Contextual Cabina controls next to the `Karaoke` toggle whenever `karaokeMode || isTrackKaraokeCandidate(currentTrack) || karaokeOverride !== "auto"`:
    - Compact mode selector pills: `🎬 Video` (`force_video`), `📝 Letra` (`force_lyrics`), `✕ Normal` (`off`) — clicking active mode returns to `auto`; broadcasts `{ type: "karaoke_override", mode, timestamp }` over `syncClientRef.current?.sendPartyEvent(...)` AND `channelRef.current`
    - Offset pill `-0.5s / 0.0s / +0.5s` shown only when `karaokePresentation === "lyrics"`

- [ ] **Step 1: Add failing test to `tests/unit/panel-playback-footer.test.tsx`**

Verify that when `Karaoke` mode is active (or a karaoke track is playing), the Cabina footer displays the Karaoke mode override controls (`Video` / `Letra` / `Normal`) and shows the `-0.5s` / `+0.5s` offset controls in `lyrics` presentation while hiding offset controls when switched to `Video`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/panel-playback-footer.test.tsx`
Expected: FAIL because the override selector buttons do not exist yet.

- [ ] **Step 3: Implement contextual Karaoke override controls in `src/components/panel/panel-playback-footer.tsx`**

- Add `karaokeOverride` state (resets to `"auto"` on `[currentTrack?.itemId, currentTrack?.youtubeVideoId]`).
- Compute `karaokePresentation = resolveKaraokePresentation({ track: currentTrack, boothKaraokeMode: karaokeMode, overrideMode: karaokeOverride })`.
- Add `handleSetKaraokeOverride(mode: KaraokeOverrideMode)` broadcasting `{ type: "karaoke_override", mode, timestamp: Date.now() }` via `syncClientRef.current?.sendPartyEvent` and `channelRef.current`, with clear toast feedback.
- Render compact `Video` / `Letra` / `Normal` switcher pill when `karaokeMode || isTrackKaraokeCandidate(currentTrack) || karaokeOverride !== "auto"`, and render the `-0.5s / 0.0s / +0.5s` pill when `karaokePresentation === "lyrics"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/panel-playback-footer.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/components/panel/panel-playback-footer.tsx tests/unit/panel-playback-footer.test.tsx
git commit -m "feat(cabina): add live karaoke video/lyrics/off override controls"
```

---

### Task 6: Android TV `v3.3.0` Hybrid Fullscreen Karaoke, Build, Verification & OTA Publish

**Files:**
- Modify: `android-tv/app/src/main/kotlin/app/poneleplay/tv/ui/NativeVideoPlayer.kt`
- Modify: `android-tv/app/src/main/kotlin/app/poneleplay/tv/MainActivity.kt`
- Modify: `android-tv/app/src/main/kotlin/app/poneleplay/tv/ui/TvScreen.kt`
- Modify: `android-tv/app/build.gradle.kts`
- Modify: `src/app/api/tv/version/route.ts`
- Publish binaries: `public/tv.apk`, `public/poneleplay-tv.apk`, `dist-apk/poneleplay-tv.apk`

**Interfaces:**
- Consumes: `party:event` `"karaoke_override"` (`mode: "auto" | "force_video" | "force_lyrics" | "off"`), `/api/lyrics` (no-store)
- Produces:
  - Kotlin `resolveKaraokePresentation(...)` matching TypeScript rules 1:1
  - Single promotable WebView in `NativeVideoPlayer` (`videoVisible: Boolean`, `onEmbedError: (Int) -> Unit`), using `ViewGroup.LayoutParams.MATCH_PARENT` inside Compose `Modifier.fillMaxSize()` when `videoVisible == true` and `Modifier.size(200.dp, 112.dp).alpha(0.01f)` when hidden
  - Fullscreen karaoke minimal overlay (`TvModeKaraokeVideoOverlay`) with top-left compact pill and bottom-right discreet QR (`72.dp`)
  - Release APK `v3.3.0` (`versionCode = 12`)

- [ ] **Step 1: Update `NativeVideoPlayer.kt` for single-surface fullscreen promotion & muted sync**

- Add `videoVisible: Boolean = false` and `onEmbedError: (Int) -> Unit = {}` parameters.
- Change `shouldMountYoutubeAudio` → `shouldMountYoutube = (audioActive || videoVisible) && !isUploadTrack && videoId.isNotBlank()`.
- Ensure `WebView` uses `ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)` so Compose cleanly resizes between `Modifier.size(200.dp, 112.dp).alpha(0.01f)` and `Modifier.fillMaxSize().alpha(1f)` without destroying the WebView on mode/routing changes.
- When `videoVisible && !audioActive` (`CABINA_ONLY`): keep `controller.mute()` enforced, allow `play()` when `!isPaused`, and do NOT invoke `onEnded()` competitively while Cabina is active.
- Forward YouTube embed errors (`100 | 101 | 150 | 152`) from `YouTubeBridge.onError` to `onEmbedError` (and do NOT auto-skip when `videoVisible` falls back to `"lyrics"`).

- [ ] **Step 2: Update `MainActivity.kt` and `TvScreen.kt` for Hybrid Karaoke & non-sticky miss cache**

- In `MainActivity.kt`: add `karaokeOverrideMode` state (resets to `"auto"` on track change), parse `karaoke_override` in `onPartyEvent`, and pass `karaokeOverrideMode` to `TvScreen`.
- In `TvScreen.kt`:
  - Add Kotlin `isTrackKaraokeCandidate` + `resolveKaraokePresentation` matching Task 1 1:1.
  - Track `karaokeVideoEmbedFailed` per track key (resets on track change; set `true` by `NativeVideoPlayer.onEmbedError`).
  - Pass `videoVisible = karaokePresentation == "video"` to `NativeVideoPlayer` and run the drift-sync loop whenever `audioActive || karaokePresentation == "video"` (with muted sync in `CABINA_ONLY`).
  - When `karaokePresentation == "video"`: render `NativeVideoPlayer` on top in fullscreen with `TvModeKaraokeVideoOverlay` (top-left pill + bottom-right `72.dp` QR), keeping dedications/skip/duel/roulette above it.
  - When `karaokePresentation == "lyrics"`: show `KaraokeLyricsPanel` in `PORTADA` and `SALON` (and only save `found == true` entries to `nativeLyricsCache`).

- [ ] **Step 3: Bump Android TV OTA metadata to `v3.3.0` (`versionCode = 12`)**

- Update `android-tv/app/build.gradle.kts` (`versionCode = 12`, `versionName = "3.3.0"`).
- Update `src/app/api/tv/version/route.ts` (`versionCode: 12`, `versionName: "3.3.0"`, release notes describing hybrid fullscreen karaoke + lyrics fix).

- [ ] **Step 4: Run full Web & Android TV verification**

- Web: `npm run typecheck; npm run lint; npx vitest run; npm run build` (all exit code 0).
- Android TV: set `JAVA_HOME="C:\Users\TinChoX\.jdks\jbr-21.0.11"` and `ANDROID_HOME="C:\Users\TinChoX\AppData\Local\Android\Sdk"`, run `.\gradlew.bat :app:testDebugUnitTest :app:assembleRelease` (`BUILD SUCCESSFUL`).

- [ ] **Step 5: Copy APK `v3.3.0`, commit cleanly, push to `origin/main`, and verify live `/api/lyrics`**

- Copy `android-tv\app\build\outputs\apk\release\app-release.apk` to `public\tv.apk`, `public\poneleplay-tv.apk`, and `dist-apk\poneleplay-tv.apk`.
- Stage ONLY the modified/created task files (never `package.json`, `package-lock.json`, `skills-lock.json`, `mobile/`, `pevc-android-ios-workflow.md`), commit, and push to `origin/main`.
- After Netlify deploys, verify with `curl` on two distinct songs that `https://poneleplay.netlify.app/api/lyrics` returns `Cache-Control: no-store` and distinct lyrics for each song.
