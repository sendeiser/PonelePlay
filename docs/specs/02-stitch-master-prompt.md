# Pliego de Diseño Formal — PonelePlay V2 (Ocean Turquoise & Coral)

**Identidad Visual:** Logo Monograma `PP + Play` con ondas de audio + Paleta **Turquesa Océano & Coral** (`#0D9488` / `#F43F5E`)  
**Regla de Temas:** Modo Claro y Modo Oscuro 100% separados en todas las vistas (incluyendo Modo TV y App Smart TV).

```css
:root,
[data-theme="light"] {
  --bg-primary: #F0FDFA;
  --bg-card: #FFFFFF;
  --bg-elevated: #E6F7F5;
  --text-primary: #0F172A;
  --text-muted: #475569;
  --brand-primary: #0D9488;
  --on-brand: #FFFFFF;
  --brand-soft: rgba(13, 148, 136, 0.12);
  --brand-coral: #F43F5E;
  --coral-soft: rgba(244, 63, 94, 0.12);
  --border-subtle: #CCFBF1;
  --ring-focus: #0D9488;
}

[data-theme="dark"] {
  --bg-primary: #0B1517;
  --bg-card: #122226;
  --bg-elevated: #1A3036;
  --text-primary: #F0FDFA;
  --text-muted: #94A3B8;
  --brand-primary: #14B8A6;
  --on-brand: #042F2E;
  --brand-soft: rgba(20, 184, 166, 0.16);
  --brand-coral: #FB7185;
  --coral-soft: rgba(251, 113, 133, 0.16);
  --border-subtle: #1E3A40;
  --ring-focus: #14B8A6;
}
```
