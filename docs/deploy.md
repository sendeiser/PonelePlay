# PonelePlay v1 — Deployment checklist

## Prerequisitos
- Supabase remoto con proyecto creado (`kbeljbnrnyxfjwmdpaew`).
- `.env.local` con `NEXT_PUBLIC_SUPABASE_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `YOUTUBE_API_KEY`, `RATE_LIMIT_SALT`.
- Vercel configurado con el dominio personalizado.

## Pasos
1. `npm ci`
2. `npm run build`
3. `npx supabase db push` (o `db reset` en local con Docker).
4. `npm run db:types` (requiere Docker o DB remota accesible).
5. Deploy en Vercel con variables de entorno de `.env.local` (sin `SERVICE_ROLE_KEY` expuesta al cliente).
6. Probar flujo completo con dos navegadores: staff genera código, cliente canjea y vota.

## Post-deploy
- Verificar QR (`/p/[slug]`), reproductor (`/player/[slug]`), panel (`/panel/[slug]`).
- Probar impresión térmica (58 mm / 80 mm).
- Confirmar `no errors` en la consola del navegador y del reproductor.
