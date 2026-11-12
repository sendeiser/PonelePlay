---
name: PonelePlay Dual-Theme System (Daylight Lounge & Midnight Booth)
description: Sistema visual dual (Light + Dark) ligero y de alto contraste para bares, fiestas, cabinas de administración y clientes QR
colors:
  primary-light: "#2563eb"
  primary-dark: "#3b82f6"
  primary-hover-light: "#1d4ed8"
  primary-hover-dark: "#2563eb"
  teal-light: "#0d9488"
  teal-dark: "#2dd4bf"
  emerald-light: "#059669"
  emerald-dark: "#10b981"
  amber-light: "#d97706"
  amber-dark: "#f59e0b"
  danger-light: "#dc2626"
  danger-dark: "#f43f5e"
  canvas-light: "#f4f6fa"
  canvas-dark: "#0b0f17"
  shell-light: "#ffffff"
  shell-dark: "#111622"
  card-light: "#ffffff"
  card-dark: "#151b28"
  recessed-light: "#eff2f8"
  recessed-dark: "#0e131e"
  border-light: "#e2e8f0"
  border-dark: "#222b3e"
  text-light: "#0f172a"
  text-dark: "#f1f5f9"
  text-secondary-light: "#475569"
  text-secondary-dark: "#94a3b8"
typography:
  display:
    fontFamily: "var(--font-outfit), var(--font-dm-sans), sans-serif"
    fontWeight: 700
  sans:
    fontFamily: "var(--font-dm-sans), -apple-system, BlinkMacSystemFont, sans-serif"
  mono:
    fontFamily: "var(--font-space-mono), ui-monospace, monospace"
rounded:
  sm: "6px"
  md: "12px"
  lg: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
---

# Design System

<!-- impeccable:design-schema 1 -->

## Overview
PonelePlay utiliza una arquitectura dual adaptable (**Daylight Lounge** en modo claro y **Midnight Booth** en modo oscuro) controlada vía `data-theme="light" | "dark"` y clase `.dark`, con persistencia en `poneleplay-theme` (`localStorage`). Combina legibilidad limpia durante el día o configuración inicial con bajo deslumbramiento en cabina nocturna, manteniendo las pantallas de TV (`/player/[slug]` y `/tv`) forzadas a escenario oscuro (`data-theme="dark"`).

## Colors
Tokens semánticos en `@theme inline` (`src/app/globals.css`) mapeados a `--color-th-*`:
- **Daylight Lounge (`light`):**
  - Canvas `--bg-canvas`: `#f4f6fa` | Shell & Cards `--bg-shell` / `--bg-card`: `#ffffff` | Recessed `--bg-recessed`: `#eff2f8`
  - Bordes: `#e2e8f0` (sutil) / `#cbd5e1` (medio)
  - Texto: `#0f172a` (primario) / `#475569` (secundario) / `#64748b` (muted)
  - Acento Cobalt Electric `--accent-primary`: `#2563eb` (hover `#1d4ed8`) | Signal Teal `--accent-secondary`: `#0d9488`
- **Midnight Booth (`dark`):**
  - Canvas `--bg-canvas`: `#0b0f17` | Shell `--bg-shell`: `#111622` | Cards `--bg-card`: `#151b28` | Recessed `--bg-recessed`: `#0e131e`
  - Bordes: `#222b3e` (sutil) / `#2e3a54` (medio)
  - Texto: `#f1f5f9` (primario) / `#94a3b8` (secundario) / `#7e8ea8` (muted)
  - Acento Cobalt Electric `--accent-primary`: `#3b82f6` (hover `#2563eb`) | Signal Teal `--accent-secondary`: `#2dd4bf`
- **Semánticos:** Esmeralda (`#059669` / `#10b981`) para En Vivo/Online; Ámbar (`#d97706` / `#f59e0b`) para pendientes/rondas; Danger (`#dc2626` / `#f43f5e`) para vetos y alertas.

## Typography
- **Display (`font-display`):** `Outfit` (`--font-outfit`) para titulares, hero y marcadores de estado.
- **UI y Cuerpo (`font-sans`):** `DM Sans` (`--font-dm-sans`) para controles, formularios, tarjetas y navegación.
- **Tabular / Códigos (`font-mono`):** `Space Mono` (`--font-space-mono`) para códigos QR/vouchers, relojes de ronda, pines y métricas técnicas.

## Layout & Scrolling
- **Superficies ligeras:** `.card-panel` (`var(--bg-card)` + borde 1px `var(--border-subtle)` + sombra suave) y `.hero-panel` (`var(--bg-hero)`).
- **Scroll interno acotado (`.ui-scroll-container`):** Contenedores de cola activa, candidatas, historial de tickets, playlists expandidas de Cabina y listas de catálogo utilizan `overflow-y: auto`, `overscroll-behavior: contain`, `scrollbar-gutter: stable` y alturas máximas acotadas (`max-h-[260px]` a `max-h-[460px]`) para evitar que la página pierda el contexto del reproductor.
- **Límite oscuro en TV:** `/player/[slug]` y `/tv` mantienen `<div data-theme="dark" className="dark ...">` y los recibos térmicos (`.thermal-receipt`) se mantienen en papel claro `#fafaf9` independientemente del tema activo.

## Controls & Forms
- **Labels (`.ui-label`):** `0.75rem`, peso `600`, `var(--text-secondary)` con separación inferior uniforme.
- **Inputs (`.ui-input`):** Altura base `2.5rem` (`40px`, `h-11` en auth/móvil), fondo `var(--bg-recessed)`, borde `var(--border-subtle)` y anillo de foco `var(--accent-primary)`.
- **Selector de Tema (`ThemeToggle`):** Variantes `compact` (headers de landing, auth, guía, demo y cliente QR) y `segmented` (shell administrativo).

## Do's and Don'ts
- **DO:** Usar tokens `bg-th-*`, `text-th-*`, `border-th-*`, `.card-panel`, `.ui-label`, `.ui-input` y `.ui-scroll-container` en toda interfaz nueva.
- **DO:** Verificar contraste >= 4.5:1 en textos tanto en Daylight Lounge como en Midnight Booth.
- **DON'T:** No usar `bg-clip-text text-transparent` en titulares o etiquetas operativas.
- **DON'T:** No aplicar fondos blancos a pantallas de TV (`/player/[slug]`, `/tv`) ni vistas previas de dedicatoria TV (`#090d16`).
