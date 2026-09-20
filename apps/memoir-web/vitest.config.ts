import { fileURLToPath, URL } from 'node:url';

import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * A dedicated test config — the app's vite.config.ts carries the TanStack Start plugin, which owns the
 * dev/build pipeline and has no business in unit tests.
 */
export default defineConfig({
  plugins: [viteReact()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.spec.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 15_000,
  },
});
