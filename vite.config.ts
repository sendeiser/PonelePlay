import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['covers/*.png', 'covers/*.jpg', 'icons/*.svg'],
      manifest: {
        name: 'PonelePlay V2 — Social Party Jukebox',
        short_name: 'PonelePlay',
        description: 'Jukebox colaborativo en tiempo real para fiestas con YouTube Music (sin Premium) y Spotify.',
        theme_color: '#6366F1',
        background_color: '#F4F5FA',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          },
          {
            src: '/icons/icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    host: true
  }
});
