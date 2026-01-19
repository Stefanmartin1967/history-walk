import { defineConfig } from 'vite';

export default defineConfig({
  // La ligne cruciale pour GitHub Pages
  base: '/history-walk/', 
  
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false
  }
});