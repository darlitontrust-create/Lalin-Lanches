import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // caminhos relativos: funciona no Firebase Hosting e no GitHub Pages
  build: { chunkSizeWarningLimit: 1600 }
});
