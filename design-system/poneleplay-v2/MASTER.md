# Design System Master File — Sonic Aurora (Daylight Studio & Obsidian Aurora)

**Project:** PonelePlay V2  
**Updated:** 2026-11-16  
**Logo:** **Sonic Prism** — Squircle diagonal `#6366F1 -> #EC4899 -> #F97316` con brillo cristalino, ondas acústicas y núcleo `P + Play`, acompañado de wordmark `Ponele` + `Play` ([PonelePlayLogo.tsx](file:///d:/PonelePlay%20V2/src/components/PonelePlayLogo.tsx))  
**Rule:** Modo Claro (**Daylight Studio**) y Modo Oscuro (**Obsidian Aurora**) 100% separados por tema activo (cero mezcla entre temas en una misma vista, incluyendo Modo TV y App Smart TV).

## Color Tokens

### Light Mode — Daylight Studio (`:root, [data-theme='light']`)
| Role | Value | CSS Variable |
|---|---|---|
| Canvas | `#F4F5FA` | `--bg-primary` |
| Ambient Mesh | `radial-gradient` Indigo (`0.14`), Magenta (`0.12`), Amber (`0.10`) | `--bg-mesh` |
| Card (Glass) | `rgba(255, 255, 255, 0.88)` | `--bg-card` |
| Elevated | `#ECEEF6` | `--bg-elevated` |
| Ink Primary | `#0B0D17` | `--text-primary` |
| Ink Muted | `#525866` | `--text-muted` |
| Brand Indigo | `#4F46E5` | `--brand-primary` |
| On Brand | `#FFFFFF` | `--on-brand` |
| Brand Soft | `rgba(99, 102, 241, 0.12)` | `--brand-soft` |
| Accent Magenta | `#DB2777` | `--brand-coral` |
| On Coral | `#FFFFFF` | `--on-coral` |
| Coral Soft | `rgba(236, 72, 153, 0.12)` | `--coral-soft` |
| Brand Amber | `#EA580C` | `--brand-amber` |
| Hairline Border | `rgba(15, 23, 42, 0.09)` | `--border-subtle` |
| Ambient Opacity / Scrim | `0.24` / `rgba(255, 255, 255, 0.72)` | `--ambient-opacity` / `--ambient-scrim` |

### Dark Mode — Obsidian Aurora (`[data-theme='dark']`)
| Role | Value | CSS Variable |
|---|---|---|
| Canvas | `#07080E` | `--bg-primary` |
| Ambient Mesh | `radial-gradient` Indigo (`0.24`), Magenta (`0.18`), Amber (`0.14`) | `--bg-mesh` |
| Card (Glass) | `rgba(18, 20, 32, 0.84)` | `--bg-card` |
| Elevated | `rgba(30, 33, 50, 0.92)` | `--bg-elevated` |
| Ink Primary | `#F8FAFC` | `--text-primary` |
| Ink Muted | `#94A3B8` | `--text-muted` |
| Brand Indigo | `#818CF8` | `--brand-primary` |
| On Brand | `#090A14` | `--on-brand` |
| Brand Soft | `rgba(129, 140, 248, 0.16)` | `--brand-soft` |
| Accent Magenta | `#F472B6` | `--brand-coral` |
| On Coral | `#1B0712` | `--on-coral` |
| Coral Soft | `rgba(244, 114, 182, 0.16)` | `--coral-soft` |
| Brand Amber | `#FB923C` | `--brand-amber` |
| Hairline Border | `rgba(255, 255, 255, 0.10)` | `--border-subtle` |
| Ambient Opacity / Scrim | `0.36` / `rgba(11, 13, 23, 0.68)` | `--ambient-opacity` / `--ambient-scrim` |

### Brand Gradient & Ambient Effects
- `.bg-brand-gradient`: `linear-gradient(135deg, #6366F1 0%, #EC4899 52%, #F97316 100%)`, `color: #FFFFFF` (uso exclusivo en botones primarios, badges activos, emblema Sonic Prism y controles focales; texto siempre en tonos sólidos de alto contraste)
- `.glass-card`: `background-color: var(--bg-card); backdrop-filter: blur(22px);`
- `.ambient-cover-blur` + `.ambient-scrim`: halo cromático difuminado de portada (`blur(46px) saturate(1.55)`) con scrim de contraste garantizado (`>= 4.5:1`)
- Shadow Aurora (`shadow-aurora`): `0 12px 32px -6px rgba(236, 72, 153, 0.32)`

## Typography & Interaction
- **Display:** `Outfit` (500, 600, 700, 800)
- **Body / UI:** `Plus Jakarta Sans` (400, 500, 600, 700)
- **Tabular Numbers:** `JetBrains Mono` (500, 600, 700)
- **Touch Targets:** Todos los controles interactivos mantienen mínimo `44x44px` (`min-h-[44px]`)
- **Album Art Rule:** Portadas cuadradas fotográficas (`/covers/*.jpg`, `/covers/*.png`); nunca video IFrame visible
