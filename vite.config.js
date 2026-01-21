import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      // Mise à jour automatique du cache quand une nouvelle version est dispo
      registerType: 'autoUpdate',
      
      // Fichiers à mettre en cache (HTML, JS, CSS, Images, etc.)
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      
      // Le Manifeste (L'identité de ton App)
      manifest: {
        name: 'History Walk Djerba',
        short_name: 'HistoryWalk',
        description: 'Explorez le patrimoine de Djerba',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'icons/pwa-192x192.png', // Tu devras créer cette image plus tard
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icons/pwa-512x512.png', // Et celle-ci aussi
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ]
});