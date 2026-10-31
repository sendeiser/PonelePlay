# PonelePlay — Spec de Arquitectura y Comportamiento v1

- **Proyecto:** PonelePlay
- **Tipo:** Aplicación web con tres superficies: cliente móvil por QR, panel del bar y reproductor de la PC del local.
- **Stack base:** Next.js 15 + TypeScript + Tailwind CSS v4 + Supabase (Postgres, Auth anónimo, Realtime, Storage, Edge Functions) + Vercel.
- **Idioma de UI:** español (es-AR).
- **Fecha:** 31/10/2026
- **Estado:** aprobado por el dueño el 31/10/2026.

---

## 1. Resumen del sistema

PonelePlay es un sistema de votación y cola musical en vivo para un pool bar. Los clientes escanean un QR desde su teléfono, ven la cola y la canción que suena, proponen temas y votan para ordenar la cola. Cada voto cuesta un crédito. Los créditos se obtienen con un código de único uso que el dueño o los mozos generan al vender una consumición; el staff elige cuántos créditos otorga. No existe voto gratuito. Los códigos y los créditos vencen al cierre de la noche.

El panel del bar, en la PC del negocio, controla la noche, el catálogo, los códigos y la moderación. Un reproductor web a pantalla completa, vinculado a esa PC, reproduce YouTube y archivos MP3 subidos por el dueño, avanza solo y usa una playlist de fondo cuando la cola está vacía. El cliente nunca reproduce audio: solo vota y propone.

La cola se ordena por cantidad de votos descendente y, en empate, por la propuesta más antigua. Un cliente no puede acumular más de un voto sobre la misma canción en la misma noche. El staff puede saltar la canción actual o vetar cualquier tema de la cola, sin devolución de créditos.

---

## 2. Objetivos y no objetivos

### Objetivos v1

1. Acceso instantáneo del cliente por QR, sin registro ni instalación.
2. Cola musical colaborativa en tiempo real, ordenada por votos.
3. Créditos de voto emitidos por el staff con código de único uso, impreso, mostrado o dictado.
4. Propuestas de clientes por búsqueda interna de YouTube o pegando un link, con deduplicación y filtro de contenido explícito.
5. Catálogo propio del dueño con YouTube, MP3 subidos y playlists de fondo.
6. Reproductor automático en la PC del bar con YouTube y MP3, tolerante a errores de video.
7. Control operativo del staff: skip, veto, generación de códigos y apertura/cierre de noche.
8. Seguridad de datos con RLS, funciones atómicas y registro de auditoría de acciones del staff.

### No objetivos v1

- Apps nativas Android/iOS.
- Pagos o cobros dentro de la app.
- Servicio de mesa, pedidos de bebidas o integración con el POS.
- Karaoke, letras sincronizadas o descarga de audio de YouTube.
- Voto gratuito, voto por compartir o incentivos automáticos.
- Impresión silenciosa por driver (QZ Tray u otro). La impresión es vía diálogo del navegador.
- Analítica avanzada, multi-sucursal como producto SaaS o personalización por mesa.
- Funcionamiento offline de votación.

---

## 3. Decisiones cerradas de la entrevista

| Tema | Decisión |
|---|---|
| Plataforma | Web móvil por QR. Panel web en la PC del bar. Sin app nativa. |
| Acceso del cliente | Anónimo. Supabase Auth anónimo por dispositivo; sin email ni teléfono. |
| Roles | Dueño (email/contraseña), staff (PIN), cliente anónimo, reproductor vinculado. |
| Fuentes de audio v1 | YouTube (IFrame Player API) y MP3 subidos. Playlist de fondo del dueño. |
| Spotify | Fase 2 opcional, solo con cuenta Premium y OAuth. No bloquea v1. |
| Catálogo | Lo carga el dueño. Búsqueda interna de YouTube y pegado de links. |
| Propuestas | Los clientes proponen libremente; entran directo a la cola. Modo catálogo y propuestas conviven. |
| Moderación | Deduplicación activa, filtro de títulos explícitos configurable, veto del staff. |
| Votos | Ordenan la cola. Un crédito por voto. Máximo un voto por persona por canción por noche. No se apilan votos en una canción. |
| Desempate | Gana la propuesta más antigua (`created_at` ascendente). |
| Créditos | Solo por código emitido por dueño o staff. El staff elige N créditos (1–50). |
| Códigos | 8 caracteres, único uso, vencen al cerrar la noche. Se dictan, muestran e imprimen. |
| Noche | Una sesión abierta por local a la vez. Al cerrar vencen códigos, créditos y cola. |
| Cola vacía | Suena la playlist de fondo del dueño en orden y en loop. |
| Marca | PonelePlay. Estética pool bar: fieltro verde, neón ámbar, ticket de consumición. |

---

## 4. Roles y permisos

### 4.1 Dueño

- Crea su cuenta con email y contraseña.
- Administra el local, el catálogo, la playlist de fondo, los keywords del filtro y el personal.
- Abre y cierra la noche.
- Genera códigos y opera skip/veto.
- Vincula y revoca el reproductor de la PC.
- Puede conectar Spotify (fase 2).
- Ve historial de códigos y resumen de la noche.

### 4.2 Staff (mozos)

- Ingresa con PIN de 6 dígitos asignado por el dueño.
- Genera códigos eligiendo créditos (1–50) para una consumición.
- Reimprime o dicta códigos generados en la noche.
- Salta la canción actual y veta temas de la cola.
- Abre y cierra la noche con confirmación explícita.
- Activa o desactiva propuestas de clientes durante la noche.
- No accede a ajustes, catálogo, personal ni emparejamiento del reproductor.

### 4.3 Cliente anónimo

- Escanea el QR y entra sin registro.
- Ve canción actual, cola ordenada, su saldo de créditos y su actividad.
- Busca en YouTube, propone temas y vota.
- Canjea códigos.
- No puede ver datos de otros clientes, códigos ajenos ni información interna del local.

### 4.4 Reproductor

- Dispositivo de confianza vinculado por el dueño mediante token revocable.
- Consulta la cola y la playlist de fondo.
- Reporta `playing`, `finished`, `failed` y latido de conexión.
- No puede administrar nada.

---

## 5. Arquitectura

### 5.1 Componentes

```
┌──────────────────────────────┐        ┌──────────────────────────────┐
│ Cliente móvil (Next.js)      │        │ Panel del bar (Next.js)      │
│ /p/[slug]                    │        │ /panel/[slug]                │
│ - cola en vivo               │        │ - noche, cola, códigos       │
│ - búsqueda y propuestas      │        │ - catálogo y ajustes         │
│ - canje de códigos           │        │ - staff, pairing             │
└──────────────┬───────────────┘        └──────────────┬───────────────┘
               │ HTTPS + Supabase JS (anon key, RLS)   │
               ▼                                       ▼
┌───────────────────────────────────────────────────────────────────────┐
│ Supabase                                                              │
│ Auth anónimo/email · Postgres + RLS · Realtime · Storage (MP3)       │
│ Edge Functions: staff, propose-track, youtube-search, player,         │
│                 spotify (fase 2)                                      │
└──────────────┬───────────────────────────────────────┬────────────────┘
               │                                       │
               ▼                                       ▼
┌──────────────────────────────┐        ┌──────────────────────────────┐
│ YouTube Data API v3          │        │ Reproductor de la PC          │
│ búsqueda y metadata          │        │ /player/[slug] en Chrome      │
│ YouTube IFrame Player API    │◄───────│ YouTube IFrame + <audio> MP3  │
└──────────────────────────────┘        │ polling 5s + heartbeat 15s   │
                                        └──────────────────────────────┘
```

- **Next.js** aloja las tres superficies y sirve el QR. No hay servidor propio de estado: todo pasa por Supabase.
- **Supabase Edge Functions** concentran operaciones sensibles: validación de YouTube, límites de uso, PIN del staff, token del reproductor y Spotify.
- **Supabase Realtime** empuja cambios de `queue_items`, `night_sessions` y estado del reproductor al cliente y al panel. Si el socket cae, el cliente hace polling cada 10 s.
- **El reproductor** usa polling cada 5 s a una Edge Function con su token de dispositivo. Es un único cliente; el polling evita problemas de autorización Realtime con tokens custom.
- **Storage** guarda MP3 en un bucket privado. El reproductor recibe URLs firmadas de corta duración.
- **Vercel** hostea Next.js. **Supabase Cloud** hostea datos y funciones.

### 5.2 Flujo de una noche

1. El dueño/staff abre la noche desde el panel. Se crea `night_sessions` en estado `open`.
2. El dueño enciende el reproductor en la PC; queda vinculado y muestra el QR de acceso.
3. Los clientes escanean el QR, se crea un `participant` anónimo para esa noche y reciben saldo 0.
4. El staff vende una consumición, elige créditos (por defecto 5) y genera un código. Se imprime, muestra o dicta.
5. El cliente canjea el código y obtiene créditos.
6. El cliente propone temas o vota los existentes. La cola se reordena en vivo.
7. El reproductor toca la primera canción. Al terminar, la marca `played` y toca la siguiente. Si no hay cola, suena la playlist de fondo.
8. El staff puede saltar o vetar. Los créditos gastados no se devuelven.
9. Al cerrar la noche: códigos no canjeados pasan a `expired`, saldos a 0, cola cerrada, y el reproductor pasa a playlist de fondo si está configurada. La próxima noche empieza limpia.

---

## 6. Modelo de datos (Supabase / Postgres)

### 6.1 Enums

```sql
create type track_source     as enum ('youtube', 'upload', 'spotify');
create type queue_status     as enum ('queued', 'playing', 'played', 'skipped', 'vetoed', 'failed');
create type code_status      as enum ('active', 'redeemed', 'expired');
create type night_status     as enum ('open', 'closed');
create type actor_kind       as enum ('owner', 'staff', 'system');
create type credit_reason    as enum ('code_redeem', 'vote', 'night_close');
```

### 6.2 Tablas

**venues** — local.

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | `gen_random_uuid()` |
| owner_id | uuid | FK `auth.users`, obligatorio |
| name | text | Nombre del bar |
| slug | text | Único, URL pública |
| accent_color | text | Color de marca |
| logo_url | text | Opcional |
| join_message | text | Mensaje del cliente |
| created_at | timestamptz | default now() |

**venue_settings** — configuración privada, 1:1 con venue.

| Columna | Tipo | Default |
|---|---|---|
| venue_id | uuid PK | FK venues |
| explicit_filter_enabled | boolean | true |
| explicit_keywords | text[] | lista base en español/inglés |
| max_song_duration_seconds | int | 480 |
| max_proposals_per_participant | int | 3 |
| default_credits_per_code | int | 5 |
| max_credits_per_code | int | 50 |
| max_queue_size | int | 30 |
| proposals_enabled | boolean | true |
| updated_at | timestamptz | now() |

**tracks** — catálogo y temas propuestos.

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| venue_id | uuid | FK venues |
| source | track_source | youtube / upload / spotify |
| title | text | |
| artist | text | Canal o artista |
| duration_seconds | int | Validado en YouTube, declarado en MP3 |
| thumbnail_url | text | |
| youtube_video_id | text | Solo source=youtube |
| storage_path | text | Solo source=upload |
| spotify_uri | text | Solo source=spotify (fase 2) |
| is_explicit | boolean | Marcado por filtro o dueño |
| status | text | `active` / `archived` |
| dedupe_key | text | `yt:<videoId>`, `file:<sha256>`, `sp:<trackId>` |
| created_by_kind | actor_kind | owner / client |
| created_at | timestamptz | |

Restricciones: `unique(venue_id, dedupe_key)`. Índice por `status`.

**night_sessions** — una noche del local.

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| venue_id | uuid | FK venues |
| status | night_status | |
| opened_by_kind | actor_kind | |
| opened_by_id | uuid | owner o staff |
| opened_at | timestamptz | |
| closed_at | timestamptz | |

Restricción clave: índice único parcial `(venue_id) where status = 'open'`.

**participants** — cliente anónimo dentro de una noche.

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| venue_id | uuid | |
| night_session_id | uuid | FK night_sessions |
| auth_user_id | uuid | FK auth.users (anónimo) |
| credits_balance | int | `>= 0` |
| proposals_used | int | `>= 0` |
| created_at | timestamptz | |
| last_seen_at | timestamptz | |

`unique(night_session_id, auth_user_id)`.

**queue_items** — cola de la noche.

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| venue_id | uuid | |
| night_session_id | uuid | |
| track_id | uuid | FK tracks |
| status | queue_status | |
| vote_count | int | Desnormalizado, `>= 0` |
| proposed_by_participant_id | uuid | Puede ser null si viene del catálogo |
| created_at | timestamptz | Orden de desempate |
| started_at | timestamptz | |
| ended_at | timestamptz | |

Índices:

```sql
create unique index queue_no_duplicate_active
  on queue_items (night_session_id, track_id)
  where status in ('queued', 'playing');

create index queue_order
  on queue_items (night_session_id, status, vote_count desc, created_at asc);
```

**votes** — voto individual.

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| venue_id | uuid | |
| night_session_id | uuid | |
| participant_id | uuid | FK participants |
| queue_item_id | uuid | FK queue_items |
| track_id | uuid | FK tracks |
| created_at | timestamptz | |

`unique(night_session_id, participant_id, track_id)` impide votar dos veces la misma canción aunque vuelva a encolarse.

**vote_codes** — códigos de créditos.

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| venue_id | uuid | |
| night_session_id | uuid | |
| code | text | Único, 8 caracteres sin ambigüedad |
| credits | int | 1–50 |
| status | code_status | |
| created_by_kind | actor_kind | owner / staff |
| created_by_owner_id | uuid | Nullable |
| created_by_staff_id | uuid | Nullable |
| redeemed_by_participant_id | uuid | Nullable |
| printed_count | int | Default 0 |
| created_at | timestamptz | |
| redeemed_at | timestamptz | |

Decisión: el código se guarda en texto plano porque debe poder reimprimirse y dictarse durante la noche; es de bajo valor, único uso y vence al cierre. El acceso está restringido por RLS/Edge Functions.

**credit_transactions** — ledger de créditos.

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| participant_id | uuid | |
| delta | int | Positivo o negativo |
| balance_after | int | Auditoría |
| reason | credit_reason | |
| vote_code_id | uuid | Nullable |
| queue_item_id | uuid | Nullable |
| created_at | timestamptz | |

**staff_members** — personal.

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| venue_id | uuid | |
| name | text | |
| pin_hash | text | bcrypt cost 10 |
| active | boolean | |
| failed_attempts | int | |
| locked_until | timestamptz | |
| created_at | timestamptz | |
| last_login_at | timestamptz | |

**staff_sessions** — sesiones de PIN.

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| venue_id | uuid | |
| staff_id | uuid | |
| token_hash | text | SHA-256 del token |
| created_at | timestamptz | |
| expires_at | timestamptz | 12 h |
| revoked_at | timestamptz | |

**player_devices** — PC vinculada.

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| venue_id | uuid | |
| name | text | |
| token_hash | text | SHA-256 |
| paired_by_owner_id | uuid | |
| last_seen_at | timestamptz | Latido 15 s |
| revoked_at | timestamptz | |
| created_at | timestamptz | |

**fallback_tracks** — playlist de fondo ordenada.

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| venue_id | uuid | |
| track_id | uuid | FK tracks |
| position | int | Único por local |

**staff_actions** — auditoría.

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| venue_id | uuid | |
| night_session_id | uuid | Nullable |
| actor_kind | actor_kind | |
| actor_id | uuid | |
| action | text | `generate_code`, `skip`, `veto`, `toggle_proposals`, `open_night`, `close_night` |
| payload | jsonb | |
| created_at | timestamptz | |

**rate_limits** — control de abuso de Edge Functions.

| Columna | Tipo | Notas |
|---|---|---|
| key | text | `ip:<hash>`, `user:<uuid>`, `staff:<uuid>` + acción |
| window_start | timestamptz | |
| count | int | |
| expires_at | timestamptz | |

**youtube_search_cache** — caché de búsquedas.

| Columna | Tipo | Notas |
|---|---|---|
| query_key | text PK | query + región + límite, normalizada |
| results | jsonb | |
| created_at | timestamptz | |
| expires_at | timestamptz | 24 h |

### 6.3 Funciones y Edge Functions

**RPC públicas (Supabase, `SECURITY DEFINER`, validadas con `auth.uid()`):**

| Nombre | Descripción |
|---|---|
| `get_night_state(p_venue_slug)` | Devuelve local público, noche abierta, canción actual, cola top 30, saldo del participante, flags y hora del servidor. |
| `join_night(p_venue_slug)` | Idempotente. Crea o recupera el participante anónimo de la noche abierta. |
| `redeem_code(p_code)` | Atómico: valida código activo de la noche, lo marca `redeemed`, acredita saldo y escribe ledger. |
| `cast_vote(p_queue_item_id)` | Atómico: valida noche, item `queued`, saldo, no duplicado por track; descuenta 1 crédito, inserta voto e incrementa `vote_count`. |
| `get_my_participation()` | Saldo, votos y propuestas del participante actual. |
| `owner_generate_code(p_credits)` | Genera código como dueño autenticado. |
| `owner_open_night()` / `owner_close_night()` | Ciclo de noche del dueño. |
| `owner_queue_action(p_item_id, p_action)` | Skip/veto del dueño. |
| `archive_track(p_track_id)` | Archiva un track del catálogo sin romper la cola. |

**Edge Functions:**

| Nombre | Auth | Responsabilidad |
|---|---|---|
| `propose-track` | JWT anónimo | Valida metadata de YouTube (duración, embeddable, no live), aplica filtro explícito, dedupe, límites y cupo de cola; inserta track/queue. |
| `youtube-search` | JWT anónimo o dueño | Proxy de YouTube Data API con caché, rate limit y filtrado de resultados. |
| `staff` | Token de staff | `login`, `logout`, `generate_code`, `skip`, `veto`, `toggle_proposals`, `open_night`, `close_night`, `night_state`. Verifica PIN/sesión y escribe auditoría. |
| `player` | Token de dispositivo | `state`, `heartbeat`, `started`, `finished`, `failed`. Devuelve estado, URLs firmadas y playlist de fondo. |
| `spotify` | Dueño (fase 2) | OAuth PKCE, refresh token y control de reproducción Premium. |

**Reglas de implementación:**

- Edge Functions que escriben usan service role solo del lado servidor, verifican el actor y el local, y registran auditoría.
- Todas las escrituras de votos/códigos son transaccionales con `SELECT ... FOR UPDATE` sobre el saldo o el código.
- No se expone `service_role` ni `YOUTUBE_API_KEY` al navegador.

---

## 7. Seguridad y RLS

### 7.1 Matriz de acceso a tablas

| Tabla | Cliente anónimo | Staff | Dueño | Reproductor |
|---|---|---|---|---|
| venues | SELECT público | SELECT vía función | CRUD propio | SELECT público |
| venue_settings | Sin acceso directo; flags públicos vía RPC | Sin acceso directo | CRUD propio | Sin acceso |
| tracks | SELECT activos | Sin acceso directo | CRUD propio | Sin acceso directo |
| night_sessions | SELECT noche abierta del local | Vía función | CRUD propio | Vía función |
| participants | SELECT propio | Sin acceso | SELECT del local | Sin acceso |
| queue_items | SELECT de la noche abierta | Vía función | CRUD propio | Vía función |
| votes | SELECT propios | Sin acceso | SELECT del local | Sin acceso |
| vote_codes | Sin acceso | Vía función | SELECT del local | Sin acceso |
| credit_transactions | SELECT propios | Sin acceso | SELECT del local | Sin acceso |
| staff_members | Sin acceso | Sin acceso | CRUD propio | Sin acceso |
| staff_sessions | Sin acceso | Sin acceso | Sin acceso | Sin acceso |
| player_devices | Sin acceso | Sin acceso | CRUD propio | Vía función |
| fallback_tracks | Sin acceso | Sin acceso | CRUD propio | Vía función |
| staff_actions | Sin acceso | Sin acceso | SELECT del local | Sin acceso |
| rate_limits | Sin acceso | Sin acceso | Sin acceso | Sin acceso |
| youtube_search_cache | Sin acceso | Sin acceso | Sin acceso | Sin acceso |

- Políticas de dueño basadas en `venues.owner_id = auth.uid()`.
- Políticas de participante basadas en `participants.auth_user_id = auth.uid()` y noche abierta.
- El cliente **no** escribe tablas directamente: solo llama RPC/Edge Functions.
- Las tablas `staff_sessions`, `rate_limits` y `youtube_search_cache` solo son accesibles con service role.
- Supabase Auth anónimo habilitado; el JWT incluye `is_anonymous`. Los usuarios anónimos solo pueden operar como participantes.

### 7.2 Códigos y créditos

- Código: 8 caracteres del alfabeto `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (sin `I`, `O`, `0`, `1`).
- Generado en servidor con `crypto.getRandomValues`, reintento ante colisión.
- Canjeado una sola vez; el saldo queda ligado al participante de esa noche.
- El participante puede canjear varios códigos en la misma noche; los créditos se acumulan.
- Cada voto descuenta exactamente 1 crédito. No se permite votar sin saldo.
- No hay devolución de créditos por skip/veto/error de reproducción.
- Al cerrar la noche: códigos `active` → `expired`, saldo → 0 con transacción `night_close`, votos y cola cerrados.

### 7.3 PIN y sesiones de staff

- PIN de 6 dígitos, hash bcrypt (cost 10). Nunca se devuelve al cliente.
- 5 intentos fallidos en 15 minutos bloquean el PIN 15 minutos.
- Sesión de staff: token aleatorio de 32 bytes, guardado como SHA-256, expira a las 12 h; se puede revocar.
- El dueño puede resetear el PIN de un mozo.
- Cada acción sensible del staff se registra en `staff_actions` con staff_id.

### 7.4 Reproductor

- El dueño vincula la PC desde el panel y recibe un token de dispositivo de 32 bytes, mostrado una vez y guardado en `localStorage` del navegador.
- El servidor guarda solo el hash; el token es revocable.
- El reproductor no tiene acceso a datos del dueño ni al panel.
- El reproductor debe poder re-vincularse si se limpia el navegador.

### 7.5 Límites de abuso

| Acción | Límite |
|---|---|
| Búsqueda YouTube | 10 por minuto y 30 por noche por participante |
| Propuesta | 1 cada 30 s y 3 por noche por participante |
| Canje de código | 5 intentos fallidos por 10 min por participante/IP |
| Voto | 10 por minuto por participante (además de saldo y unicidad) |
| Login de staff | 5 fallos / 15 min / PIN |
| Generación de códigos | 200 por noche por staff; máximo 50 créditos por código |
| Cola | Máximo 30 temas activos |
| Búsqueda del dueño | 30 por minuto |

- IP anonimizada con hash + sal para rate limiting; retención 24 h.
- Los límites se implementan en Edge Functions con la tabla `rate_limits`; limpieza diaria con `pg_cron`.

### 7.6 Datos personales

- Clientes: sin nombre, email ni teléfono. Solo ID anónimo, saldo, votos y propuestas.
- Staff: nombre y PIN hasheado.
- Dueño: email de Supabase Auth.
- No se usan cookies de terceros ni analytics con datos personales.

---

## 8. Reglas de negocio

### 8.1 Noche

- Solo puede existir una noche `open` por local (índice único parcial).
- Abrir/cerrar requiere confirmación; se registra en `staff_actions`.
- Con la noche cerrada: no se aceptan propuestas, votos ni canjes; el cliente ve "Noche cerrada".
- Cerrar la noche invalida códigos no canjeados y saldos restantes.
- El reproductor, al cerrar, termina la canción actual y pasa a playlist de fondo si existe; si no, queda en espera.

### 8.2 Catálogo

- El dueño agrega temas por búsqueda interna, link de YouTube o subida de MP3.
- YouTube se valida con `videos.list`: existe, es embeddable, no es live, duración ≤ 8 min (configurable).
- MP3: máximo 25 MB, MIME de audio validado, bucket privado, duración leída al subir.
- El dueño define la playlist de fondo: orden explícito, loop.
- Archivar un track no afecta una cola activa; solo lo oculta del catálogo.
- Spotify solo aparece si el dueño conectó una cuenta Premium (fase 2).

### 8.3 Propuestas

- Requieren noche abierta y `proposals_enabled = true`.
- Entran directo a la cola, sin aprobación previa.
- Búsqueda interna: YouTube, región AR, top 10 resultados; se bloquean lives, videos de más de 8 min y no embeddables.
- También se acepta link de YouTube (`watch?v=`, `youtu.be`, `shorts`); se normaliza al video ID.
- Deduplicación:
  - Si el track ya está en la cola activa (`queued`/`playing`), no se crea otro item; la UI ofrece votarlo.
  - Si existe en el catálogo pero no en la cola, se reutiliza el track y se crea un nuevo item con 0 votos.
  - Clave `dedupe_key` única por local.
- Límite de propuestas: 3 por participante por noche, 1 cada 30 s.
- Cola llena (30): se rechaza la propuesta con mensaje claro; se puede seguir votando.
- Contenido explícito:
  - Filtro por keywords configurable + metadata de YouTube (edad restringida) + curaduría del dueño.
  - Si el filtro está activo y el título/artista coincide, la propuesta se bloquea.
  - El dueño puede editar la lista de keywords y marcar temas manualmente.
  - Limitación conocida: YouTube no expone un flag de contenido explícito confiable; el filtro es heurístico, complementado por veto del staff.
- Si un tema ya votado por el participante se vuelve a encolar en la misma noche, la propuesta se permite, pero ese participante no puede votarlo de nuevo (restricción de voto único por track/noche).

### 8.4 Créditos

- Solo se obtienen canjeando un código emitido por dueño o staff.
- No hay créditos gratuitos, promociones automáticas ni devoluciones.
- El staff elige 1–50 créditos por código; valor por defecto 5.
- Los códigos se dictan, se muestran en pantalla grande y se imprimen en ticket de 58/80 mm vía diálogo del navegador.
- Un código puede canjearse una vez; si el cliente borra los datos del navegador, pierde el saldo restante (no se reembolsa).
- Los créditos vencen al cerrar la noche.

### 8.5 Votos y orden de la cola

- 1 crédito = 1 voto.
- Un participante puede votar varias canciones distintas; máximo un voto por canción por noche.
- No se apilan votos sobre la misma canción.
- El voto se registra sobre el `queue_item`; el `vote_count` se actualiza en la misma transacción.
- Orden: `vote_count DESC, created_at ASC`.
- Desempate: la primera propuesta en llegar gana.
- La canción en reproducción no se reordena ni se interrumpe por votos.
- Los votos se contabilizan en vivo y son visibles para todos (ranking abierto).
- Votar un item ya reproducido, vetado o inexistente devuelve error y refresca el estado.
- No se puede votar como dueño/staff desde cuentas privilegiadas; solo clientes anónimos.
- La identidad del cliente es por dispositivo/sesión anónima. No hay verificación de persona; el costo en créditos y el único uso de códigos desincentivan el fraude.

### 8.6 Reproductor

- La PC abre `/player/[slug]` en Chrome. La primera vez requiere un clic en "Iniciar reproductor" para habilitar autoplay.
- Fuente de reproducción por orden:
  1. Item `queued` con más votos (desempate por antigüedad).
  2. Playlist de fondo en orden y loop si no hay cola.
  3. Pantalla en espera si no hay fondo.
- Al comenzar: `status = playing`. Al terminar: `played`. Error de video: `failed` y auto-skip con aviso al panel.
- Un tema nuevo propuesto mientras suena fondo se reproduce al terminar el tema de fondo actual (sin cortes).
- Sincronización: polling cada 5 s + heartbeat cada 15 s. El panel muestra "Reproductor conectado" según `last_seen_at < 45 s`.
- MP3 se sirve con URL firmada de 15 min; se refresca al iniciar cada tema.
- YouTube puede incluir anuncios; no se pueden bloquear con la API oficial. Es una limitación aceptada de v1.
- Si el reproductor se desconecta, la cola no se pierde; al volver, retoma el tema actual o el primero pendiente.

### 8.7 Impresión de códigos

- Vista de ticket para 58 mm y 80 mm con: PonelePlay, nombre del local, fecha, código en tipografía mono grande, créditos, instrucciones.
- Botón "Imprimir" abre el diálogo del navegador; el staff elige la impresora térmica.
- También hay modo pantalla grande (para dictar) y copiar al portapapeles.
- `printed_count` se incrementa para auditoría.
- Impresión silenciosa queda fuera de v1 (se puede agregar QZ Tray después).

---

## 9. Mapa de pantallas y UI

### 9.1 Cliente móvil — `/p/[slug]`

| Pantalla | Contenido | Acciones |
|---|---|---|
| C1 · Home / Cola | Nombre del local, estado de la noche, canción actual, ranking de la cola con votos, saldo propio, acceso a canjear código. | Votar, abrir buscador, canjear código. |
| C2 · Buscar y proponer | Buscador de YouTube, resultados con miniatura, título, canal, duración; aviso de filtro explícito y duplicados. | Proponer; si ya existe, votar. |
| C3 · Canjear código | Hoja inferior con input de 8 caracteres en mayúsculas. | Validar y acreditar. |
| C4 · Mi actividad | Créditos gastados, canciones votadas y propuestas. | Consulta. |

- Móvil primero, 360 px mínimo, targets de 44 px.
- Tema oscuro tipo pool bar; ranking con chips de bola de billar para los votos.
- Estados vacíos: cola vacía ("La pista está libre"), noche cerrada, sin créditos.
- Realtime en C1; polling de respaldo cada 10 s.
- Sin audio en el cliente.

### 9.2 Panel del bar — `/panel/[slug]`

| Pantalla | Contenido | Acciones |
|---|---|---|
| P1 · Acceso | Login del dueño + acceso "Soy staff" con PIN. | Entrar. |
| P2 · Noche | Estado de la noche, canción actual, cola completa, conexión del reproductor, saldo de la noche, toggles. | Abrir/cerrar noche, skip, veto, activar propuestas, generar código rápido. |
| P3 · Catálogo | Lista del catálogo, búsqueda YouTube, subida MP3, playlist de fondo. | Agregar, archivar, ordenar fondo, marcar explícito. |
| P4 · Códigos | Generador con selector de créditos, ticket imprimible, historial de la noche. | Generar, reimprimir, dictar, copiar. |
| P5 · Personal | Lista de mozos y estado de PIN. | Crear, desactivar, resetear PIN. |
| P6 · Ajustes | Nombre, slug, color, logo, filtro explícito y keywords, duración máxima, límites, Spotify (fase 2), vincular reproductor. | Guardar, vincular/revocar PC. |
| P7 · Reproductor | Ruta separada a pantalla completa, sin navegación del panel. | — |

- Layout de escritorio 1280 px+, alto contraste para luz baja.
- Staff ve solo P2 y P4 con acciones permitidas; sin acceso a P3, P5 ni P6.
- P7 se protege con token de dispositivo, no con sesión de dueño.

### 9.3 Reproductor — `/player/[slug]`

- Canción actual en tipografía grande, artista, fuente y progreso.
- QR de acceso grande y siempre visible.
- "A continuación" con los 3 primeros temas y "Reproduciendo fondo".
- Indicador de conexión y hora.
- Estado de error de video con reintento automático y aviso.
- Diseño TV-first: legible a 3–5 m, sin interacción salvo el botón inicial.
- Modo kiosco de Chrome; runbook de instalación en la PC.

### 9.4 Dirección visual

- Concepto "Fieltro y Neón": verde billar profundo (`#0C2A22`), crema (`#F5E9D6`), ámbar neón (`#FFB703`), coral (`#FF5D5D`), tinta (`#111111`).
- Tipografía display: Bricolage Grotesque. Texto: DM Sans. Códigos y marcadores: JetBrains Mono.
- Motivos: ticket de consumición para códigos, fichas de bola numeradas para votos, círculos de vinilo.
- Microinteracciones: reordenamiento animado de la cola, efecto de ticket al generar créditos, respeto a `prefers-reduced-motion`.
- El detalle de tokens y componentes se define en la fase de diseño con `frontend-design`; no se usa el look por defecto de ninguna librería.

### 9.5 Accesibilidad

- Contraste AA, foco visible, labels explícitos, navegación por teclado en panel.
- Botones de voto con `aria-label` ("Votar por <tema>").
- Mensajes de error anunciados con `role="alert"`.
- Sin dependencia exclusiva del color para el estado.

---

## 10. Integraciones

### 10.1 YouTube Data API v3

- Búsqueda: `search.list` (`part=snippet`, `type=video`, `videoCategoryId=10`, `regionCode=AR`, `maxResults=10`).
- Validación: `videos.list` (`part=snippet,contentDetails,status`) para duración, embeddable, live y restricciones.
- La API key vive solo en Edge Functions.
- Caché de búsquedas 24 h en `youtube_search_cache`.
- Cuota gratuita: 10.000 unidades/día; una búsqueda cuesta 100. Con caché y límites alcanza para un bar, pero se documenta el riesgo de agotamiento. Las propuestas por link no consumen búsqueda.
- Al agotarse la cuota: la búsqueda se deshabilita temporalmente con mensaje; se puede seguir votando y pegando links.

### 10.2 YouTube IFrame Player API

- Embebido en el reproductor; sin descarga de audio.
- Eventos `onStateChange`, `onError`, `onReady`.
- Requiere gesto inicial del usuario por política de autoplay; se resuelve con el botón "Iniciar reproductor".
- Anuncios posibles; limitación aceptada.

### 10.3 Supabase Storage

- Bucket privado `track-audio`.
- Límite 25 MB, MIME `audio/*`.
- URLs firmadas de 15 min para el reproductor.
- Sin acceso público.

### 10.4 Spotify (fase 2, opcional)

- Requiere cuenta Premium y app en Spotify Developer Dashboard.
- OAuth PKCE desde el panel; refresh token en Supabase Vault.
- Web Playback SDK en el reproductor y control de playback.
- Solo el dueño puede agregar tracks de Spotify al catálogo; los clientes proponen únicamente YouTube.
- Si no hay conexión o Premium, la sección Spotify no se muestra y ningún track de Spotify queda reproducible.
- No se incluye en v1; el modelo de datos ya reserva `source = 'spotify'` y `spotify_uri`.

### 10.5 Impresión térmica

- HTML/CSS de ticket + `window.print()`.
- Tamaños 58 mm y 80 mm; fuente mono para el código.
- El staff elige la impresora en el diálogo del sistema.
- Prueba manual en la impresora del local antes de la noche inaugural.

---

## 11. Casos borde y manejo de errores

| Caso | Comportamiento |
|---|---|
| Noche no abierta | Cliente en modo "Noche cerrada"; panel invita a abrir. |
| Cola vacía | Playlist de fondo; si no existe, pantalla de espera. |
| Propuesta duplicada activa | No se inserta; se ofrece votar la existente. |
| Propuesta duplicada en catálogo | Se reutiliza el track; nuevo item con 0 votos. |
| Cola llena | Rechazo con mensaje; se puede votar. |
| Sin créditos | CTA para canjear código. |
| Código inválido/usado/vencido | Mensaje específico; rate limit de intentos. |
| Código canjeado por segunda vez | Rechazo, estado actual del código. |
| Voto duplicado en la misma canción | Rechazo sin descontar crédito. |
| Voto sobre item ya reproducido o vetado | Rechazo y refresco de cola. |
| Dos votos concurrentes con 1 crédito | Solo uno gana; transacción con lock. |
| Dos canjes concurrentes del mismo código | Solo uno gana; resto recibe "código ya usado". |
| Dos noches abiertas | El índice único impide la segunda. |
| Staff con sesión vencida | Pide PIN de nuevo. |
| PIN bloqueado | Mensaje con tiempo restante. |
| Video de YouTube no disponible/embed bloqueado | `failed`, auto-skip y aviso al panel. |
| Video se vuelve privado en vivo | Igual que error de reproducción. |
| Reproductor desconectado | Cola intacta; panel muestra alerta; al reconectar retoma. |
| Internet inestable en el cliente | Banner offline; acciones deshabilitadas; reintento. |
| Internet inestable en el reproductor | Mantiene tema actual; reintenta; al volver se resincroniza. |
| Cliente borra datos del navegador | Pierde saldo restante; el código no se reutiliza. |
| Staff cierra la noche por error | Confirmación previa; reabrir crea una noche nueva sin saldos ni códigos previos. |
| Track archivado estando en cola | La cola sigue; deja de ofrecerse en catálogo. |
| Búsqueda sin resultados | Estado vacío con sugerencia de pegar link. |
| Cuota de YouTube agotada | Búsqueda deshabilitada temporalmente; links siguen funcionando. |

---

## 12. Criterios de aceptación

### Acceso y roles

- **AC-01** El dueño crea cuenta, local y entra al panel; un cliente no puede abrir rutas de panel.
- **AC-02** El staff entra con PIN correcto y ve solo sus pantallas; 5 PIN erróneos bloquean 15 min.
- **AC-03** Un cliente escanea el QR, entra anónimo y ve canción actual, cola y saldo 0 sin registro.

### Noche y catálogo

- **AC-04** Abrir noche crea una sesión `open`; no se puede abrir una segunda simultánea.
- **AC-05** El dueño agrega un track por búsqueda, por link y por MP3; aparece en el catálogo.
- **AC-06** La playlist de fondo se reproduce en orden y loop cuando la cola está vacía.
- **AC-07** Cerrar la noche invalida códigos y saldos, cierra la cola y el cliente ve "Noche cerrada".

### Propuestas

- **AC-08** Un cliente busca en YouTube dentro de la app y propone un tema; aparece en la cola con 0 votos.
- **AC-09** Una propuesta duplicada en la cola activa se rechaza y ofrece votar la existente.
- **AC-10** Con filtro explícito activo, un título de la lista se bloquea; al desactivarlo, se permite. El dueño edita keywords.
- **AC-11** Se aplican los límites de 3 propuestas por noche y 1 cada 30 s con mensajes claros.
- **AC-12** Al desactivar propuestas, el buscador se oculta y la Edge Function rechaza propuestas; el catálogo sigue votable.

### Códigos y créditos

- **AC-13** El staff genera un código de N créditos (1–50), lo ve en grande, lo copia y lo imprime en formato 58/80 mm.
- **AC-14** Canjear el código acredita los créditos; un segundo canje falla; el estado pasa a `redeemed`.
- **AC-15** Códigos no canjeados y saldos quedan inutilizables después del cierre.
- **AC-16** El dueño ve el historial con staff emisor, créditos, estado y hora.

### Votos y cola

- **AC-17** Votar descuenta 1 crédito, suma 1 voto y actualiza la cola en vivo para todos los clientes y el panel.
- **AC-18** Un segundo voto del mismo participante a la misma canción se rechaza sin descontar crédito.
- **AC-19** Votar con saldo 0 se rechaza con CTA de canje.
- **AC-20** La cola ordena por votos DESC y, en empate, por propuesta más antigua.
- **AC-21** Votos y canjes concurrentes son atómicos: no hay doble gasto ni doble crédito.
- **AC-22** Skip elimina la canción actual y arranca la siguiente; veto quita un tema de la cola; ambos se reflejan en vivo y no devuelven créditos.

### Reproductor

- **AC-23** El dueño vincula la PC; el reproductor toca YouTube y MP3 y avanza solo al terminar.
- **AC-24** Un video no disponible se marca `failed`, se saltea y el panel recibe aviso.
- **AC-25** Heartbeat activo: el panel muestra conectado/desconectado según 45 s de tolerancia.
- **AC-26** La pantalla del reproductor muestra QR, canción actual y próximos, legible desde el salón.

### Seguridad y UX

- **AC-27** Inserts/updates directos no autorizados fallan; no hay claves secretas en el bundle.
- **AC-28** El cliente es usable desde 360 px con targets de 44 px y contraste AA; el panel funciona desde 1280 px.
- **AC-29** Las actualizaciones de cola llegan en menos de 2 s en Wi-Fi; si falla Realtime, el polling de 10 s sostiene el estado.
- **AC-30** La suite Playwright y las pruebas de RLS pasan en CI; no hay errores de consola.

---

## 13. Plan de pruebas

### Unitarias (Vitest)

- Normalización y dedupe (`yt:`, `file:`, `sp:`), extracción de video ID y normalización de títulos.
- Comparador de cola: votos DESC, `created_at` ASC.
- Generador de códigos: longitud, alfabeto, unicidad, sin caracteres ambiguos.
- Filtro explícito: keywords, acentos, mayúsculas.
- Cálculo de vencimiento de códigos/créditos y estados de noche.
- Máquina de estados del reproductor (queued → playing → played/failed).

### Base de datos (pgTAP con Supabase CLI)

- Matriz de RLS por rol y tabla.
- Unicidad de voto por participante/track/noche.
- Unicidad de item activo por noche/track.
- Índice único de noche abierta.
- Atomicidad de `redeem_code` y `cast_vote` ante concurrencia.
- Trigger/ledger de saldo consistente.

### E2E (Playwright, Chromium)

- Flujo completo con dos contextos: staff genera código, cliente A canjea y vota, cliente B propone y vota, se verifica orden y saldo.
- Staff: skip/veto, toggle de propuestas, permisos restringidos.
- Cierre de noche: códigos y créditos inválidos.
- Dedupe y filtro explícito.
- Reproductor con motor simulado (`PONELEPLAY_TEST_MODE=1`) que dispara `ended` y `error` sin red externa.
- Viewport móvil 390×844 y escritorio 1440×900; chequeo básico de accesibilidad con axe.
- Impresión: stub de `window.print()` y verificación de la vista de ticket.

### Manuales

- Impresión real en la térmica del local (58 y 80 mm).
- Salida de audio y autoplay en la PC del bar con Chrome.
- Prueba con YouTube real en staging (además del mock de CI).
- Spotify Premium (fase 2) con cuenta de prueba.

### Herramientas

- `supabase start` para stack local; `supabase test db` para pgTAP.
- Datos semilla: local demo, dueño, dos mozos, catálogo de 8 temas, noche abierta y códigos.
- CI: lint + typecheck + unit + pgTAP + Playwright.

---

## 14. Fases de entrega

| Fase | Entregable |
|---|---|
| F0 · Base | Repositorio, Next.js, Supabase local, esquema, enums, migraciones, RLS inicial, tipos generados. |
| F1 · Noche y roles | Auth dueño, PIN staff, sesiones, abrir/cerrar noche, panel base, cliente que se une. |
| F2 · Catálogo y propuestas | YouTube search/link, subida MP3, catálogo, dedupe, filtro explícito, límites. |
| F3 · Créditos y votos | Códigos, canje, ledger, votos atómicos, cola realtime, ranking. |
| F4 · Reproductor | Pairing, YouTube IFrame, MP3 firmado, autoplay, skip/veto, fallback, errores. |
| F5 · Operación | Ticket imprimible, QR, historial, resumen de noche, ajustes, responsive y accesibilidad. |
| F6 · Endurecimiento | Rate limits, auditoría, pruebas completas, deploy, runbook del bar. |
| F7 · Spotify (opcional) | OAuth Premium, SDK, catálogo Spotify. No bloquea v1. |

Cada fase se ejecuta con TDD (rojo → verde → refactor) y se valida con sus criterios de aceptación antes de avanzar.

---

## 15. Supuestos, riesgos y definición de terminado

### Supuestos

- El bar tiene internet estable, una PC con Chrome actualizado y audio conectado.
- El dueño cuenta con una API key de YouTube Data API v3.
- Los clientes usan smartphones con datos o Wi-Fi del local.
- El local es uno por despliegue; el esquema queda preparado para múltiples locales.
- El dueño es responsable de los derechos de los MP3 que sube y del uso de YouTube conforme a sus términos.
- La impresora térmica es compatible con el driver de Windows y aparece en el diálogo de impresión.

### Riesgos

| Riesgo | Mitigación |
|---|---|
| Anuncios de YouTube en el local | Limitación aceptada; si molesta, priorizar catálogo MP3 o Spotify Premium en fase 2. |
| Cuota diaria de YouTube | Caché, límites, links sin búsqueda, key con cuota ampliada si hace falta. |
| Video no embeddable o privado | Validación previa + auto-skip + aviso. |
| Autoplay bloqueado | Botón de inicio + runbook de kiosco. |
| Fraude con códigos | Único uso, vencimiento nocturno, auditoría por staff, límites de emisión. |
| Borrado de datos del cliente | Se pierde saldo; comunicado en la UI; los códigos no se reutilizan. |
| Filtro explícito imperfecto | Keywords + metadata + veto humano. |
| Corte de internet | Reproductor mantiene tema actual; cola en DB; reintentos. |
| Crecimiento de Storage por MP3 | Límite 25 MB y política de limpieza; plan pago si crece. |
| Impresión silenciosa | Fuera de v1; se usa diálogo del navegador. |

### Definición de terminado (v1)

1. Los 30 criterios de aceptación pasan.
2. Suite unitaria, pgTAP y Playwright en verde.
3. RLS verificada; no hay secretos en el cliente.
4. Runbook de instalación de la PC, QR e impresora.
5. Deploy en Vercel + Supabase con variables configuradas.
6. Dueño y staff capacitados con una noche de prueba.
7. Sin errores de consola ni pantallas rotas en móvil y escritorio.
