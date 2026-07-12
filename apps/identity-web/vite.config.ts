import { URL, fileURLToPath } from 'node:url';

import { devtools } from '@tanstack/devtools-vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';

// The identity server owns the interactive auth flows (`/api`), the OAuth 2.1 endpoints (`/oauth2`),
// and the SAML IdP (`/saml2`). Proxy all three so the dev SPA is same-origin with the API — the
// session cookie and CSRF double-submit only round-trip when the browser sees one origin.
const proxyTarget = process.env.SERVER_URL || 'http://localhost:8080';
const proxy = {
  '/api': { target: proxyTarget, changeOrigin: true, secure: false },
  '/oauth2': { target: proxyTarget, changeOrigin: true, secure: false },
  '/saml2': { target: proxyTarget, changeOrigin: true, secure: false },
};

export default defineConfig({
  plugins: [devtools(), tanstackRouter({ target: 'react', autoCodeSplitting: true }), viteReact(), visualizer({ gzipSize: true, brotliSize: true })],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
  },
  server: { proxy },
  // `preview` does not inherit `server.proxy`; mirror it so the production build (used by the
  // Playwright webServer) can also reach the backend.
  preview: { proxy },
});
