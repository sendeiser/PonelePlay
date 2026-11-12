# PonelePlay Cloud Sync (`Cloudflare Workers + Durable Objects`)

Servidor WebSocket persistente en el Edge global de Cloudflare (incluyendo nodos en Argentina y Brasil), usando el **plan gratuito ($0/mes, sin tarjeta)** con **WebSocket Hibernation API** y **SQLite embebido**.

## Comandos rápidos
```bash
cd realtime-cloud
npm install
npx wrangler login
npx wrangler deploy
```

## Variables recomendadas
- `NEXT_APP_ORIGIN`: URL pública de tu app en Netlify (por defecto `https://poneleplay.netlify.app`).
- Secret opcional para webhooks internos de Next.js:
  ```bash
  npx wrangler secret put SYNC_SHARED_SECRET
  ```
- Luego en Netlify (y `.env.local`), configurar:
  - `NEXT_PUBLIC_SYNC_WS_URL=wss://poneleplay-sync.<tu-subdominio>.workers.dev`
  - `SYNC_HTTP_URL=https://poneleplay-sync.<tu-subdominio>.workers.dev`
  - `SYNC_SHARED_SECRET=<el mismo secreto>`

