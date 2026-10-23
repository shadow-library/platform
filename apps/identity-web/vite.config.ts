import { fileURLToPath, URL } from 'node:url';

import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Dev stand-in for the production reverse proxy, which routes `/api` `/oauth2` `/saml2` to the identity server and everything else to Start.
 * `/oauth2` and `/saml2` are full-page redirects the backend owns, so the dev browser must stay same-origin across them. SSR bypasses the proxy.
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
