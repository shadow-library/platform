import { fileURLToPath, URL } from 'node:url';

import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The browser calls the same-origin `/api/*` and something in front routes that prefix to the identity
 * server; this proxy is that something in dev, standing in for the production reverse proxy. `/oauth2` and
 * `/saml2` join it because they are full-page browser redirects the identity server owns (OAuth 2.1
 * authorize/callback, SAML SSO), and the dev browser has to stay same-origin with the backend across them.
 * SSR takes none of these routes — it reaches the identity server directly at `API_ORIGIN`/`SERVER_URL`
 * (see src/lib/apis/transport.ts). Production fronts Start and the API with a reverse proxy that routes
 * `/api` `/oauth2` `/saml2` to the identity server and everything else to Start.
 */
const proxyTarget = process.env.SERVER_URL || 'http://localhost:9091';

const proxy = {
  '/api': { target: proxyTarget, changeOrigin: true, secure: false },
  '/oauth2': { target: proxyTarget, changeOrigin: true, secure: false },
  '/saml2': { target: proxyTarget, changeOrigin: true, secure: false },
};

export default defineConfig({
  plugins: [tanstackStart(), viteReact()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 3000, proxy },
  preview: { proxy },
});
