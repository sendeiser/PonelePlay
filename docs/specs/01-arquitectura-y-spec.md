# Spec Maestro de Arquitectura y Producto — PonelePlay V2

**Metodología:** PEVC V6 (Vibe Coding Profesional)  
**Estado:** Pendiente de aprobación del usuario (`Spec aprobado`) para iniciar Fase 2  
**Última actualización:** 2026-11-16

---

## 1. Resumen Ejecutivo y Propósito del Sistema (`PonelePlay V2`)

**PonelePlay V2** es un ecosistema musical colaborativo en tiempo real tipo *jukebox social* para fiestas, juntadas y eventos donde un **Anfitrión (Host)** conecta la música al sistema de sonido (celular, PC o Smart TV) y los **Invitados (Guests)** proponen y votan canciones al instante sin instalar nada ni requerir cuentas pagas.

### Ecosistema Multi-Plataforma Completo

1. **Web + PWA Instalable (Celulares Android/iOS y Desktop):**
   - Los invitados entran al instante por enlace o QR desde el navegador sin instalar nada.
   - Tanto el Anfitrión como los Invitados frecuentes pueden instalar la app como **PWA** (*"Agregar a pantalla de inicio"* mediante `vite-plugin-pwa`, `manifest.webmanifest`, Service Worker offline-ready e iconos adaptativos `192x192` / `512x512`).
   - Incluye soporte de **Screen Wake Lock API** (`navigator.wakeLock`) para evitar que la pantalla del celular del Host se apague mientras está reproduciendo música, y detección de `beforeinstallprompt` para ofrecer un botón nativo de instalación en UI.
2. **App Mobile Android (`Capacitor`):**
   - Empaquetado nativo mediante **`@capacitor/core` y `@capacitor/android`** (carpeta `/android-mobile`) compartiendo el 100% de la interfaz y lógica de la SPA React + Vite para generar e instalar el **APK nativo en celulares Android**.
3. **App Android Nativa para Smart TV (`/android-tv` — Kotlin + Jetpack Compose for TV):**
   - Aplicación nativa dedicada para **Android TV / Google TV** construida con **Kotlin + Jetpack Compose for TV (`androidx.tv:tv-material`)**, declarada para **Android TV Leanback Launcher** (`CATEGORY_LEANBACK_LAUNCHER` y banner TV) con diseño **10-foot UI (1920x1080)** pensado para leerse cómodamente a 3 metros de distancia.
   - Operable al **100% con Control Remoto (D-Pad)** mediante foco visual de alto contraste (`FocusRequester`, escala + borde luminoso en cada tarjeta/botón, navegación `Up/Down/Left/Right`, `OK/Select`, `Back` y teclas multimedia `Play/Pause` y `Media Next`).

### Arquitectura Dual de Reproducción de Audio (Modo Universal)

Para eliminar la barrera de exigir una cuenta paga al anfitrión, **PonelePlay V2** implementa dos motores de audio intercambiables en tiempo real:

1. **Motor 1 — YouTube Music Audio (Sin Cuenta Premium / 100% Gratuito):**
   - Reproduce canciones completas (pistas *Official Audio / Topic* de YouTube Music) mediante **`YouTube IFrame Player API` (`YT.Player`)** en Web/PWA/Mobile y mediante el reproductor embebido en modo audio en Android TV.
   - **Experiencia visual "Solo Portada de Álbum":** El contenedor de video permanece técnicamente activo para procesar el audio (`playVideo`, `pauseVideo`, `seekTo`, `setVolume`, detección de fin de pista `ENDED`), pero **visualmente oculto** (`sr-only` / capa técnica oculta). La UI muestra **exclusivamente la portada HD del álbum**, metadatos limpios, barra de progreso sincronizada y controles de reproductor musical.
   - No requiere suscripción YouTube Music Premium ni iniciar sesión en YouTube.
2. **Motor 2 — Spotify Premium (Web Playback SDK + Spotify Connect):**
   - Permite a anfitriones con **Spotify Premium** autenticarse vía **OAuth 2.0 PKCE** para reproducir en el navegador (**Web Playback SDK**) o controlar remotamente la app de Spotify en su celular, PC o Smart TV (**Spotify Connect API**).
3. **Coordinación Multi-Dispositivo de Salida de Audio (`audio_output`):**
   - Mediante `rooms.playback_state.audio_output` (`'host_device' | 'tv'`), la sala coordina en tiempo real si el sonido sale por el dispositivo del Anfitrión o directamente por los parlantes de la Smart TV, **evitando reproducción duplicada en ambos dispositivos a la vez**.

---

## 2. Módulos, Roles de Usuario y Reglas de Negocio Exactas

### 2.1 Rol 1: Anfitrión (Host)

El usuario que crea la sala adquiere el rol `host` en `room_participants` y coincide con `rooms.host_id`.

- **Configuración inicial y edición de sala:**
  - Nombre de la sala (ej. *"Cumple de Tincho"*).
  - Generación automática de código corto alfanumérico único de 6 caracteres (ej. `PLAY42`), URL directa (`/join/PLAY42`) y Código QR descargable/proyectable.
  - Selección de motor de reproducción activo (`youtube_music` sin Premium por defecto, o `spotify`).
  - Configuración de límites anti-spam:
    - `max_pending_per_user`: máximo de canciones en estado `pending` simultáneas por invitado (defecto: `5`, rango: `1` a `20`).
    - `cooldown_seconds`: segundos mínimos de espera entre propuestas de un mismo invitado (defecto: `10` segundos, rango: `0` a `300`).
  - Configuración de playlist/género de respaldo (**Autoplay** en cola vacía): categoría musical base (`party_hits`, `cumbia_cachengue`, `pop_electronica`, `rock_nacional`, `urbano_latino`) o playlist de respaldo.
- **Controles exclusivos de reproducción:**
  - `Play / Pause`, `Skip` (pasar a la siguiente canción mejor votada), `Seek` (mover barra de progreso), `Volumen / Mute`.
  - Conmutador de fuente (`YouTube Music Audio` ↔ `Spotify Web Player` ↔ `Spotify Connect Device`).
  - Selector de salida de audio (`Este dispositivo` ↔ `Smart TV conectada`).
- **Poderes de moderación sobre la sala:**
  - **Fijar arriba (`Pin to top`):** Marca `is_pinned = true` en un `queue_item` para que suene inmediatamente después del tema actual sin importar los votos.
  - **Reproducir ahora (`Play now`):** Marca la canción actual como `played` y pasa de inmediato el `queue_item` seleccionado a `playing`.
  - **Eliminar / Bloquear canción (`status = 'blocked'`):** Retira el tema de la cola activa y bloquea su `spotify_track_id` / `youtube_video_id` dentro de esa sala para impedir que cualquier invitado vuelva a proponerlo.
  - **Expulsar / Bloquear invitado (`is_banned = true`):** Revoca en tiempo real la participación del invitado en `room_participants`. La sesión expulsada pierde acceso RLS de lectura/escritura en la sala.
  - **Finalizar / Cerrar sala (`is_active = false`):** Congela la cola, detiene la reproducción y redirige a todos los participantes (y a la Smart TV) al **Resumen de Fin de Fiesta**.

### 2.2 Rol 2: Invitado (Guest) — Identidad Híbrida

- **Entrada rápida sin registro (Flujo principal):**
  - El invitado accede escaneando el QR de la Smart TV o del celular del Host, entrando por link directo o ingresando el código de 6 caracteres.
  - No requiere instalar ninguna app ni tener cuentas pagas.
  - Ingresa su **Apodo (`display_name`)** (2 a 24 caracteres) y elige un **Avatar/Emoji** (`avatar_emoji`).
  - En segundo plano, el cliente inicia sesión con **Supabase Anonymous Auth** (`supabase.auth.signInAnonymously()`), crea/actualiza su perfil en `public.users` y lo registra en `public.room_participants`. Esto garantiza un `auth.uid()` real en PostgreSQL para hacer cumplir `UNIQUE(queue_item_id, user_id)` y RLS.
- **Vinculación opcional de cuenta:**
  - Botón para vincular la sesión anónima con **Google OAuth o Email** (`supabase.auth.linkIdentity()` / `updateUser()`) y conservar su historial de salas, temas propuestos y trofeos de "DJ de la noche" entre dispositivos.

### 2.3 Reglas de Votación, Cola Dinámica y Casos Borde

1. **Voto Único por Usuario y Canción:**
   - Restricción estricta en base de datos: `UNIQUE(queue_item_id, user_id)` en la tabla `votes`.
   - Cada participante activo no baneado puede emitir **Upvote (`+1`)**, **Downvote (`-1`)**, cambiar entre ambos o retirar su voto.
2. **Cálculo de Puntaje Neto y Downvotes:**
   - `net_score = upvotes_count - downvotes_count` (columna generada almacenada en PostgreSQL).
   - Los votos negativos bajan la canción en la cola pero **nunca eliminan automáticamente una canción** (solo el Host puede eliminar/bloquear).
3. **Ordenamiento Determinístico en Tiempo Real:**
   - Toda la cola pendiente (`status = 'pending'`) se ordena mediante:
     1. `is_pinned DESC` (canciones fijadas por el Host primero).
     2. `net_score DESC` (mayor puntaje neto primero).
     3. `created_at ASC` (en caso de empate, gana la propuesta más antigua — FIFO).
4. **Regla Anti-Duplicados Inteligente:**
   - Si un usuario intenta proponer una canción ya existente en la sala:
     - En `status = 'pending'`: no se duplica; si no la había votado positivamente, registra automáticamente un **Upvote (`+1`)** y muestra toast *"¡Esta canción ya está en la cola! Sumamos tu voto (+1)"*. Si ya tenía su `+1`, muestra *"Esta canción ya está en la cola y ya tiene tu voto"*.
     - En `status = 'playing'`: muestra *"¡Esta canción está sonando ahora mismo!"*.
     - En `status = 'blocked'`: muestra *"El anfitrión bloqueó esta canción en esta sala"*.
     - En `status = 'played'`: permite proponerla nuevamente como nuevo `queue_item`.
5. **Regla Anti-Spam por Invitado:**
   - Validada en UI y en PostgreSQL RPC `propose_or_upvote_song`:
     - El Host está exento de límites.
     - Un invitado no puede superar `rooms.max_pending_per_user` temas simultáneos en `pending` propuestos por él ni proponer una canción nueva antes de cumplirse `rooms.cooldown_seconds` desde `room_participants.last_proposed_at` (sumar `+1` a un duplicado no consume cupo ni cooldown).
6. **Autoplay / Respaldo en Cola Vacía (Empty Queue Fallback):**
   - Cuando termina la canción actual y no hay `queue_items` en `pending`:
     - El reproductor activo (Host o Smart TV según `audio_output`) toma automáticamente una pista del género de respaldo configurado (`rooms.fallback_genre`) e indica *"Autoplay de respaldo — ¡Proponé un tema para tomar el control!"*.
     - En cuanto entra una propuesta nueva, suena al terminar la pista actual o al presionar Skip.
7. **Reacciones Rápidas en Vivo (Floating Reactions):**
   - Botones `🔥`, `❤️`, `🕺`, `👎` sobre *Sonando Ahora*, transmitidos por **Supabase Realtime Broadcast** en el canal `room:{room_id}` (evento `reaction`) con throttling de 400ms para animarse tanto en celulares/Web como en la app nativa de Smart TV.

---

## 3. Arquitectura del Buscador Dual Inteligente con Caché (`music-search`)

Los invitados nunca necesitan cuenta de Spotify ni YouTube para buscar canciones.

### Flujo de Búsqueda y Resolución (`Edge Function: music-search`)

1. **Entrada soportada:** Texto libre (canción, artista, álbum) o pegado directo de URLs de **YouTube** (`youtube.com/watch?v=...`, `youtu.be/...`), **YouTube Music** (`music.youtube.com/watch?v=...`) o **Spotify** (`open.spotify.com/track/...`).
2. **Paso 1 — Caché local en Supabase (`public.songs`):** Busca coincidencias previas por ID externo o texto normalizado con `youtube_video_id` y metadatos completos para respuesta inmediata sin cuota externa.
3. **Paso 2 — Metadatos Musicales Limpios:** Consulta **Spotify Web API** (`/v1/search` / `/v1/tracks/:id`) con credenciales de servidor en Supabase (`SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`) o token del Host, obteniendo `spotify_track_id`, título limpio, artista, álbum, duración y portada HD cuadrada (`600x600`). Para links de YouTube/YTM resuelve oEmbed/metadatos públicos.
4. **Paso 3 — Resolución Gratuita de `youtube_video_id`:** Resuelve el ID de video/audio oficial (`Official Audio` / `Topic` embebible en IFrame) mediante resolución pública / instancias Piped-Invidious con fallback configurable a YouTube Data API v3, y **persiste el resultado en `public.songs`** para reutilización gratuita indefinida.

---

## 4. Inventario Completo de Pantallas: Web / PWA / Mobile y App Android Nativa Smart TV

### 4.1 Pantallas Web / PWA / Mobile (`React + Vite + Capacitor`)

1. **Vista 1 — Landing / Inicio (`/`):**
   - Header con logotipo `PonelePlay V2`, toggle Dark Mode (por defecto) / Light Mode, botón **"Instalar App (PWA)"** (visible cuando `beforeinstallprompt` está disponible o guía rápida iOS) y menú de perfil/vinculación.
   - Tarjeta A: **"Crear Sala como Anfitrión"** (nombre de sala, motor por defecto `YouTube Music Sin Premium` o `Spotify Premium`, acordeón de opciones anti-spam y Autoplay).
   - Tarjeta B: **"Unirse a una Sala"** (código de 6 caracteres con auto-mayúsculas).
   - Sección **"Mis Salas Recientes"** con estado (`En vivo` / `Finalizada`).
2. **Vista 2 — Onboarding / Entrada Rápida (`/join/:code`):**
   - Muestra nombre de sala, Host y motor activo.
   - Input de Apodo, selector de 12 Avatares Emoji, botón **"Entrar a Votar y Proponer"**, y enlace secundario *"Vincular Google / Email"*.
   - Estados de borde: Sala no encontrada (`404`), Sala finalizada (redirige a `/room/:code/summary`), Usuario baneado.
3. **Vista 3 — Sala en Vivo (`/room/:code` — Adaptativa Host / Guest):**
   - **Top Bar:** Nombre de sala, badge de motor (`YouTube Music Audio` / `Spotify`), chip de código copiable, botón **Compartir / QR**, botón **Modo TV Web** (`/room/:code/tv`), indicador de salida de audio (`Audio en Host` / `Audio en Smart TV`) y botón **Ajustes / Cerrar Fiesta** (Host).
   - **Tarjeta Hero "Sonando Ahora":** Portada cuadrada HD (video siempre oculto), título, artista, *"Propuesta por @apodo"*, barra de progreso sincronizada, lluvia de reacciones flotantes (`🔥`, `❤️`, `🕺`, `👎`), y **Panel de Control del Host** (`Play/Pause`, `Skip`, `Seek`, `Volumen`, selector de motor y selector de salida `Host ↔ Smart TV`, más botón *"Activar Audio"* si el navegador bloqueó autoplay inicial y control de Screen Wake Lock).
   - **Barra de Búsqueda Rápida + Indicador de Cupo:** Botón sticky *"Buscar canción o pegar link..."* + badge *"Pendientes: 2/5"* / countdown de cooldown.
   - **Tabs:** `Cola en Vivo (N)` (posición, portada, título, artista, duración, proponente, Upvote `▲`, `net_score`, Downvote `▼`, menú Host `⋮` con Pin/Reproducir ya/Bloquear), `Ya Sonaron (N)`, `Participantes (N)` (con puntos DJ y botón Host Expulsar).
   - **Empty States:** Cola vacía con Autoplay activo invitando a proponer tema; búsqueda sin resultados; historial vacío.
4. **Vista 4 — Modo TV Web (`/room/:code/tv`):**
   - Layout panorámico 16:9 para proyectar desde navegador: portada HD gigante (sin video), ondas animadas, progreso, reacciones flotantes, QR gigante + código `PLAY42` y Top 5 de próximas canciones.
5. **Vista 5 — Resumen de Fin de Fiesta (`/room/:code/summary`):**
   - Podio Top 3 DJs de la noche, Canción Reina, métricas globales, botón **"Guardar como Playlist en Spotify"** y **"Copiar Tracklist / Exportar para YouTube Music"**.
6. **Modales Transversales:** Buscador de canciones (con debounce 350ms, skeletons, `+ Proponer` / `+1 Voto`), Modal Compartir/QR (QR descargable + WhatsApp + Link), Modal Ajustes del Host (límites, género Autoplay, Spotify OAuth, Finalizar Fiesta con confirmación) y Modal Vincular Cuenta.

### 4.2 Pantallas App Android Nativa para Smart TV (`/android-tv` — Kotlin + Jetpack Compose for TV)

Diseñada con **`androidx.tv:tv-material`**, resolución base **1920x1080 (10-foot UI)**, tipografía grande legible a distancia, y **navegación 100% por D-Pad del control remoto** con estados claros de foco (borde iluminado neón + escala `1.05x`):

1. **`TvHomeScreen` — Inicio y Vinculación en Smart TV:**
   - Banner superior con identidad `PonelePlay TV` y selector de modo de conexión.
   - **Opción 1 — "Unirse a Sala con Código":** Selector numérico/alfabético de 6 casillas optimizado para D-Pad (sin depender de teclado físico) para ingresar el código de la sala del Host y conectarse al instante.
   - **Opción 2 — "Crear Sala Nueva desde esta TV":** Con un solo clic del botón `OK` del control remoto, crea una sala lista usando YouTube Music Audio (sin cuenta Premium) teniendo a la propia TV como Host/Reproductor principal.
   - **Lista "Salas Recientes en esta TV":** Tarjetas enfocables horizontalmente (`TvLazyRow`) para reconectarse con un toque del control remoto.
2. **`TvRoomScreen` — Sala en Vivo en Smart TV (Modo Dual):**
   - **Selector / Conmutador Dual accesible con D-Pad:**
     - **Modo A — TV como Reproductor Principal de la Fiesta (`audio_output = 'tv'`):**
       - La app de Android TV reproduce el audio completo de la canción en los parlantes del televisor / barra de sonido usando el motor YouTube Music Audio (sin cuenta Premium y con video oculto, mostrando únicamente la portada HD del álbum).
       - Al finalizar cada canción, la app avanza automáticamente a la siguiente canción mejor votada en Supabase (`advance_room_playback`) o dispara el Autoplay de respaldo si la cola está vacía.
       - Soporta teclas multimedia y D-Pad: `OK/Play-Pause` para pausar/reanudar, botón `Siguiente` para saltar canción, y botón `Cambiar a Solo Pantalla` para ceder el audio al Host.
     - **Modo B — Pantalla Visual Sincronizada (`audio_output = 'host_device'`):**
       - El televisor silencia su reproductor local y se mantiene sincronizado en tiempo real vía Supabase Realtime con lo que reproduce el dispositivo del Host.
   - **Layout 10-foot UI en `TvRoomScreen`:**
     - **Panel Izquierdo (~55%):** Portada gigante cuadrada HD del álbum con aura ambiental dinámica, indicador `Reproduciendo en TV` vs `Audio en dispositivo del Host`, título en tipografía display grande, artista, badge *"Propuesta por @apodo"*, ecualizador animado, barra de progreso y **lluvia de reacciones flotantes en vivo (`🔥`, `❤️`, `🕺`, `👎`)**.
     - **Panel Derecho (~45%):** Tarjeta destacada con **Código QR gigante** de alto contraste + código `PLAY42` en tipografía monospace extra grande para escanear desde el sillón + lista **"A continuación (Top 5)"** con puntaje neto (`▲ +12`) actualizándose en tiempo real.
     - **Barra inferior de controles D-Pad:** Botones enfocables `Play/Pause`, `Siguiente Tema`, `Alternar Reproductor TV / Solo Pantalla`, `Finalizar Fiesta` (si es Host de la TV) y `Desconectar`.
3. **`TvSummaryScreen` — Resumen de Fin de Fiesta en Smart TV:**
   - Se muestra automáticamente cuando la sala pasa a `is_active = false`:
   - Podio gigante animado del **Top 3 DJs de la Noche**, **Canción Reina de la Fiesta** con su portada y votos totales, estadísticas globales y botón enfocable con D-Pad **"Volver al Inicio"** / **"Crear Nueva Fiesta"**.

---

## 5. Pila Tecnológica Confirmada (Etapa B)

| Capa / Plataforma | Tecnología Elegida | Justificación y Alcance |
| :--- | :--- | :--- |
| **Web & PWA** | **React 18+ + Vite + TypeScript + `vite-plugin-pwa`** | SPA ultra rápida, instalable como PWA en Android/iOS/Desktop con Service Worker y Screen Wake Lock API. |
| **Mobile Android** | **Capacitor (`@capacitor/core`, `@capacitor/android`)** | Empaqueta la web/PWA en APK nativo Android (`/android-mobile`) sin duplicar lógica ni pantallas. |
| **Smart TV Nativa** | **Kotlin + Jetpack Compose for TV (`androidx.tv:tv-material`)** | App Android TV nativa (`/android-tv`) con Leanback Launcher, navegación D-Pad, reproducción de audio y sincronización Realtime. |
| **Routing Web** | **React Router DOM v6/v7** | Rutas `/`, `/join/:code`, `/room/:code`, `/room/:code/tv`, `/room/:code/summary`. |
| **Estilos Web** | **Tailwind CSS + CSS Variables Tokens** | Dark Mode inmersivo por defecto + Light Mode, 100% responsive (375px, 768px, 1440px). |
| **Iconos & Utilidades Web** | **`lucide-react` + `sonner` + `qrcode.react`** | Iconografía vectorial, toasts no intrusivos y generación de QR en cliente. |
| **Backend & DB (Cloud)** | **Supabase Cloud (Sin Docker)** | Proyecto nuevo exclusivo `poneleplay-v2`. PostgreSQL 17, Auth, RLS, Realtime y Edge Functions compartidos por Web, PWA, Mobile y Android TV. |
| **Tiempo Real** | **Supabase Realtime** | `postgres_changes` (salas, cola, votos, participantes) + `broadcast` (reacciones flotantes y pulso de progreso) consumido tanto por `@supabase/supabase-js` como por `supabase-kt` (Android TV). |
| **Motores de Audio** | **YouTube IFrame Player API + Spotify Web Playback/Connect** | Audio gratuito sin cuenta Premium (solo portada HD) + soporte opcional de Spotify Premium OAuth PKCE. |
| **Testing & Verificación** | **Playwright + `impeccable` + `compose-preview` + `android-cli` + `android-device-hub`** | Cobertura total: E2E/visual web en 1440px/768px/375px y verificación de `@Preview` 1080p + emulador Android TV / dispositivo físico. |

---

## 6. Estrategia de Diseño UI/UX Confirmada (Etapa C)

Se ejecutará la **Opción 3: Dúo Dinámico UI/UX ⭐**:

1. **Inteligencia de Nicho (`ui-ux-pro-max`):**
   - Extracción de paleta cromática para nicho musical/jukebox nocturno (Dark Mode inmersivo por defecto + Light Mode limpio), tipografías de alta legibilidad y cumplimiento WCAG (contraste `>= 4.5:1`, área táctil móvil `>= 44x44px` y áreas de foco claras en TV 10-foot UI).
2. **Estructuración Formal y Prompt Maestro (`frontend-design` ➔ Google Stitch MCP):**
   - Generación del pliego de tokens unificado y `docs/specs/02-stitch-master-prompt.md` compartiendo identidad visual entre Web/PWA/Mobile y la app nativa de Android TV.
   - Maquetación base vía **MCP de Google Stitch** en Web/PWA y definición de pantallas `@Preview` de Jetpack Compose for TV.
3. **Auditoría Multimodal (`playwright` + `impeccable` + `compose-preview`):**
   - Web/PWA/Mobile: capturas en **Desktop (1440px)**, **Tablet (768px)** y **Mobile (375px)** en Dark y Light Mode + reparación total con `impeccable`.
   - Android TV: renderizado de `@Preview` en resolución TV 1080p mediante **`compose-preview`** y pruebas en dispositivo/emulador TV mediante **`android-cli` / `android-device-hub`**.

---

## 7. Esquema Entidad-Relación en Supabase PostgreSQL y Políticas RLS

### 7.1 Diagrama de Tablas y Columnas

```sql
-- 1. PERFILES DE USUARIO (vinculado a auth.users)
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 2 and 32),
  avatar_emoji text not null default '🎧',
  is_anonymous boolean not null default true,
  spotify_user_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. SALAS (incluye coordinación audio_output para Host vs Smart TV)
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code varchar(8) not null unique,
  name text not null check (char_length(trim(name)) between 2 and 60),
  host_id uuid not null references public.users(id) on delete cascade,
  is_active boolean not null default true,
  active_provider text not null default 'youtube_music' check (active_provider in ('youtube_music', 'spotify')),
  max_pending_per_user int not null default 5 check (max_pending_per_user between 1 and 20),
  cooldown_seconds int not null default 10 check (cooldown_seconds between 0 and 300),
  fallback_genre text not null default 'party_hits',
  current_queue_item_id uuid null,
  playback_state jsonb not null default '{
    "is_playing": false,
    "progress_ms": 0,
    "audio_output": "host_device",
    "is_autoplay": false,
    "autoplay_track": null,
    "updated_at": null
  }'::jsonb,
  created_at timestamptz not null default now(),
  ended_at timestamptz null,
  constraint rooms_playback_audio_output_check check (
    (playback_state->>'audio_output') in ('host_device', 'tv')
  )
);

-- 3. PARTICIPANTES DE SALA
create table public.room_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'guest' check (role in ('host', 'guest')),
  is_banned boolean not null default false,
  last_proposed_at timestamptz null,
  joined_at timestamptz not null default now(),
  unique (room_id, user_id)
);

-- 4. CATÁLOGO Y CACHÉ DE CANCIONES
create table public.songs (
  id uuid primary key default gen_random_uuid(),
  spotify_track_id text unique null,
  youtube_video_id text unique null,
  title text not null,
  artist text not null,
  album text null,
  duration_ms int not null default 0 check (duration_ms >= 0),
  image_url text not null,
  created_at timestamptz not null default now(),
  constraint songs_at_least_one_external_id check (
    spotify_track_id is not null or youtube_video_id is not null
  )
);

-- 5. COLA DE REPRODUCCIÓN
create table public.queue_items (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete restrict,
  proposed_by uuid not null references public.users(id) on delete cascade,
  upvotes_count int not null default 1 check (upvotes_count >= 0),
  downvotes_count int not null default 0 check (downvotes_count >= 0),
  net_score int generated always as (upvotes_count - downvotes_count) stored,
  is_pinned boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'playing', 'played', 'blocked')),
  created_at timestamptz not null default now(),
  played_at timestamptz null
);

alter table public.rooms
  add constraint rooms_current_queue_item_fk
  foreign key (current_queue_item_id) references public.queue_items(id) on delete set null;

-- 6. VOTOS ÚNICOS POR USUARIO Y CANCIÓN
create table public.votes (
  id uuid primary key default gen_random_uuid(),
  queue_item_id uuid not null references public.queue_items(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  vote_type smallint not null check (vote_type in (1, -1)),
  created_at timestamptz not null default now(),
  unique (queue_item_id, user_id)
);
```

### 7.2 Regla de Coordinación de Salida de Audio (`audio_output`)

- `playback_state.audio_output` tiene exactamente dos valores posibles:
  - `'host_device'`: Solo el dispositivo del Host (Web/PWA/Mobile) decodifica y reproduce audio. La App Android TV funciona como pantalla visual silenciosa (QR + Portada + Cola + Reacciones).
  - `'tv'`: Solo la App Nativa de Smart TV (`/android-tv`) decodifica y reproduce el audio en el televisor/barra de sonido. El navegador/celular del Host permanece silenciado y actúa como control remoto de la sala.
- Cuando la App Nativa de Android TV crea una sala propia o activa *"Reproducir audio en esta TV"*, actualiza `playback_state.audio_output = 'tv'` en Supabase; al instante todos los clientes conectados se sincronizan por `postgres_changes` y silencian o activan su motor local para impedir eco o audio duplicado.

### 7.3 Índices, Triggers, RPCs y Políticas RLS

- **Índices:** `idx_rooms_code`, `idx_queue_items_room_status_order(room_id, status, is_pinned desc, net_score desc, created_at asc)`, `idx_votes_queue_item`, `idx_room_participants_user`, e índice textual en `songs(title, artist)`.
- **Trigger `sync_queue_item_vote_counts()`:** Recalcula atómicamente `upvotes_count` y `downvotes_count` tras `INSERT/UPDATE/DELETE` en `votes`.
- **RPC `propose_or_upvote_song(...)`:** Valida sala activa, participante no baneado, bloqueo de canciones, anti-duplicados (`+1` automático si ya está `pending`), y límites anti-spam (`max_pending_per_user`, `cooldown_seconds`).
- **RPC `advance_room_playback(p_room_id uuid, p_next_queue_item_id uuid default null)`:** Invocable por el Host o por la Smart TV cuando `playback_state->>'audio_output' = 'tv'` y está vinculada como reproductor autorizado de la sala, garantizando transición atómica de `playing -> played` y selección del siguiente tema mejor votado.
- **Políticas RLS (`ENABLE ROW LEVEL SECURITY` en todas las tablas):**
  - `users`: lectura para miembros que comparten sala o propio usuario; escritura solo `auth.uid() = id`.
  - `rooms`: lectura por código para unirse/resumen; creación con `host_id = auth.uid()`; edición/cierre para `host_id = auth.uid()` (y actualización controlada del estado de playback por la sesión autorizada cuando `audio_output = 'tv'`).
  - `room_participants`: inserción propia si sala activa y no está baneado; expulsión (`is_banned = true`) exclusiva de `host_id`.
  - `queue_items` & `votes`: inserción/voto exclusivo de participantes activos no baneados en salas activas; moderación (`is_pinned`, `status = 'blocked'`) exclusiva del Host.

---

## 8. Matriz de Pruebas E2E, Visuales y Nativas

| ID | Plataforma / Entorno | Escenario de Prueba | Criterio de Aceptación (PASS) |
| :--- | :--- | :--- | :--- |
| **T01** | Web / PWA (`playwright` + `impeccable`) | Auditoría Responsive & Visual | Las 5 vistas y modales se ven impecables en **1440px**, **768px** y **375px** en Dark y Light Mode, `scrollWidth <= clientWidth`, contraste WCAG >= 4.5:1 y cero solapamientos. |
| **T02** | Web / PWA (`playwright`) | Creación de Sala (YouTube Music Sin Premium) | El Host crea sala desde `/`, se guarda en Supabase Cloud, genera código de 6 caracteres y QR válido. |
| **T03** | Web / Mobile (`playwright`) | Entrada Rápida Híbrida de Invitado | Invitado entra por `/join/:code` con apodo/emoji sin login externo; queda autenticado anónimamente y visible en Participantes. |
| **T04** | Web / Mobile (`playwright`) | Búsqueda Dual + Anti-Duplicados | Búsqueda o pegado de link; proponer canción ya pendiente suma `+1` voto en vez de duplicarla. |
| **T05** | Web / Mobile (`playwright`) | Votación Única y Orden Dinámico Realtime | Restricción `UNIQUE(queue_item_id, user_id)` y reordenamiento inmediato (`is_pinned DESC, net_score DESC, created_at ASC`). |
| **T06** | Web / PWA (`playwright`) | Anti-Spam + Solo Portada + Wake Lock | Bloqueo al superar cupo/cooldown; tarjeta *Sonando Ahora* oculta video y muestra solo portada HD; el Wake Lock se solicita al reproducir. |
| **T07** | Web / PWA (`playwright`) | Moderación Host, Reacciones, Modo TV Web y Resumen | Pin, bloqueo de tema, expulsión de invitado (`is_banned`), reacciones flotantes (`🔥❤️🕺👎`), Modo TV web y Resumen de Fin de Fiesta. |
| **T08** | PWA & Capacitor Android (`vite-plugin-pwa`, `@capacitor/android`) | Manifest, Service Worker y Proyecto Mobile Android | `manifest.webmanifest` válido, iconos 192/512, SW registrado y build de proyecto Android Capacitor (`/android-mobile`) sin errores. |
| **T09** | Android TV Nativa (`compose-preview`, `android-cli`, `android-device-hub`) | Pantallas TV 1080p, D-Pad y Modo Dual Audio | `@Preview` 1080p renderizado en `compose-preview` sin cortes; navegación por foco D-Pad operativa en `TvHomeScreen`, `TvRoomScreen` y `TvSummaryScreen`; alternancia limpia entre `audio_output = 'tv'` (reproductor en TV con avance automático) y `'host_device'` (solo pantalla sincronizada + QR gigante + reacciones). |
