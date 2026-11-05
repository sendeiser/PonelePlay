# Especificación de Diseño: Versión Personalizada para Fiestas, Jodas, Reuniones y Cumpleaños

**Fecha:** 2026-11-04  
**Estado:** Pendiente de aprobación del usuario  
**Enfoque Seleccionado:** Enfoque 1 — Motor Unificado con Perfil de Sala (`bar` vs `party`) y Sub-modos Interactivos de Fiesta

---

## 1. Propósito y Alcance

Crear una versión completa y personalizada de **PonelePlay** orientada a **fiestas privadas, reuniones, jodas y cumpleaños**, conviviendo dentro del mismo sistema sin eliminar ni alterar el funcionamiento comercial actual para **Bares y Billares**.

### Principios Clave
1. **Cero interferencia con Bares:** Los locales con `venue_type = 'bar'` mantienen intacto su flujo de tickets QR, códigos de canje, personal (mozos), umbrales fijos y filtros comerciales.
2. **Todo Desbloqueado en Modo Fiesta (`venue_type = 'party'`):** Los invitados que escanean el QR participan gratis sin códigos de canje, con acceso a búsqueda de YouTube, catálogo, votaciones, karaoke con nombre y dedicatorias en pantalla.
3. **Panel Minimalista para el Anfitrión:** Se ocultan las pestañas de *Códigos* y *Personal (Mozos)* en las salas de fiesta, dejando únicamente:
   - **🎛️ Cabina en Vivo** (con selector de modos de fiesta, controles de show en TV y QR de invitación rápida).
   - **🎵 Playlists y Catálogo** (importación de playlists de YouTube y temas base).
   - **⚙️ Ajustes de la Fiesta** (configuración del evento, reglas democráticas opcionales, dedicatorias y karaoke).

---

## 2. Flujo de Creación y Selección de Perfil (`Bar` vs `Fiesta`)

1. **Registro / Creación de Sala (`/signup` y `/api/auth/register-owner`):**
   - El formulario permite elegir el tipo de sala mediante dos tarjetas destacadas:
     - 🍻 **Bar / Local Comercial** (`venue_type = 'bar'`)
     - 🎉 **Fiesta / Joda / Cumpleaños / Reunión** (`venue_type = 'party'`)
   - Si el usuario elige **Fiesta**, el texto de registro se adapta (*"Nombre de la Fiesta o Cumpleaños"*, ej. `"Cumple de Tincho"`), y se inicializa `venue_settings` con la configuración de fiesta desbloqueada por defecto.
2. **Cambio de Perfil en Ajustes (`/panel/[slug]/ajustes`):**
   - El administrador puede alternar en cualquier momento entre modo **Bar Comercial** y **Modo Fiesta / Evento** desde los ajustes de su sala, adaptando automáticamente el panel lateral y las reglas de la sala.

---

## 3. Los 3 Modos de Dinámica de Fiesta (Conmutables en Vivo desde Cabina)

El anfitrión puede cambiar en tiempo real entre **3 modos de dinámica** desde un panel superior en la **Cabina en Vivo** (`/panel/[slug]`):

### 3.1. 🗳️ Modo Democrático ("El Pueblo Decide") — Con Controles Opcionales del Admin
Los invitados proponen canciones y votan para decidir el orden de reproducción. Incluye **dos parámetros opcionales ajustables en vivo por el administrador** (tanto desde la Cabina como desde Ajustes):

1. **Límite de votos por persona (`party_votes_per_guest`):**
   - **Modo Libre (Por defecto = `0` / Sin límite):** Cada invitado puede votar todas las canciones que quiera (1 voto por canción por invitado) sin gastar saldo.
   - **Modo Limitado (Opcional, ej. `3`, `5`, `10` votos por persona):** Cada invitado recibe esa cantidad de votos disponibles. En su celular ve *"Te quedan X votos"*.
   - **Botón "🔄 Recargar Votos a Todos" en Cabina:** Permite al anfitrión resetear/recargar instantáneamente los votos de todos los invitados durante la noche.
2. **Cantidad de votos para que la canción suba a la cola (`party_min_votes_to_queue`):**
   - **Directo a la Cola (Por defecto = `1` voto):** Toda canción pedida entra directamente a la **Cola Activa** (`status = 'queued'`) y se ordena de mayor a menor cantidad de votos.
   - **Umbral Personalizado (Opcional, ej. `2`, `3`, `5`, `8` votos):** Las canciones nuevas entran primero a la pestaña de **Propuestas de los Invitados** (`status = 'proposed'`) con 1 voto inicial, y **suben automáticamente a la Cola Activa** en cuanto alcanzan los `party_min_votes_to_queue` definidos por el admin.

### 3.2. 🔥 Modo Híbrido ("Democracia + Fueguitos Turbo")
- Combina la votación democrática con poderes recargables gratuitos para darle dinamismo a la fiesta:
  - Cada invitado cuenta con **3 Fueguitos Turbo 🔥** gratuitos en su celular.
  - Usar un **Fueguito Turbo** en una canción le suma **+3 votos de golpe** (incluso si ya la había votado normalmente) y dispara una notificación visual en la cola.
  - Los Fueguitos gastados se **recargan automáticamente** cada `turbo_cooldown_seconds` (por defecto 180 segundos / 3 minutos) en el celular del invitado.

### 3.3. 🎰 Modo Divertido ("Duelos 1v1 y Ruleta Fiestera en TV")
- Mantiene la votación abierta y habilita en la Cabina dos disparadores de show interactivo que se transmiten por WebSocket (`playback-control:[slug]`) a la Pantalla TV y a los celulares de los invitados:
  1. **⚡ Duelo 1 vs 1 en Vivo (30 segundos):**
     - Toma 2 canciones candidatas de la cola (las 2 siguientes o 2 elegidas al azar).
     - Muestra en la **Pantalla TV** y en los **celulares de todos los invitados** un modal/overlay de batalla **Tema A vs Tema B** con cuenta regresiva de 30 segundos y barras de porcentaje en vivo.
     - Al terminar la cuenta regresiva (o cuando el anfitrión pulsa *"Cerrar Duelo"*), el tema ganador recibe un impulso prioritario que lo coloca en el **puesto #1 de la cola** para sonar inmediatamente después del tema actual.
  2. **🎡 Ruleta Fiestera:**
     - Dispara una ruleta visual animada en la **Pantalla TV** y en los celulares con hasta 8 temas pendientes de la cola/propuestas.
     - El tema elegido por la ruleta sube automáticamente al **puesto #1 de la cola** con animación de festejo.

---

## 4. Extras de Fiesta: Dedicatorias en TV y Karaoke con Nombre

### 4.1. En el Celular del Invitado (`/p/[slug]`)
- **Ingreso directo sin códigos:** Al abrir el QR de una fiesta, el invitado no ve la caja de *"Canjear código de mozo"*. En su lugar, puede escribir su **Nombre o Apodo** (guardado en `localStorage`, ej. `"Franco"`).
- **Al pedir una canción (Buscador de YouTube o Catálogo):**
  - **🎤 Switch "¿La querés cantar en Karaoke?":** Si está activo, etiqueta el pedido con `isKaraoke = true` (y permite filtrar/buscar pista karaoke).
  - **💬 Campo "Dedicatoria o Mensaje para la TV (Opcional)":** Texto corto de hasta 90 caracteres (ej. *"¡Feliz cumple Tincho! A brindar 🍻"*).

### 4.2. En la Pantalla TV (`/player/[slug]` y App Android TV) y Cabina
- **En las tarjetas de la Cola:** Se muestra el badge del invitado (`"🎉 Pide: Franco"`), el ícono `🎤 Karaoke` si fue solicitado para cantar, y el globo de dedicatoria `💬`.
- **En el reproductor cuando suena el tema (`nowPlaying`):**
  - Si el tema tiene `dedication` o `guestName`, la TV muestra un banner festivo:
    - *"🎉 Pedido por **Franco**: «¡Feliz cumple Tincho! A brindar 🍻»"*
  - Si el tema tiene `isKaraoke = true`, destaca:
    - *"🎤 ¡KARAOKE! Pasa al micrófono: **Franco**"*

---

## 5. Modelo de Datos y Cambios en Base de Datos (Migración Supabase)

Se creará una nueva migración SQL retrocompatible (`supabase/migrations/20261105010000_party_mode_system.sql`):

### 5.1. Columnas nuevas en `public.venue_settings`
| Columna | Tipo | Default | Descripción |
|---|---|---|---|
| `venue_type` | `text` (`'bar' \| 'party'`) | `'bar'` | Define si la sala opera como Bar comercial o como Fiesta/Cumpleaños. |
| `party_mode` | `text` (`'democratic' \| 'hybrid_turbo' \| 'party_games'`) | `'hybrid_turbo'` | Sub-modo activo de la fiesta. |
| `party_votes_per_guest` | `integer` | `0` | `0` = votos ilimitados por invitado; `> 0` = tope de votos por invitado. |
| `party_min_votes_to_queue` | `integer` | `1` | Votos necesarios para que una canción pase de propuesta a la cola principal (`1` = pasa directo). |
| `allow_dedications` | `boolean` | `true` | Habilita mensajes/dedicatorias para la pantalla TV. |
| `allow_guest_karaoke` | `boolean` | `true` | Permite a los invitados marcar canciones para Karaoke. |
| `turbo_cooldown_seconds` | `integer` | `180` | Tiempo de recarga de cada Fueguito Turbo en modo Híbrido. |

### 5.2. Columnas nuevas en `public.queue_items`
| Columna | Tipo | Default | Descripción |
|---|---|---|---|
| `guest_name` | `text` | `null` | Nombre o apodo del invitado que propuso el tema. |
| `dedication` | `text` | `null` | Mensaje o dedicatoria corta para mostrar en TV (máx. 120 chars). |
| `is_karaoke` | `boolean` | `false` | Indica si el tema fue pedido en modalidad Karaoke. |

### 5.3. Actualización de Funciones RPC en Supabase
1. **`join_night(p_venue_slug, p_display_name)`:**
   - Si `venue_settings.venue_type = 'party'`, asigna automáticamente créditos libres (`99999` o según `party_votes_per_guest` si el admin puso límite en modo democrático) sin requerir códigos de canje.
2. **`propose_track(...)`:**
   - Acepta parámetros opcionales `p_guest_name`, `p_dedication`, `p_is_karaoke`.
   - Si `venue_type = 'party'`:
     - No descuenta créditos pagos de barra ni aplica bloqueos por cooldown comercial.
     - Evalúa `party_min_votes_to_queue`: si es `<= 1`, inserta el tema directamente con `status = 'queued'` (entra a la cola activa al instante); si el admin configuró `> 1` (ej. 3 votos), lo inserta con `status = 'proposed'` y sube a `'queued'` apenas suma esa cantidad de votos.
3. **`cast_vote(p_queue_item_id)` y nueva RPC `cast_party_turbo_vote(p_queue_item_id)`:**
   - En modo Fiesta, verifica si `party_votes_per_guest > 0` (para descontar 1 voto del cupo del invitado) o si es `0` (voto libre sin gastar cupo).
   - Si tras el voto el tema alcanza `party_min_votes_to_queue`, cambia su estado de `'proposed'` a `'queued'`.
   - `cast_party_turbo_vote` suma `+3` votos en modo Híbrido (`hybrid_turbo`).
4. **Nueva RPC `update_party_settings(...)` y `reset_party_guest_votes(p_venue_slug)`:**
   - Permite al anfitrión cambiar en vivo desde la Cabina el `party_mode`, el límite de votos por persona (`party_votes_per_guest`), la cantidad de votos para subir (`party_min_votes_to_queue`), y recargar los votos de todos los participantes con un clic.
5. **`get_night_state(p_venue_slug)`:**
   - Incluye en el JSON de salida el bloque `partyConfig` (`venueType`, `partyMode`, `votesPerGuest`, `minVotesToQueue`, `allowDedications`, `allowGuestKaraoke`, `turboCooldownSeconds`) y en cada item de `nowPlaying`, `queue` y `candidates` los campos `guestName`, `dedication` e `isKaraoke`.

---

## 6. Arquitectura de Componentes Frontend

1. **`src/app/signup/page.tsx` y `src/app/api/auth/register-owner/route.ts`:**
   - Selector visual al registrarse: **🍻 Bar / Local Comercial** vs **🎉 Fiesta / Cumpleaños / Joda**.
2. **`src/components/panel/panel-shell.tsx`:**
   - Si `venueType === 'party'`, oculta los ítems de navegación *"Códigos"* y *"Personal"*, muestra un badge **"🎉 MODO FIESTA"** y deja el menú minimalista (*Cabina en Vivo*, *Catálogo y Playlists*, *Ajustes de la Fiesta*).
3. **`src/components/panel/party-mode-control-bar.tsx` (Nuevo componente en Cabina):**
   - Barra interactiva en la Cabina de Fiesta para:
     - Conmutar en 1 clic entre **🗳️ Democrático**, **🔥 Híbrido Turbo** y **🎰 Duelos y Ruleta**.
     - En **Modo Democrático**, configurar en vivo con controles rápidos:
       - **Límite de votos por persona:** *Ilimitado* o selector numérico (`3`, `5`, `10`, personalizado) + botón *"🔄 Recargar votos a todos"*.
       - **Votos para que la canción suba a la cola:** *1 voto (Directo)* o selector numérico (`2`, `3`, `5`, `8`, personalizado).
     - En **Modo Divertido**, botones para **⚡ Lanzar Duelo 1v1 (30s)** y **🎡 Girar Ruleta en TV**.
     - Botón **"📲 Compartir QR / Link de la Fiesta"** con cartel imprimible/pantalla completa para los invitados.
4. **`src/components/client/client-night-screen.tsx` y `src/components/client/parts/proposal-search.tsx`:**
   - En modo Fiesta: oculta la barra de canje de códigos pagos, muestra el apodo editable del invitado, su contador de votos disponibles (si el admin activó límite) o sus **🔥 Fueguitos Turbo**, el formulario de **Dedicatoria + Karaoke** al pedir canción, y el modal en vivo para votar cuando hay un **Duelo 1v1** activo.
5. **`src/components/player/player-screen.tsx` y `/api/tv/[slug]/route.ts`:**
   - Renderiza el banner de **Dedicatoria / Invitado / Karaoke** en el tema actual y muestra el overlay animado cuando el anfitrión lanza un **Duelo 1v1** o **Ruleta Fiestera**.

---

## 7. Plan de Pruebas y Verificación

- **Tests Unitarios (`vitest`):**
  - Verificación de reglas de `partyConfig` (modo democrático con y sin límite de votos por persona, umbral configurable de votos para subir a cola, modo híbrido con turbo `+3`, y preservación intacta del modo Bar).
  - Tests de componentes para el selector de modo Fiesta y formulario de dedicatorias/karaoke.
- **Build de Producción (`npm run build`):**
  - Compilación limpia de tipos TypeScript y rutas de Next.js.

