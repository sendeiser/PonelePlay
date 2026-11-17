# Pliego de Diseño Formal — PonelePlay V2 (Sonic Aurora)

**Identidad Visual:** Logo **Sonic Prism** (squircle diagonal Indigo -> Magenta -> Ámbar `#6366F1 -> #EC4899 -> #F97316` con brillo cristalino, ondas de audio y núcleo `P + Play`) + Sistema **Sonic Aurora** (**Daylight Studio** claro y **Obsidian Aurora** oscuro).  
**Regla de Temas:** Modo Claro y Modo Oscuro 100% separados en todas las vistas (incluyendo Landing, Sala en Vivo, Modo TV Web, App Smart TV y Resumen Final).  
**Regla de Portadas y Audio:** Reproductor horizontal compacto enfocado en portada de álbum (estudio AI en `/covers/`), nunca recuadro de video visible (`IFrame` oculto `sr-only`).

```css
:root,
[data-theme='light'] {
  --bg-primary: #F4F5FA;
  --bg-mesh:
    radial-gradient(at 12% 8%, rgba(99, 102, 241, 0.14) 0px, transparent 48%),
    radial-gradient(at 88% 12%, rgba(236, 72, 153, 0.12) 0px, transparent 46%),
    radial-gradient(at 52% 92%, rgba(249, 115, 22, 0.10) 0px, transparent 52%);
  --bg-card: rgba(255, 255, 255, 0.88);
  --bg-elevated: #ECEEF6;
  --text-primary: #0B0D17;
  --text-muted: #525866;
  --brand-primary: #4F46E5;
  --on-brand: #FFFFFF;
  --brand-soft: rgba(99, 102, 241, 0.12);
  --brand-coral: #DB2777;
  --on-coral: #FFFFFF;
  --coral-soft: rgba(236, 72, 153, 0.12);
  --brand-amber: #EA580C;
  --accent-amber: #D97706;
  --accent-danger: #DC2626;
  --border-subtle: rgba(15, 23, 42, 0.09);
  --ring-focus: #6366F1;
  --ambient-opacity: 0.24;
  --ambient-scrim: rgba(255, 255, 255, 0.72);
}

[data-theme='dark'] {
  --bg-primary: #07080E;
  --bg-mesh:
    radial-gradient(at 12% 8%, rgba(99, 102, 241, 0.24) 0px, transparent 50%),
    radial-gradient(at 88% 12%, rgba(236, 72, 153, 0.18) 0px, transparent 48%),
    radial-gradient(at 52% 92%, rgba(249, 115, 22, 0.14) 0px, transparent 54%);
  --bg-card: rgba(18, 20, 32, 0.84);
  --bg-elevated: rgba(30, 33, 50, 0.92);
  --text-primary: #F8FAFC;
  --text-muted: #94A3B8;
  --brand-primary: #818CF8;
  --on-brand: #090A14;
  --brand-soft: rgba(129, 140, 248, 0.16);
  --brand-coral: #F472B6;
  --on-coral: #1B0712;
  --coral-soft: rgba(244, 114, 182, 0.16);
  --brand-amber: #FB923C;
  --accent-amber: #F59E0B;
  --accent-danger: #EF4444;
  --border-subtle: rgba(255, 255, 255, 0.10);
  --ring-focus: #818CF8;
  --ambient-opacity: 0.36;
  --ambient-scrim: rgba(11, 13, 23, 0.68);
}
```
