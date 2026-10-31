import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works from any static host path (GitHub Pages, itch.io).
  base: './',
  worker: { format: 'es' },
});
