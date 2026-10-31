# PonelePlay v1 — Runbook del bar

## Instalación de la PC del reproductor
1. Abrir Chrome en modo kiosco (pantalla completa).
2. Vincular el reproductor desde el panel (`Ajustes > Vincular reproductor`).
3. Copiar el token de 32 caracteres generado; pegarlo en `/player/[slug]` si se limpia el navegador.
4. Verificar que el audio funciona (`audio` conectado) y que el botón "Iniciar reproductor" está visible.

## QR para clientes
- Colocar el código QR impreso en la entrada o en la barra.
- URL: `http://localhost:3000/p/[slug]` (o dominio personalizado si se configura).

## Impresión térmica
- Generar código desde el panel (`Panel > Códigos`).
- Elegir impresora térmica en el diálogo del navegador (`Ctrl+P` o botón `Imprimir`).
- Tamaños soportados: 58 mm y 80 mm.

## Cierre de la noche
1. Confirmar cierre (`ConfirmDialog`).
2. Códigos no canjeados pasan a `expired`; saldos se ponen a 0.
3. El reproductor pasa a la playlist de fondo o espera.

## Reconexión del reproductor
- Si se pierde la conexión (`Desconectado` > 45 s), verificar red/audio.
- Si el navegador se limpia, volver a vincular con un nuevo token.

## Contacto de emergencia
- Revisar `docs/deploy.md` para pasos de redeploy.
