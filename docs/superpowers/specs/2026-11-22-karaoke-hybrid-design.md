# PonelePlay — Karaoke Híbrido Inteligente (Video Fullscreen YouTube + Letras Sincronizadas)

**Fecha:** 2026-11-22  
**Rama / Base:** `main` (`0bee568`)  
**Estado:** Pendiente de aprobación del usuario  

---

## 1. Propósito y Criterios de Éxito

### Problema que resolvemos
1. **Envenenamiento de caché en Netlify CDN (`/api/lyrics`):** `Cache-Control: public, max-age=300` sin `Netlify-Vary: query` hace que Netlify cachee `/api/lyrics` solo por ruta, devolviendo la misma respuesta (o `{ found: false }`) para todas las canciones durante 5 minutos.
2. **Videos Karaoke de YouTube sin subtítulos CC:** la gran mayoría de las pistas karaoke de YouTube tienen la letra **quemada en el video** sincronizada al milisegundo con el instrumental, sin pistas `captionTracks`, y los endpoints HTML de YouTube suelen ser bloqueados desde IPs serverless.
3. **Detección incompleta de pistas Karaoke:** temas de YouTube cuyo título indica karaoke/pista/con letra no activan la vista Karaoke si no vino `isKaraoke: true` en metadata o si el DJ no activó el botón global.

### Objetivo
Implementar un sistema **Karaoke Híbrido Inteligente** en **Web TV (`/player/[slug]`)**, **Cabina (`/panel/[slug]`)** y **Android TV (`v3.3.0`)** que:
- Mantenga **0% video** para toda la música normal (conservando el diseño audio-only en `SALON` y `PORTADA`).
- Muestre el **video de YouTube en pantalla completa (fullscreen)** con QR discreto en la esquina **automáticamente** cuando suena una pista Karaoke de YouTube, reutilizando la misma superficie de reproducción para evitar doble audio y respetando los 3 modos de audio (`CABINA_ONLY`, `BOTH`, `TV_ONLY`).
- Muestre **letras sincronizadas arregladas (0% video + calibración `±0.5s`)** cuando el Modo Karaoke está activo sobre una canción normal o MP3 subido (`source === "upload"`), o como respaldo automático si un video de YouTube bloquea el embed.

### Criterios de éxito verificables
1. **Música normal = 0% video:** cuando `resolveKaraokePresentation(...) === "none"`, la TV renderiza exclusivamente `SALON` o `PORTADA` sin ningún video visible, y en `CABINA_ONLY` el reproductor YouTube de la TV permanece desmontado.
2. **Karaoke YouTube = Video Fullscreen + QR discreto:** cuando una pista de YouTube es detectada como karaoke (por `isKaraoke: true` o por título/artista), la misma superficie YouTube pasa a pantalla completa (`100%` viewport) con `controls=0`, píldora compacta superior izquierda y QR discreto inferior derecho (`~72px`).
3. **Cero doble audio en los 3 modos de ruteo:**
   - `CABINA_ONLY`: Cabina emite el audio; la TV muestra el video Karaoke fullscreen **silenciado (`muted = true`)** y sincronizado al reloj de Cabina (`anchorPositionSec`, corrección suave si deriva `> 0.35s`).
   - `TV_ONLY`: Cabina silenciada; la TV muestra el video Karaoke fullscreen con audio activo al volumen de Cabina.
   - `BOTH`: Cabina y TV reproducen audio + video Karaoke fullscreen en TV sincronizados con la barrera y el motor elástico existente.
4. **Control manual desde Cabina (override por pista / modo):** el DJ ve si la TV está en `🎬 Video Karaoke`, `📝 Letra Karaoke` o `Normal`, y puede forzar o apagar Karaoke en cualquier momento (respetado por Web TV y Android TV en tiempo real).
5. **`/api/lyrics` sin caché rota:** devuelve `Cache-Control: no-store, max-age=0`, no cachea resultados negativos (`found: false`) por más de 60s en memoria, y pruebas reales con `curl` sobre 2 canciones distintas en Netlify devuelven letras distintas correspondientes a cada canción.
6. **Build & Tests en verde:** `npm run typecheck`, `npm run lint`, `npx vitest run`, `npm run build` y Android TV `:app:testDebugUnitTest :app:assembleRelease` (`v3.3.0`, `versionCode = 12`) aprueban con exit code 0.

---

## 2. Arquitectura y Flujo de Datos (Enfoque A — Superficie Única Promovible)

```text
[Cabina /panel/[slug]]
  ├── Selector 3-vías Audio: CABINA_ONLY | BOTH | TV_ONLY
  ├── Control Karaoke: Auto / Forzar Video / Solo Letra / Apagar (por pista o global)
  ├── Calibración Letra: -0.5s / 0.0s / +0.5s (cuando aplica modo "lyrics")
  └── Envía PlaybackAnchor + party:event ("karaoke_override" | "karaoke_offset")
                 │
                 ▼ (Cloud WS / Direct P2P / LAN Hub / Supabase fallback)
[Pantalla TV Web & Android TV v3.3.0]
  ├── resolveKaraokePresentation(track, boothKaraokeMode, overrideMode, videoEmbedFailed)
  │     ├── "none"   ──▶ Vista SALON | PORTADA (0% video)
  │     │                TvAudioEngine / NativeVideoPlayer oculto (desmontado si CABINA_ONLY)
  │     ├── "video"  ──▶ MISMO TvAudioEngine / NativeVideoPlayer promovido a FULLSCREEN
  │     │                - CABINA_ONLY: video visible + muted=true + sync reloj Cabina
  │     │                - TV_ONLY/BOTH: video visible + muted=false + volumen Cabina
  │     │                - Overlay mínimo: badge superior izq + QR discreto inferior der
  │     │                - Si error de embed YT (101/150): degrada automático a "lyrics"
  │     └── "lyrics" ──▶ Vista SALON | PORTADA (0% video) + KaraokeLyricsOverlay
  │                      Consulta /api/lyrics (no-store) + aplica offsetSec (±0.5s)
```

### Principio clave: una sola instancia de reproductor
No se crea un segundo iframe ni un segundo WebView para el karaoke. `TvAudioEngine` (Web) y `NativeVideoPlayer` (Android TV) reciben una prop booleana `videoVisible: boolean`:
- Cuando `videoVisible === false`: conservan exactamente el comportamiento actual (ocultos detrás del UI opaco a `200×112` cuando `audioActive === true`, o completamente desmontados cuando `audioActive === false`).
- Cuando `videoVisible === true`: el contenedor se expande a pantalla completa visible (`fixed inset-0 z-30` en Web / `Modifier.fillMaxSize()` en Android TV) y permanece montado incluso si `audioActive === false` (`CABINA_ONLY`), forzando `muted = true` y sincronizándolo contra `anchor` para evitar eco o doble audio.

---

## 3. Diseño Detallado por Módulo

### 3.1 Módulo puro de detección Karaoke (`src/lib/domain/karaoke.ts` + espejo Kotlin)
```ts
export type KaraokeOverrideMode = "auto" | "force_video" | "force_lyrics" | "off";
export type KaraokePresentation = "none" | "video" | "lyrics";

export function isTrackKaraokeCandidate(track: {
  title?: string | null;
  artist?: string | null;
  isKaraoke?: boolean | null;
} | null | undefined): boolean;

export function resolveKaraokePresentation(params: {
  track: {
    title?: string | null;
    artist?: string | null;
    source?: string | null;
    youtubeVideoId?: string | null;
    isKaraoke?: boolean | null;
  } | null | undefined;
  boothKaraokeMode: boolean;
  overrideMode?: KaraokeOverrideMode;
  videoEmbedFailed?: boolean;
}): KaraokePresentation;
```
**Reglas exactas:**
1. `isTrackKaraokeCandidate(track)` devuelve `true` si `track.isKaraoke === true` **o** si `title`/`artist` coincide con palabras clave de karaoke (`/\b(karaoke|pista\s+karaoke|con\s+letra|sing\s*along|sing\s+king|karafun|versi[oó]n\s+karaoke|karaoke\s+version|instrumental\s+con\s+letra|pista\s+musical)\b/i`). Nota: evita falsos positivos con `"instrumental"` suelto salvo que acompañe `"karaoke"` / `"con letra"` o venga marcado con `isKaraoke: true`.
2. `canShowYoutubeVideo = Boolean(track && track.source !== "upload" && track.youtubeVideoId && !videoEmbedFailed)`.
3. Evaluación según `overrideMode` (por defecto `"auto"`, se reinicia a `"auto"` al cambiar de pista):
   - `"off"` → siempre `"none"`.
   - `"force_video"` → `canShowYoutubeVideo ? "video" : "lyrics"`.
   - `"force_lyrics"` → `"lyrics"`.
   - `"auto"`:
     - Si `isTrackKaraokeCandidate(track)` y `canShowYoutubeVideo` → `"video"`.
     - Si `isTrackKaraokeCandidate(track)` y `!canShowYoutubeVideo` → `"lyrics"`.
     - Si `boothKaraokeMode` → `"lyrics"`.
     - En caso contrario → `"none"`.

### 3.2 Reparación de `/api/lyrics` (`src/app/api/lyrics/route.ts` y `src/lib/domain/lyrics.ts`)
1. **Headers HTTP seguros para Netlify CDN:**
   ```ts
   const RESPONSE_HEADERS = {
     "Access-Control-Allow-Origin": "*",
     "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
     "CDN-Cache-Control": "no-store",
     "Netlify-CDN-Cache-Control": "no-store",
   };
   ```
2. **Caché en memoria diferenciada por resultado:**
   - Aciertos (`found: true`): TTL 6 horas (`MAX_CACHE_SIZE = 250`).
   - Negativos (`found: false`): TTL corto de **60 segundos** (permite recuperación inmediata ante timeouts transitorios).
3. **Búsqueda robusta de letras para modo `"lyrics"`:**
   - Mantener búsqueda paralela LRCLIB + YouTube Captions + `lyrics.ovh`.
   - Agregar paso extra en LRCLIB: si la búsqueda con título completo no devuelve letras sincronizadas, probar con título normalizado sin tildes/puntuación extra y sin `ft./feat./remix`.
   - En `KaraokeLyricsOverlay` y `TvScreen.kt`, **no cachear permanentemente en cliente** respuestas `{ found: false }` (para que reintentar o corregir una pista no quede trabado).

### 3.3 `TvAudioEngine` (Web TV — `src/components/player/tv-audio-engine.tsx`)
- Nuevas props:
  - `videoVisible?: boolean` (default `false`)
  - `onVideoError?: (code: number) => void` (si YouTube reporta error de embed `100 | 101 | 150 | 152` durante karaoke video, notifica a `PlayerScreen` para degradar automáticamente a `"lyrics"`).
- **Montaje condicional:**
  - `shouldMountYoutube = Boolean((audioActive || videoVisible) && track && !isUploadTrack)`.
  - Si `videoVisible && !audioActive` (`CABINA_ONLY` + Karaoke Video): el iframe se monta visible en fullscreen, arranca con `mute=1` (permitiendo autoplay 100% sin bloqueo del navegador!), **no** dispara `onBlockedChange(true)` ni `onEnded()` de forma competitiva si Cabina está viva, y ejecuta el bucle de corrección de drift usando el reloj de Cabina (`anchor`) para mantener el video pegado al audio de Cabina (`umbral ±0.35s`).
  - Si `videoVisible && audioActive` (`TV_ONLY` o `BOTH` + Karaoke Video): el mismo iframe corre visible en fullscreen con `mute=0`, volumen de Cabina y sincronización idéntica a la actual.
- **Estilo del contenedor YouTube:**
  - `videoVisible === false`: `fixed bottom-0 right-0 w-[200px] h-[112px] opacity-[0.01] pointer-events-none -z-10 overflow-hidden` (idéntico al actual).
  - `videoVisible === true`: `fixed inset-0 z-30 bg-black pointer-events-none` (fullscreen limpio, sin controles ni overlays nativos de YouTube, por debajo de los overlays discretos `z-40` y modales `z-50+`).

### 3.4 `PlayerScreen` (Web TV — `src/components/player/player-screen.tsx`)
- Estado adicional:
  - `karaokeOverride: KaraokeOverrideMode` (default `"auto"`, resetea a `"auto"` al cambiar de canción).
  - `karaokeVideoEmbedFailed: boolean` (default `false`, resetea a `false` al cambiar de canción).
- Calcula `karaokePresentation = resolveKaraokePresentation(...)`.
- Escucha `party:event` (WS y Supabase fallback) con `type === "karaoke_override"` (`mode: KaraokeOverrideMode`) y actualiza `karaokeOverride` al instante con aviso breve en HUD.
- Cuando `karaokePresentation === "video"`:
  - Pasa `videoVisible={true}` a `<TvAudioEngine />`.
  - Renderiza el **Overlay Fullscreen Karaoke mínimo (`z-40`)**:
    - Esquina superior izquierda: píldora compacta translúcida `🎤 KARAOKE` + título/artista + badge de audio (`🎧 Solo Cabina` / `🔊 Cabina + TV` / `📺 Audio TV`).
    - Esquina inferior derecha: tarjeta QR discreta (`size-16` / `72px`) clicable para agrandar si hace falta, sin invadir la zona de letras del video.
  - Oculta los layouts `SALON` y `PORTADA` mientras dura el video karaoke; apenas termina y entra una canción normal, vuelven automáticamente sin parpadeo.
  - Mantiene dedicatorias en vivo, badge de vote-to-skip y botón de desbloqueo de audio (si `audioActive && tvAudioBlocked`) visibles por encima (`z-50`).
- Cuando `karaokePresentation === "lyrics"`:
  - Mantiene `videoVisible={false}` (0% video) y renderiza `<KaraokeLyricsOverlay />` en `SALON` y `PORTADA` con `offsetSec` y fuente arreglada.

### 3.5 Cabina (`src/components/panel/panel-playback-footer.tsx`)
- Calcula localmente `karaokePresentation` para la pista en curso usando la misma función `resolveKaraokePresentation`.
- Conserva el botón `Karaoke` (activa/desactiva `karaokeMode` global) y agrega un **selector rápido contextual** cuando la pista actual está en karaoke (o auto-detectada):
  - Badge/botón ciclable o chips compactos: **`🎬 Video`** | **`📝 Letra`** | **`✕ Normal`** que envían `party:event` `{ type: "karaoke_override", mode }` por WS + Supabase fallback.
  - Muestra la píldora `-0.5s / 0.0s / +0.5s` únicamente cuando la presentación efectiva es `"lyrics"` (cuando es `"video"`, la letra viene sincronizada en el propio video).

### 3.6 Android TV (`v3.3.0`, `versionCode = 12`)
- **`android-tv/app/src/main/kotlin/app/poneleplay/tv/ui/NativeVideoPlayer.kt`:**
  - Agrega parámetro `videoVisible: Boolean = false` y callback `onEmbedError: (Int) -> Unit = {}`.
  - Monta el WebView cuando `(audioActive || videoVisible) && source != "upload" && videoId.isNotBlank()`.
  - Cuando `videoVisible == true`: usa `Modifier.fillMaxSize().alpha(1f)` y en `CABINA_ONLY` (`!audioActive`) fuerza `mute()` + bucle de sincronización visual al reloj del `liveAnchor`.
  - Cuando `videoVisible == false`: mantiene `Modifier.size(200.dp, 112.dp).alpha(0.01f)` detrás del UI opaco (o desmontado en `CABINA_ONLY`).
- **`android-tv/app/src/main/kotlin/app/poneleplay/tv/MainActivity.kt` y `TvScreen.kt`:**
  - Implementa la misma función `resolveKaraokePresentation(...)` en Kotlin.
  - Escucha `party:event` `"karaoke_override"` desde `TvSyncSocketClient` (resetea a `"auto"` al cambiar de pista).
  - Cuando la presentación es `"video"`: coloca `NativeVideoPlayer` en fullscreen visible y muestra únicamente la píldora superior izquierda + QR discreto inferior derecho (`72.dp`), manteniendo dedicatorias y alertas encima.
  - Cuando la presentación es `"lyrics"`: mantiene 0% video y muestra `KaraokeLyricsPanel` con `/api/lyrics` arreglado y `karaokeOffsetSec`.
  - Bump de versión a `versionCode = 12`, `versionName = "3.3.0"` en `android-tv/app/build.gradle.kts` y `src/app/api/tv/version/route.ts`.

---

## 4. Manejo de Errores y Casos Borde

| Caso borde | Comportamiento garantizado |
|---|---|
| Video YouTube Karaoke bloquea embed (error 101/150/152) | `onVideoError` / `onEmbedError` activa `karaokeVideoEmbedFailed = true` para esa pista y degrada automáticamente a `"lyrics"` (0% pantalla negra). |
| Autoplay en navegador Web TV en modo `CABINA_ONLY` | El iframe de Karaoke Video arranca con `mute=1` (los navegadores siempre permiten autoplay silenciado sin requerir clic). |
| Cambio de `CABINA_ONLY` ↔ `TV_ONLY` ↔ `BOTH` durante un Karaoke | Al ser la misma instancia de iframe/WebView, solo alterna `mute`/`unmute` y volumen sin recargar el video ni perder el segundo actual. |
| Canción normal con palabra "Instrumental" (sin ser karaoke) | No dispara `"video"` por error; solo dispara `"video"` con frases claras de karaoke (`karaoke`, `con letra`, `pista karaoke`, `sing along`, `karafun`, `sing king`) o `isKaraoke: true`. |
| Cambio de una pista Karaoke a una canción normal | `karaokeOverride` vuelve a `"auto"`, `karaokeVideoEmbedFailed` vuelve a `false`, `karaokeOffsetSec` vuelve a `0`, y la TV vuelve inmediatamente a `SALON` / `PORTADA` (0% video). |
| Falla temporal de LRCLIB o YouTube Captions | `/api/lyrics` devuelve `Cache-Control: no-store` y solo cachea el negativo 60s en memoria, evitando quedar bloqueado 5 min o 6 horas. |

---

## 5. Estrategia de Pruebas y Verificación

1. **Tests unitarios nuevos/actualizados (Vitest):**
   - `tests/unit/karaoke-mode.test.ts`: pruebas de `isTrackKaraokeCandidate` y `resolveKaraokePresentation` (auto-detección por flag y título, falso positivo `"Instrumental"`, override `off`/`force_video`/`force_lyrics`, degradación por `videoEmbedFailed`, pista `upload`).
   - `tests/unit/lyrics.test.ts`: verificar limpieza de títulos y probar headers `Cache-Control: no-store` del handler `GET /api/lyrics`.
   - `tests/unit/tv-audio-engine.test.tsx`: verificar que en `CABINA_ONLY` con `videoVisible=false` no monta YouTube, con `videoVisible=true` monta YouTube fullscreen en silencio (`muted`), y en `TV_ONLY` / `BOTH` con `videoVisible=true` monta fullscreen con audio activo.
2. **Verificación Web completa:**
   - `npm run typecheck` (0 errores)
   - `npm run lint` (0 errores)
   - `npx vitest run` (100% suites en verde)
   - `npm run build` (compilación producción limpia)
3. **Verificación Android TV `v3.3.0`:**
   - `.\gradlew.bat :app:testDebugUnitTest :app:assembleRelease`
   - Publicación de APK en `public/tv.apk`, `public/poneleplay-tv.apk` y `dist-apk/poneleplay-tv.apk`.
4. **Verificación post-deploy en producción:**
   - Probar `curl` a `https://poneleplay.netlify.app/api/lyrics` con 2 canciones diferentes seguidas confirmando que cada una devuelve su propia letra y `Cache-Control: no-store`.
