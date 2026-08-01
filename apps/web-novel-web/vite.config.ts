/**
 * Importing npm packages
 */
import { fileURLToPath, URL } from 'node:url';

import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
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
 * The browser talks to the webnovel server on the same origin (`/api/...`), so dev proxies `/api` to the
 * backend once it exists. Until then the API layer serves typed fixtures in dev (see src/lib/apis), so the
 * proxy is a fallback for `VITE_API_MODE=server` runs. Production fronts this Start server and the API with
 * a reverse proxy that routes `/api` to webnovel-server and everything else here.
 */
const proxyTarget = process.env.SERVER_URL || 'http://localhost:8080';
const proxy = {
  '/api': { target: proxyTarget, changeOrigin: true, secure: false },
};

export default defineConfig({
  plugins: [tanstackStart(), viteReact()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { port: 3000, proxy },
  preview: { proxy },
});
