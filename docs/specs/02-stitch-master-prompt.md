# Pliego de Diseño Formal — PonelePlay V2 (Electric Sapphire & Emerald Studio)

**Identidad Visual:** Logo **Sonic Prism** (squircle diagonal Indigo -> Zafiro -> Cyan `#4F46E5 -> #2563EB -> #06B6D4` con brillo cristalino, ondas de audio y núcleo `P + Play`) + Sistema **Electric Sapphire & Emerald Studio** (**Arctic Sapphire Studio** claro y **Abyssal Sapphire** oscuro).  
**Regla de Temas:** Modo Claro y Modo Oscuro 100% separados en todas las vistas (incluyendo Landing, Sala en Vivo, Modo TV Web, App Smart TV y Resumen Final), sin tonos rosados, fucsias ni anaranjados.  
**Regla de Portadas y Audio:** Reproductor horizontal compacto enfocado en portada de álbum (estudio en `/covers/`), nunca recuadro de video visible (`IFrame` oculto `sr-only`).

```css
:root,
[data-theme='light'] {
  --bg-primary: #F2F6FC;
  --bg-mesh:
    radial-gradient(at 12% 8%, rgba(37, 99, 235, 0.13) 0px, transparent 48%),
    radial-gradient(at 88% 12%, rgba(6, 182, 212, 0.12) 0px, transparent 46%),
    radial-gradient(at 52% 92%, rgba(16, 185, 129, 0.09) 0px, transparent 52%);
  --bg-card: rgba(255, 255, 255, 0.90);
  --bg-elevated: #E6EEF8;
  --text-primary: #090E1A;
  --text-muted: #475569;
  --brand-primary: #2563EB;
  --on-brand: #FFFFFF;
  --brand-soft: rgba(37, 99, 235, 0.11);
  --brand-coral: #0284C7;
  --on-coral: #FFFFFF;
  --coral-soft: rgba(6, 182, 212, 0.12);
  --brand-amber: #059669;
  --accent-amber: #059669;
  --accent-danger: #DC2626;
  --border-subtle: rgba(15, 23, 42, 0.09);
  --ring-focus: #2563EB;
  --ambient-opacity: 0.22;
  --ambient-scrim: rgba(255, 255, 255, 0.76);
}

[data-theme='dark'] {
  --bg-primary: #060913;
  --bg-mesh:
    radial-gradient(at 12% 8%, rgba(37, 99, 235, 0.24) 0px, transparent 50%),
    radial-gradient(at 88% 12%, rgba(6, 182, 212, 0.18) 0px, transparent 48%),
    radial-gradient(at 52% 92%, rgba(16, 185, 129, 0.12) 0px, transparent 54%);
  --bg-card: rgba(13, 19, 34, 0.86);
  --bg-elevated: rgba(23, 33, 56, 0.92);
  --text-primary: #F8FAFC;
  --text-muted: #94A3B8;
  --brand-primary: #60A5FA;
  --on-brand: #050914;
  --brand-soft: rgba(59, 130, 246, 0.16);
  --brand-coral: #22D3EE;
  --on-coral: #041E24;
  --coral-soft: rgba(34, 211, 238, 0.15);
  --brand-amber: #34D399;
  --accent-amber: #34D399;
  --accent-danger: #EF4444;
  --border-subtle: rgba(255, 255, 255, 0.10);
  --ring-focus: #38BDF8;
  --ambient-opacity: 0.34;
  --ambient-scrim: rgba(6, 9, 19, 0.70);
}
```
