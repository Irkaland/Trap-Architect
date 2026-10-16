import { defineConfig } from 'vitest/config';

// Relative base so the built game works from any static host path
// (GitHub Pages project sites, itch.io, a sub-folder, etc.).
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: { phaser: ['phaser'] },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
