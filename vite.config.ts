import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works from any static host path (GitHub Pages, itch.io).
  base: './',
  worker: { format: 'es' },
  build: {
    rollupOptions: {
      // The game, plus the level index used for playtesting.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        levels: fileURLToPath(new URL('./levels.html', import.meta.url)),
      },
    },
  },
});
