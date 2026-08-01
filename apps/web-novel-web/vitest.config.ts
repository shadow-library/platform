/**
 * Importing npm packages
 */
import { fileURLToPath, URL } from 'node:url';

import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * A dedicated test config — the app's vite.config.ts carries the TanStack Start plugin, which owns the
 * dev/build pipeline and has no business in unit tests. Tests render against jsdom with fixtures active
 * (`import.meta.env.DEV` is true under vitest).
 */
export default defineConfig({
  plugins: [viteReact()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.spec.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 15_000,
  },
});
