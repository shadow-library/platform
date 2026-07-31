/**
 * Importing npm packages
 */
import { URL, fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The one inherent PWA build step: the service worker must be its own classic script at a stable URL, so a
 * second tiny build emits `src/sw.ts` → `dist/client/sw.js` after the main SSR build. `serve()` (the shared
 * Bun production server) already sends `/sw.js` with `no-cache` + `Service-Worker-Allowed: /` headers.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
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
