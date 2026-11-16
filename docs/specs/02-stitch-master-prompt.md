# Pliego de Diseño Formal y Prompts Maestros para Google Stitch — PonelePlay V2

**Metodología:** Opción 3 PEVC V6 (`ui-ux-pro-max` + `frontend-design` ➔ Google Stitch MCP)  
**Proyecto Stitch:** `projects/1270141096932584864` (`PonelePlay V2 - Party Jukebox`)

---

## 1. Pliego Oficial de Tokens CSS (Dark Mode OLED por Defecto + Light Mode Completo)

```css
:root,
[data-theme="dark"] {
  --bg-primary: #0F0F23;
  --bg-card: #1B1B30;
  --bg-elevated: #27273B;
  --text-primary: #F8FAFC;
  --text-muted: #94A3B8;
  --brand-primary: #4338CA;
  --brand-indigo-deep: #1E1B4B;
  --accent-green: #22C55E;
  --on-accent-green: #0F172A;
  --accent-ytm: #FF0033;
  --accent-amber: #F59E0B;
  --accent-danger: #EF4444;
  --border-subtle: #312E81;
  --ring-focus: #FFFFFF;
}

[data-theme="light"] {
  --bg-primary: #F8FAFC;
  --bg-card: #FFFFFF;
  --bg-elevated: #F1F5F9;
  --text-primary: #0F172A;
  --text-muted: #475569;
  --brand-primary: #4338CA;
  --brand-indigo-deep: #E0E7FF;
  --accent-green: #16A34A;
  --on-accent-green: #FFFFFF;
  --accent-ytm: #DC2626;
  --accent-amber: #D97706;
  --accent-danger: #DC2626;
  --border-subtle: #E2E8F0;
  --ring-focus: #4338CA;
}
```

### Escala Tipográfica Oficial

- **Display / Marca / Códigos de Sala / Títulos Hero (`--font-display`):** `'Righteous', cursive`
- **UI / Cuerpo / Formularios / Botones (`--font-sans`):** `'Poppins', sans-serif`
- **Tabular / Duraciones / Timers / Códigos QR (`--font-mono`):** `'JetBrains Mono', monospace` (`font-variant-numeric: tabular-nums`)

---

## 2. Anatomía y Reglas de Componentes (WCAG + `impeccable`)

1. **Targets Táctiles (`>= 44x44px`):** Todos los botones de Upvote (`▲`), Downvote (`▼`), Reacciones en Vivo (`🔥`, `❤️`, `🕺`, `👎`), controles de reproducción del Host, selección de avatares y botones de navegación tienen un tamaño mínimo interactivo de `44px × 44px`.
2. **Prohibido Desbordamiento Horizontal (`scrollWidth <= clientWidth`):** En **375px**, **768px** y **1440px**, los encabezados, chips de sala y tarjetas usan `min-w-0`, `flex-wrap` controlado y truncamiento elegante (`truncate`) para evitar cualquier scroll horizontal.
3. **Solo Portada HD del Álbum (Sin Video):** El reproductor de YouTube Music Audio oculta el iframe y muestra **exclusivamente la portada cuadrada HD**, aura luminosa ambiental, ecualizador SVG animado y barra de progreso tabular.
4. **Contraste WCAG >= 4.5:1:** Tanto en Dark Mode OLED (`#F8FAFC` sobre `#0F0F23`/`#1B1B30`) como en Light Mode (`#0F172A` sobre `#F8FAFC`/`#FFFFFF`).

---

## 3. Prompts Maestros para Google Stitch

### Prompt A — Vista 1: Landing & Acceso Dual (`/`)
> Design a bold, nocturnal party jukebox web & PWA landing page named "PonelePlay V2" in OLED Dark Mode (`#0F0F23` background, `#1B1B30` cards, `#27273B` elevated surfaces, `#4338CA` primary indigo, `#22C55E` electric green CTA, `#FF0033` YouTube Music badge). Use `Righteous` display typography for headings and room codes, `Poppins` for clean UI copy, and `JetBrains Mono` tabular numerals. Include a top header with brand logo, "PWA Instalable" badge, "Instalar App" button, Dark/Light theme toggle, and Account linking button. Hero section splits cleanly into two equal cards: Card 1 "Crear Sala como Anfitrión" featuring room name input, audio engine selector defaulting to "YouTube Music Audio (Sin Cuenta Premium)" vs "Spotify Premium", collapsible anti-spam settings (Max 5 pending, 10s cooldown, Autoplay genre), and green primary CTA; Card 2 "Unirse a una Sala" with uppercase 6-character code input `PLAY42` and quick-join button. Below, a "Mis Salas Recientes" list showing live and ended party cards. Ensure 44px touch targets and zero clutter.

### Prompt B — Vista 2: Onboarding / Entrada Rápida (`/join/:code`)
> Design a focused mobile-first party onboarding card for "PonelePlay V2" joining room `PLAY42` ("Previa en lo de Tincho"). OLED Dark Mode (`#0F0F23`, `#1B1B30`). Show room title, host name, active engine badge "YouTube Music Sin Premium", nickname input field, a 12-item emoji avatar selector grid with 44x44px hit targets and highlighted `#22C55E` active ring, primary CTA "Entrar a Votar y Proponer", and a subtle secondary link to connect Google/Email for history sync. Include clean empty/error states for ended rooms, banned guests, and not found rooms.

### Prompt C — Vista 3: Sala en Vivo Host & Guest (`/room/:code`)
> Design the flagship live collaborative music jukebox screen for "PonelePlay V2" in OLED Dark Mode (`#0F0F23` background, `#1B1B30` surfaces, `#312E81` crisp borders, `#22C55E` upvote green, `#EF4444` downvote red, `#4338CA` brand indigo). Top bar shows back arrow, room name "Previa en lo de Tincho", badge "YouTube Music Audio (Sin Premium)", copyable room code pill `PLAY42`, audio output pill `Audio en TV / Host`, QR Share button, TV Mode button, and Host Settings gear. Hero "Sonando Ahora" card displays ONLY the square HD album artwork with ambient glow (no video frame), animated equalizer bars, track title, artist, "Propuesto por @martina" badge, `01:48 / 03:24` monospace timer, progress scrubber, live floating reaction bar (`🔥`, `❤️`, `🕺`, `👎`) with rising bubble badges, and Host playback controls (Play/Pause, Skip, Volume, Engine switch `YouTube Music ↔ Spotify`, Output switch `Host ↔ Smart TV`, Wake Lock active indicator). Sticky search bar "Buscar canción o pegar link..." with quota pill "Pendientes: 2/5". Below, 3 tabs: "Cola en Vivo (5)", "Ya Sonaron (8)", "Participantes (6)". Queue cards show rank (`📌 Fijada` / `#2`), square thumbnail, track info, proposer tag, and accessible 44x44px Upvote `▲` / net score / Downvote `▼` cluster plus Host moderation menu.

### Prompt D — Vista 4: Modo Pantalla Gigante & App Android TV Nativa (`1920x1080` 10-foot UI)
> Design a 16:9 10-foot Smart TV interface for "PonelePlay TV" (Kotlin + Jetpack Compose for TV) at 1920x1080 in OLED Dark Mode (`#0F0F23`). Two-column layout: Left column (55%) displays huge square HD album art with soft ambient aura, active mode badge "Reproduciendo en esta Smart TV (YouTube Music Sin Premium)" or "Pantalla Sincronizada con Host", large `Righteous` track title, artist, proposer badge, progress bar, and floating live reactions (`🔥`, `❤️`, `🕺`, `👎`). Right column (45%) displays a high-contrast white-framed giant QR code card with extra-large `PLAY42` monospace code and "A continuación (Top 5)" queue list with live net scores. Bottom bar features D-Pad focusable controls with glowing white/green `#22C55E` focus ring (`Play/Pause`, `Siguiente`, `Alternar Audio TV / Solo Pantalla`, `Desconectar`).

### Prompt E — Vista 5: Resumen de Fin de Fiesta (`/room/:code/summary`)
> Design a celebratory post-party summary screen for "PonelePlay V2" in OLED Dark Mode (`#0F0F23`, `#1B1B30`, gold/silver/bronze accents, `#22C55E` CTA). Top celebration banner with room name and duration, 3-step "Podio de DJs de la Noche" showing top 3 guests by net upvotes, featured "Canción Reina de la Fiesta" card with album art and final score, 3 metric pills (Songs Played, Total Votes, Guests), export action buttons ("Guardar como Playlist en Spotify" and "Copiar Tracklist para YouTube Music"), and full played history list.
