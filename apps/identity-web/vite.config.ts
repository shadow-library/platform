import { URL, fileURLToPath } from 'node:url';

import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Data now flows through TanStack Start server functions, which reach the identity server directly
// server-side (see src/lib/apis/server-fetch.ts). The browser only ever hits this Start origin, so
// the `/api` proxy is no longer needed for data. `/oauth2` and `/saml2`, however, are full-page
// browser redirects the identity server owns (OAuth 2.1 authorize/callback, SAML SSO) — proxy those
// so the dev browser stays same-origin with the backend. Production fronts Start and the API with a
// reverse proxy that routes `/oauth2` `/saml2` `/api` to the identity server and the rest to Start.
const proxyTarget = process.env.SERVER_URL || 'http://localhost:9091';
const proxy = {
  '/oauth2': { target: proxyTarget, changeOrigin: true, secure: false },
  '/saml2': { target: proxyTarget, changeOrigin: true, secure: false },
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
