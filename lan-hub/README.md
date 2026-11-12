# PonelePlay LAN Hub Local

Servidor liviano que corre en la **PC de Cabina** para sincronizar por red local Wi-Fi / Ethernet (`< 2 ms` de latencia) con la app nativa de **Android TV** y tolerar microcortes de internet, manteniendo un puente bidireccional en vivo con **Cloudflare Workers**.

## Uso rápido (Windows)
1. Tener instalado **Node.js 18+**.
2. Hacer doble clic en `iniciar-lan-hub.bat` (o ejecutar `npm install && npm start` dentro de `lan-hub/`).
3. Abrir `http://localhost:4321` para ver la IP LAN detectada y las TVs conectadas.

## Características
- **Cabina HTTPS sin bloqueos:** el navegador de Cabina se conecta a `ws://127.0.0.1:4321` (permitido bajo HTTPS por todos los navegadores) y le pasa automáticamente la URL del Worker de Cloudflare al Hub.
- **Descubrimiento automático en TV (`mDNS`):** anuncia `_poneleplay._tcp.local.` para que la app Android TV detecte la Cabina sin escribir IPs (también permite IP manual desde Ajustes de TV).
- **Puente Bidireccional:** los votos y dedicatorias de invitados por 4G llegan desde Cloudflare Worker y se reflejan en milisegundos en la red local.

