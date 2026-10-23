import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';

/** The service worker must be its own classic script at a stable URL, so a second build emits `src/sw.ts` → `dist/client/sw.js` after the main build. */
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    outDir: 'dist/client',
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(new URL('./src/sw.ts', import.meta.url)),
      formats: ['iife'],
      name: 'sw',
      fileName: () => 'sw.js',
    },
  },
});
