import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path'; // 1. Ajout de l'import pour gérer les chemins

export default defineConfig({
  // Le nom exact de votre dépôt GitHub
  base: '/history-walk/', 

  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      base: '/history-walk/', 
      scope: '/history-walk/',

      manifest: {
        name: 'History Walk',
        short_name: 'HistoryWalk',
        start_url: '/history-walk/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#000000',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        // Ajout explicite pour être sûr que fusion.html est mis en cache
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json,geojson}']
      }
    })
  ],

  // 2. AJOUT : Configuration multi-pages pour Rollup
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        fusion: resolve(__dirname, 'fusion.html'),
      },
    },
  },
});