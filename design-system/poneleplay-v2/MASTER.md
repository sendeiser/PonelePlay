# Design System Master File — Electric Sapphire & Emerald Studio

**Project:** PonelePlay V2  
**Updated:** 2026-11-16  
**Logo:** **Sonic Prism** — Squircle diagonal Indigo -> Zafiro -> Cyan (`#4F46E5 -> #2563EB -> #06B6D4`) con brillo cristalino, ondas acústicas y núcleo `P + Play`, acompañado de wordmark `Ponele` + `Play` ([PonelePlayLogo.tsx](file:///d:/PonelePlay%20V2/src/components/PonelePlayLogo.tsx))  
**Rule:** Modo Claro (**Arctic Sapphire Studio**) y Modo Oscuro (**Abyssal Sapphire**) 100% separados por tema activo (cero mezcla entre temas en una misma vista, incluyendo Modo TV y App Smart TV, y cero tonos rosados, fucsias o anaranjados).

## Color Tokens

### Light Mode — Arctic Sapphire Studio (`:root, [data-theme='light']`)
| Role | Value | CSS Variable |
|---|---|---|
| Canvas | `#F2F6FC` | `--bg-primary` |
| Ambient Mesh | `radial-gradient` Sapphire (`0.13`), Cyan (`0.12`), Emerald (`0.09`) | `--bg-mesh` |
| Card (Glass) | `rgba(255, 255, 255, 0.90)` | `--bg-card` |
| Elevated | `#E6EEF8` | `--bg-elevated` |
| Ink Primary | `#090E1A` | `--text-primary` |
| Ink Muted | `#475569` | `--text-muted` |
| Brand Sapphire | `#2563EB` | `--brand-primary` |
| On Brand | `#FFFFFF` | `--on-brand` |
| Brand Soft | `rgba(37, 99, 235, 0.11)` | `--brand-soft` |
| Accent Sky / Cyan | `#0284C7` | `--brand-coral` |
| On Accent | `#FFFFFF` | `--on-coral` |
| Accent Soft | `rgba(6, 182, 212, 0.12)` | `--coral-soft` |
| Emerald Accent | `#059669` | `--brand-amber` / `--accent-amber` |
| Hairline Border | `rgba(15, 23, 42, 0.09)` | `--border-subtle` |
| Ambient Opacity / Scrim | `0.22` / `rgba(255, 255, 255, 0.76)` | `--ambient-opacity` / `--ambient-scrim` |

### Dark Mode — Abyssal Sapphire (`[data-theme='dark']`)
| Role | Value | CSS Variable |
|---|---|---|
| Canvas | `#060913` | `--bg-primary` |
| Ambient Mesh | `radial-gradient` Sapphire (`0.24`), Cyan (`0.18`), Emerald (`0.12`) | `--bg-mesh` |
| Card (Glass) | `rgba(13, 19, 34, 0.86)` | `--bg-card` |
| Elevated | `rgba(23, 33, 56, 0.92)` | `--bg-elevated` |
| Ink Primary | `#F8FAFC` | `--text-primary` |
| Ink Muted | `#94A3B8` | `--text-muted` |
| Brand Sky Blue | `#60A5FA` | `--brand-primary` |
| On Brand | `#050914` | `--on-brand` |
| Brand Soft | `rgba(59, 130, 246, 0.16)` | `--brand-soft` |
| Accent Cyber Cyan | `#22D3EE` | `--brand-coral` |
| On Accent | `#041E24` | `--on-coral` |
| Accent Soft | `rgba(34, 211, 238, 0.15)` | `--coral-soft` |
| Emerald Accent | `#34D399` | `--brand-amber` / `--accent-amber` |
| Hairline Border | `rgba(255, 255, 255, 0.10)` | `--border-subtle` |
| Ambient Opacity / Scrim | `0.34` / `rgba(6, 9, 19, 0.70)` | `--ambient-opacity` / `--ambient-scrim` |

### Brand Gradient & Ambient Effects
- `.bg-brand-gradient`: `linear-gradient(135deg, #4F46E5 0%, #2563EB 52%, #06B6D4 100%)`, `color: #FFFFFF` (uso exclusivo en botones primarios, badges activos, emblema Sonic Prism y controles focales; texto siempre en tonos sólidos de alto contraste)
- `.glass-card`: `background-color: var(--bg-card); backdrop-filter: blur(22px);`
- `.ambient-cover-blur` + `.ambient-scrim`: halo cromático difuminado de portada (`blur(46px) saturate(1.55)`) con scrim de contraste garantizado (`>= 4.5:1`)
- Shadow Aurora (`shadow-aurora`): `0 12px 32px -6px rgba(6, 182, 212, 0.34)`

## Typography & Interaction
- **Display:** `Outfit` (500, 600, 700, 800)
- **Body / UI:** `Plus Jakarta Sans` (400, 500, 600, 700)
- **Tabular Numbers:** `JetBrains Mono` (500, 600, 700)
- **Touch Targets:** Todos los controles interactivos mantienen mínimo `44x44px` (`min-h-[44px]`)
- **Album Art Rule:** Portadas cuadradas fotográficas (`/covers/*.jpg`, `/covers/*.png`); nunca video IFrame visible
