# PonelePlay — Rediseño Audio-Only con Sincronización 3-Vías y Estabilización Local/Netlify

**Fecha:** 2026-11-21  
**Rama / Base:** `main` (`e0c767f`, versión original Next.js 15)  
**Estado:** Pendiente de revisión del usuario  

---

## 1. Propósito y Criterios de Éxito

### Objetivo
Convertir la reproducción de PonelePlay en un sistema **100% orientado a música (sin video en pantalla)** conservando los **3 modos de enrutamiento de audio** (`Solo Cabina`, `Solo TV` y `Ambos sincronizados`), eliminando los desfases, anuncios visuales en TV y bloqueos provocados por el reproductor de video fullscreen, y reparando los fallos locales y de pruebas E2E detectados por el ciclo ECC.

### Criterios de éxito verificables
1. **Cero video visible en la Pantalla Salón / TV (`/player/[slug]`):** la TV nunca muestra un `<iframe>` fullscreen de YouTube ni recibe stream de video WebRTC; únicamente renderiza vistas musicales (`SALON` y `PORTADA`) con overlays interactivos intactos (QR, cola, votación, dedicatorias, duelos, ruleta, karaoke badge).
2. **Audio en 3 modos claros y predecibles:**
   - `CABINA_ONLY` *(por defecto)*: reproduce audio únicamente en Cabina; el motor de audio de la TV permanece inactivo/pausado y Cabina arranca sin espera de barrera (`useBarrier: false`).
   - `TV_ONLY`: silencia Cabina y reproduce audio únicamente en la TV desde un motor oculto (`TvAudioEngine`), sin barrera dual (`useBarrier: false`).
   - `BOTH`: Cabina y TV reproducen audio en paralelo con `useBarrier: true` (`sync:preload` → `sync:go`), soporte real de `<audio>` HTML5 con microajuste elástico continuo (`0.96x–1.04x`) para MP3 subidos y supresión de buffering (`PlayerState.BUFFERING = 3`) + `seekTo` adaptativo para YouTube audio oculto.
3. **Progreso visual sincronizado por reloj en TV:** la barra de tiempo en la TV se calcula a 4 Hz (`250ms`) desde `computeTargetPositionSec(anchor, syncClient.estimatedServerMs())` sin depender del estado interno del iframe.
4. **Sin skips duplicados:** solo Cabina dispara `onTrackEnded → handleSkipNext` mientras envía latidos activos; la TV solo toma respaldo autónomo si pasan `>12s` sin señal de Cabina.
5. **Calidad y deploy en verde (ECC 6 fases + E2E):** `npm run typecheck`, `npm run lint`, `npm run build`, `npx vitest run` y `npx playwright test` pasan localmente sin errores, y el deploy en Netlify sobre `main` continúa operativo (`HTTP 200`).

---

## 2. Arquitectura y Flujo de Datos

```text
[Invitados /p/[slug]] ── votos / propuestas / dedicatorias ──▶ [API Next.js + Supabase]
                                                                       │
                                                              notifySyncRoom()
                                                                       ▼
[Cabina /panel/[slug]] ◀══ WS Cloud (o Directo P2P / LAN) ══▶ [Cloudflare Sync Room]
   │  PanelAudioEngine                                                 │
   │  (YouTube audio oculto / <audio> MP3)                 PlaybackAnchor + clock offset
   │  - CABINA_ONLY: suena aquí, useBarrier=false                      │  (incluye storagePath)
   │  - TV_ONLY: mute aquí, useBarrier=false                           ▼
   │  - BOTH: suena aquí, useBarrier=true                   [Pantalla TV /player/[slug]]
   │                                                          - UI: SALON | PORTADA (0% video)
   └── onTrackEnded() único ──▶ skip automático               - Progreso: reloj NTP-lite (250ms)
                                                              - TvAudioEngine (oculto):
                                                                * CABINA_ONLY: apagado
                                                                * TV_ONLY: suena directo
                                                                * BOTH: barrera + sync elástico
```

### Contratos de protocolo
- `SyncTrack` en `src/lib/sync/protocol.ts` agrega `storagePath?: string | null` (retrocompatible) y `sanitizeSyncTrack` lo preserva para que la Pantalla TV pueda reproducir temas `source === "upload"` directamente desde Supabase Storage (`tracks` bucket) o URL directa.
- `PlaybackAnchor` conserva exactamente sus campos (`cabinaMuted`, `tvMuted`, `anchorPositionSec`, `anchorServerMs`, `seq`, `seekSeq`, `volume`, `isPaused`, `karaokeMode`, `displayConfig`), garantizando retrocompatibilidad con `realtime-cloud`, `lan-hub` y clientes Android TV.
- Se elimina `src/lib/sync/webrtc-media.ts` y las rutas de señalización `channel: "media"` en `src/lib/sync/client.ts` (el canal de datos P2P `webrtc-direct.ts` permanece intacto para latencia `<5ms` de comandos y reloj).

---

## 3. Componentes y Responsabilidades

### 3.1 `TvAudioEngine` (`src/components/player/tv-audio-engine.tsx` — nuevo componente aislado)
Encapsula toda la reproducción **solo-audio** oculta de la Pantalla TV con una interfaz mínima y testeable:
- **Entradas:** `track: PlayerTrack | null`, `audioActive: boolean` (`!tvMuted`), `syncBothMode: boolean` (`!cabinaMuted && !tvMuted`), `isPaused: boolean`, `volume: number`, `anchor: PlaybackAnchor | null`, `estimatedServerMs: () => number`, `onBlockedChange: (blocked: boolean) => void`, `onCued: (videoId: string) => void`, `onEnded: () => void`.
- **Comportamiento por modo:**
  - `audioActive === false` (`CABINA_ONLY`): pausa/silencia inmediatamente tanto `<audio>` HTML5 como YouTube oculto, detiene el timer de drift y no carga medios nuevos hasta que el DJ cambie a `TV_ONLY` o `BOTH`.
  - `track.source === "upload"`: resuelve URL vía `storagePath` (Supabase `tracks` bucket) o `youtubeVideoId` si empieza por `http`, reproduce en `<audio preload="auto">`, y en modo `BOTH` aplica `computeElasticPlaybackRate(driftSec, null, { isEarlyWindow, isMuted: false })` ajustando `audio.playbackRate` en rango continuo (`0.95–1.05`) y recurriendo a `audio.currentTime` solo ante saltos `>= 1.35s` (o `0.85s` en los primeros 10s).
  - `track.source !== "upload"` (YouTube): mantiene un iframe oculto (`w-[200px] h-[112px] opacity-0 pointer-events-none`) controlado vía `createIframeEngine`. En `BOTH` respeta barrera `cue`/`play`, pausa correcciones si `isBuffering()` es `true` (`PlayerState.BUFFERING = 3`), y aplica `seekTo(expected + adaptiveSeekLeadSec)` solo cuando el desfase supera el umbral audible (`computeElasticPlaybackRate` con `isMuted: false`).
  - **Autoplay bloqueado:** si el navegador rechaza `play()` con audio en `TV_ONLY` o `BOTH`, dispara `onBlockedChange(true)` y expone `unlockAudio()` en ref imperativa para desbloquear con 1 clic.

### 3.2 `PlayerScreen` (`src/components/player/player-screen.tsx`) y `TvSettingsModal` (`src/components/player/tv-settings-modal.tsx`)
- **Eliminación total de video en pantalla:** se remueve el contenedor fullscreen `<iframe id="poneleplay-tv-iframe">`, el elemento `<video>` de stream WebRTC, la suscripción `syncClient.onMediaStream` y los estados `"VIDEO"` / `"CLEAN"`.
- **Modos de pantalla (`"SALON" | "PORTADA"`):**
  - `"SALON"` *(por defecto)*: vista musical completa con tarjeta Hero (portada + vinilo giratorio animado solo si `!isPaused`), barra de progreso y tiempo sincronizados por reloj, ecualizador, columnas **Cola Activa** y **En Votación**, y tarjeta **QR**.
  - `"PORTADA"`: vista minimalista centrada con fondo difuminado de la carátula del tema, título/artista/invitado/dedicatoria, barra de progreso y QR compacto.
  - Migración automática de `localStorage`: valores heredados `"VIDEO"` o `"PLAYLIST"` mapean a `"SALON"`; `"CLEAN"` mapea a `"PORTADA"`.
- **Progreso visual desacoplado del reproductor:** un `setInterval` de `250ms` actualiza `elapsed` directamente desde `computeTargetPositionSec(syncAnchorRef.current, syncClient.estimatedServerMs())` cuando `!isPaused` (o desde `masterTargetTimeRef` si usa fallback REST/Supabase).
- **Indicador de audio en cabecera:** refleja el modo real recibido desde Cabina (`Audio Cabina`, `Audio TV` o `Audio Sincronizado`), y muestra botón flotante **"Activar sonido en TV"** únicamente cuando `audioActive && tvAudioBlocked`.
- **Protección contra skips duplicados:** `TvAudioEngine.onEnded` solo invoca `handleSkipNext` si pasaron `>12s` desde el último latido de Cabina (`lastAdminProgressAtRef`).

### 3.3 Cabina (`PanelAudioEngine`, `PanelPlaybackFooter` y `LanSyncModal`)
- **`PanelAudioEngine` (`src/components/panel/panel-audio-engine.tsx`):**
  - Se elimina `liveMonitorVisible`, `onCloseMonitor` y `getVideoSurfaceElement`.
  - Recibe `useSyncBarrier: boolean` (verdadero **solo** cuando `syncConnected && audioRouting === "BOTH"`). Cuando `useSyncBarrier === false`, los cambios de pista cargan y reproducen al instante sin la espera de 2400ms (`holdMs = 0`).
  - En modo `TV_ONLY`, Cabina permanece silenciada (`isMuted: true`) pero continúa avanzando internamente para emitir `onProgress` y disparar el único `onTrackEnded` autoritativo al finalizar la canción.
  - Se mantiene la compatibilidad completa con YouTube audio oculto y `<audio>` HTML5 para MP3 subidos.
- **`PanelPlaybackFooter` (`src/components/panel/panel-playback-footer.tsx`):**
  - Cambia el estado inicial de `audioRouting` de `"BOTH"` a `"CABINA_ONLY"`.
  - Mantiene el selector de 3 vías (`Cabina` / `Ambos` / `TV`) en barra de escritorio y móvil, ahora mapeando `useBarrier = (audioRouting === "BOTH")` en los comandos `play_now`, `skip` y `seek`.
  - Retira `liveMonitorVisible`, `onStartLiveMedia`, `onStopLiveMedia` y el badge `LIVE 0ms` de stream de video.
  - Incluye `storagePath: currentTrack.storagePath ?? null` en los reportes `sendProgress` y comandos de pista para que la TV reproduzca MP3 subidos correctamente.
- **`LanSyncModal` (`src/components/panel/lan-sync-modal.tsx`):**
  - Elimina la sección "Stream Cabina en Vivo (Video + Audio 0 ms)" y sus props asociadas (`onStartLiveMedia`, `onStopLiveMedia`), dejando los 3 transportes limpios: **1. Modo Cloud Estable**, **2. Modo Directo P2P (1 clic)** y **3. Hub LAN Local (.ZIP)**.

### 3.4 Flujo de Invitados (`/p/[slug]`) y API
- Auditar `src/components/client/client-night.tsx` y `src/app/api/playback/command/route.ts` para confirmar que `storagePath` viaje en el feed `/api/tv/[slug]`, que `audioRouting` persista coherentemente `tvMuted`/`cabinaMuted` sin silenciar por error, y que los invitados reciban cambios de tema, votos y propuestas sin recargar.

---

## 4. Limpieza de Entorno Local, Netlify y Pruebas E2E

1. **`tsconfig.json`:** agregar `"mobile"` y `".worktrees"` a `exclude` para que `npm run typecheck` y `npm run build` no fallen por los archivos Expo sin rastrear en la raíz.
2. **`eslint.config.mjs`:** agregar `"mobile/**"`, `".worktrees/**"`, `"lan-hub/**"`, `"realtime-cloud/**"` a `ignores` para que `npm run lint` ejecute en segundos sin colgarse en `mobile/node_modules/`.
3. **Limpieza menor de seguridad/lint:** remover el `console.log` en `src/components/pwa-provider.tsx:45` y warnings de imports no usados en los archivos tocados (`player-screen.tsx`, `tv-settings-modal.tsx`, `panel-playback-footer.tsx`).
4. **Tests E2E Playwright:**
   - `tests/e2e/mobile-ux.spec.ts`: reemplazar las URLs hardcodeadas `http://localhost:3005/...` por rutas relativas (`/manifest.json`, `/sw.js`, `/`, `/p/billar-aurora`) que respeten `baseURL` (`playwright.config.ts`).
   - `tests/e2e/comprehensive-audit.spec.ts`: corregir `/c/billar-aurora` → `/p/billar-aurora` y asegurar navegación estable frente a cold-compile inicial de `next dev`.
5. **Netlify:** mantener intacto `netlify.toml` (`command = "npm run build"`, `publish = ".next"`) y `next.config.ts`.

---

## 5. Estrategia de Pruebas (ECC Verification Loop + E2E)

### Pruebas unitarias (Vitest)
- `tests/unit/tv-audio-engine.test.tsx` (nuevo):
  - En `CABINA_ONLY` (`audioActive = false`): no llama a `play()` ni carga audio activo.
  - En `TV_ONLY` (`audioActive = true, syncBothMode = false`): reproduce `<audio>` para `source: "upload"` usando `storagePath` sin esperar barrera.
  - En `BOTH` (`audioActive = true, syncBothMode = true`): ajusta `audio.playbackRate` suavemente (`0.95..1.05`) ante micro-desfases en `<audio>` HTML5, y suprime correcciones durante buffering en YouTube.
- `tests/unit/panel-playback-footer.test.tsx`: verificar que arranca en `CABINA_ONLY`, mantiene el selector 3-vías (`Cabina` / `Ambos` / `TV`) y solo activa `useBarrier` en modo `BOTH`.
- `src/lib/sync/client.test.ts` y `src/lib/sync/room-engine.test.ts`: actualizar tras eliminar `webrtc-media.ts` y cubrir preservación de `storagePath` en `sanitizeSyncTrack`.

### Puerta final ECC (las 6 fases + E2E)
1. `npm run build` (PASS)
2. `npx --no-install tsc --noEmit` (0 errores)
3. `npm run lint` (0 errores)
4. `npx vitest run` (100% suites en verde)
5. Escaneo de seguridad (`sk-`, `api_key`, `console.log` en `src/`)
6. `npx playwright test` (`mobile-ux.spec.ts` + `comprehensive-audit.spec.ts` en verde contra servidor local) + revisión final de `git diff --stat` antes de desplegar a Netlify.
