# PonelePlay 🎵

Sistema interactivo de Jukebox social, votación en vivo de canciones y reproductor para pantallas de bares y locales nocturnos.

## Características

- 📺 **TV Player en Salón:** Reproductor continuo en pantalla con modo inmersivo de video HD / vinilo, sincronización en tiempo real y bloqueo de clics internos.
- 📱 **Experiencia del Cliente:** Votación en vivo, propuesta de canciones de YouTube, canje de fichas con créditos y barra de progreso sincronizada al segundo con el televisor del salón.
- 🎛️ **Panel de Control (Master Remote):** Control remoto integral desde cabina o mozo (pausar, reanudar, silenciar, volumen, saltear, adelantar/retroceder, modo karaoke y activación de TV Fullscreen).
- 🔐 **Vinculación TV Segura:** Emparejamiento por PIN de 6 dígitos o código QR con tokens persistentes.
- ⚡ **Stack Tecnológico:** Impulsado por Next.js 15 (App Router), Supabase Realtime & PostgreSQL, TypeScript y Tailwind CSS.

## Puesta en marcha

1. Instalar dependencias:
```bash
npm install
```

2. Configurar variables de entorno (`.env.local`):
```env
NEXT_PUBLIC_SUPABASE_URL=tu_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
YOUTUBE_API_KEY=tu_youtube_api_key
```

3. Iniciar el servidor de desarrollo:
```bash
npm run dev
```

4. Ejecutar tests unitarios y de integración:
```bash
npm test
```
