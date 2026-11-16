# Pliego de Diseño Formal y Prompts Maestros — PonelePlay V2 (Minimalist Carbon & Crimson)

**Estética:** Minimalista Limpio y Sofisticado (Estilo Apple Music / Sonos / YouTube Music)  
**Proyecto Stitch:** `projects/1270141096932584864`

---

## 1. Pliego Oficial de Tokens CSS (Cero Azul/Violeta · Cero Neón)

```css
:root,
[data-theme="dark"] {
  --bg-primary: #09090B;
  --bg-card: #121215;
  --bg-elevated: #1C1C21;
  --text-primary: #FAFAFA;
  --text-muted: #A1A1AA;
  --brand-primary: #FF2D55;
  --on-brand: #FFFFFF;
  --brand-soft: rgba(255, 45, 85, 0.12);
  --accent-amber: #F59E0B;
  --accent-danger: #EF4444;
  --border-subtle: #27272A;
  --ring-focus: #FF2D55;
}

[data-theme="light"] {
  --bg-primary: #FAFAFA;
  --bg-card: #FFFFFF;
  --bg-elevated: #F4F4F5;
  --text-primary: #09090B;
  --text-muted: #52525B;
  --brand-primary: #E11D48;
  --on-brand: #FFFFFF;
  --brand-soft: rgba(225, 29, 72, 0.10);
  --accent-amber: #D97706;
  --accent-danger: #DC2626;
  --border-subtle: #E4E4E7;
  --ring-focus: #E11D48;
}
```

### Escala Tipográfica Oficial

- **Display / Títulos / Códigos de Sala (`--font-display`):** `'Outfit', sans-serif` (500–800)
- **UI / Cuerpo / Listas (`--font-sans`):** `'Plus Jakarta Sans', sans-serif` (400–700)
- **Timers / Duraciones / Votos (`--font-mono`):** `'JetBrains Mono', monospace` (`tabular-nums`)

---

## 2. Principios Visuales y Estructurales

1. **Interfaz 100% Producto Real:** Cero barras de simulador ni botones artificiales de vista previa en pantalla.
2. **Reproductor "Sonando Ahora" Compacto y Elegante:** Disposición horizontal refinada (`72px`/`88px` portada cuadrada sin video, título/artista/proponente, botón circular `Play/Pause` en `#FF2D55`, `Skip`, barra de progreso fina de `6px`, reacciones discretas y controles del Host integrados sin ruido).
3. **Protagonismo de la Cola de Votación:** Ancho optimizado (`max-w-4xl`) centrado en legibilidad, portadas nítidas y controles de voto limpios con targets táctiles `>= 44x44px`.
4. **Cero Resplandores Neón:** Elevación arquitectónica mediante jerarquía `#09090B` → `#121215` → `#1C1C21` con bordes finos `#27272A`.

---

## 3. Prompt Maestro para Google Stitch (Minimalist Carbon & Crimson)

> Design a refined, minimalist, high-craft collaborative music jukebox interface for "PonelePlay V2" inspired by Apple Music and Sonos. Use a neutral carbon dark palette (`#09090B` canvas, `#121215` card surfaces, `#1C1C21` elevated controls, `#27272A` hairline borders, `#FAFAFA` primary text, `#A1A1AA` muted zinc text) and a single crisp coral crimson accent (`#FF2D55` with white text). Zero blue/purple tones, zero neon green, zero neon outer glows, zero simulator toolbars. Typography: `Outfit` for headings and room code `PLAY42`, `Plus Jakarta Sans` for track titles and controls, `JetBrains Mono` tabular numerals for timers. Top bar shows room title "Previa en lo de Tincho", copyable `PLAY42` pill, QR and TV Mode triggers. Below, a compact horizontal "Sonando Ahora" player bar featuring a crisp 88px square album artwork (audio-only, no video), track title/artist/proposer `@martina`, circular `#FF2D55` Play/Pause + Skip buttons, ultra-thin progress scrubber (`01:48 / 03:24`), subtle reaction pills (`🔥 14`, `❤️ 9`, `🕺 6`, `👎 2`), and clean Host engine/output pills (`YT Music / Spotify`, `Host / Smart TV`). Below the player, a spacious full-width search bar (`Buscar canción o pegar link...`) and clean ranked song queue cards with clear album art thumbnails, full readable titles, and tactile 44px Upvote/NetScore/Downvote controls with `#FF2D55` active upvote state.
