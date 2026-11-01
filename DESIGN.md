---
name: PonelePlay Nocturne
description: Sistema visual nocturno de alta precisión para bares, billares y jukebox interactiva
colors:
  primary: "#4f46e5"
  primary-hover: "#4338ca"
  accent-cyan: "#22d3ee"
  accent-emerald: "#10b981"
  accent-red: "#ef4444"
  surface-dark: "#0a0e17"
  surface-card: "#141824"
  surface-hover: "#181b25"
  border-subtle: "#1E2333"
  border-medium: "#232b42"
  text-primary: "#ffffff"
  text-secondary: "#94a3b8"
  text-muted: "#64748b"
typography:
  display:
    fontFamily: "var(--font-geist-sans), sans-serif"
    fontWeight: 700
  mono:
    fontFamily: "var(--font-geist-mono), monospace"
rounded:
  sm: "6px"
  md: "10px"
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
PonelePlay emplea una estética "Nocturne Precision" diseñada para ambientes oscuros con iluminación tenue (bares, pubs, salas de billar). Prioriza el contraste de alto rendimiento, la legibilidad a distancia en pantallas de TV y la velocidad de operación táctil para el personal.

## Colors
- **Fondo Profundo:** `#0a0e17` — negro azulado que reduce la fatiga visual y resalta el contenido multimedia en la oscuridad.
- **Superficie de Tarjetas:** `#141824` y `#181b25` con bordes sutiles en `#1E2333` o `#232b42`.
- **Acento Principal:** Índigo sólido `#4f46e5` / `#4338ca` con alta legibilidad y contraste.
- **Indicadores de Estado:**
  - Verde Esmeralda (`#10b981`): Estados activos, On Air, conexión viva y confirmaciones.
  - Cian Eléctrico (`#22d3ee`): Sincronización en tiempo real, contador de créditos e interactividad.
  - Carmesí (`#ef4444`): Vetos, cancelaciones y reportes de moderación.

## Typography
- **Interfaz y Salón:** Fuente sans-serif limpia (`var(--font-geist-sans)`), con jerarquía clara de pesos (regular 400, semibold 600, bold 700).
- **Métricas y Operación:** Fuente monoespaciada (`var(--font-geist-mono)`) para contadores de tiempo, códigos de tickets alfanuméricos, porcentajes y pines de seguridad.

## Layout
- **Mobile First para Staff y Clientes:** Barra de navegación inferior fija (`h-16`) con acceso al alcance del pulgar, mini-player desacoplado (`bottom-16`) y áreas de toque mínimas de 44x44px.
- **Desktop Bento Grid:** Módulos en cuadrícula responsiva (`grid-cols-1 lg:grid-cols-12`) con paneles de control independientes y listas de scroll autónomo.
- **TV / Proyector (Salón):** Modo de pantalla completa inmersiva (`sidecar` o display), minimizando controles sobre el video y optimizando la visibilidad de títulos a 5 metros de distancia.

## Elevation & Depth
- Capas tonales con bordes de 1px en `#1E2333` en lugar de sombras pesadas difusas.
- Superficies flotantes con desenfoque de fondo (`backdrop-blur-xl`) para mantener el contexto del contenido que pasa por detrás.

## Shapes
- Esquinas redondeadas ergonómicas: `rounded-xl` (12px) y `rounded-2xl` (16px) para tarjetas contenedoras.
- Botones de acción táctiles con micro-interacciones activas (`active:scale-95`).

## Components
- **Botón Primario:** Fondo sólido `#4f46e5` con hover `#4338ca`, texto blanco puro y esquinas redondeadas.
- **Chip de Estado:** Cápsula con punto pulsante de color (verde para En Vivo, cian para Sincronizado).
- **Ticket Térmico:** Contenedor blanco papel con tipografía monoespaciada, perforación punteada y código QR central de alto contraste.

## Do's and Don'ts
- **DO:** Usar colores sólidos de alto contraste para textos y botones de acción rápida.
- **DO:** Mantener los indicadores de estado claros y visibles a distancia.
- **DON'T:** No usar texto decorativo con gradiente (`bg-clip-text`) para titulares operativos.
- **DON'T:** No usar rebotes exagerados (`animate-bounce`) en interfaces de control de audio en vivo.

