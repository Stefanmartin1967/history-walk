import { defineConfig } from 'vite';

export default defineConfig({
  // Mettre ici le nom EXACT de ton dépôt GitHub entre slashes
  // Exemple: base: '/history-walk/',
  base: '/history-walk/', 
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false
  }
});