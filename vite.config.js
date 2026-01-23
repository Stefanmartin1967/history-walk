import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // 1. TRÈS IMPORTANT : Le nom exact de votre dépôt GitHub (avec les slashs)
  base: '/history-walk/', 

  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      
      // 2. Indique que le SW doit fonctionner dans ce sous-dossier
      base: '/history-walk/', 
      scope: '/history-walk/',

      manifest: {
        name: 'History Walk',
        short_name: 'HistoryWalk',
        start_url: '/history-walk/', // 3. L'URL de démarrage
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#000000',
        icons: [
          {
            // 4. Les chemins des icônes ne doivent pas commencer par /history-walk/ ici 
            // s'ils sont dans le dossier public. Juste le nom du fichier depuis public/
            src: 'pwa-192x192.png', 
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json,geojson}']
      }
    })
  ]
});