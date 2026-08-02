/**
 * Importing npm packages
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { buildManifest } from '@shadow-library/web/pwa';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The browser talks to webnovel-server on the same origin (`/api/...`), so dev proxies `/api` to the backend
 * at `API_ORIGIN` (falling back to `SERVER_URL`, then localhost). Production fronts this Start server and the
 * API with a reverse proxy that routes `/api` to webnovel-server and everything else here.
 */
const proxyTarget = process.env.API_ORIGIN || process.env.SERVER_URL || 'http://localhost:8080';
const proxy = { '/api': { target: proxyTarget, changeOrigin: true, secure: false } };

/**
 * Writes the installable manifest, built with the ecosystem's `buildManifest`, to `public/` at build
 * time so Vite copies it into `dist/client` and `serve()` delivers it as `application/manifest+json`.
 * This Start version has no server-route surface, so a static file is the canonical serving path. Runs
 * as a `buildStart` hook (formerly a standalone `scripts/generate-manifest.ts` invoked before `vite
 * build`) so `vite build` alone is a complete, self-contained build step.
 */
function manifestPlugin(): Plugin {
  return {
    name: 'shadow-webnovel-manifest',
    async buildStart() {
      const manifest = buildManifest({
        name: 'Shadow Webnovel',
        short_name: 'Shadow',
        description: 'A dedicated reading client for discovering and reading webnovels — online or offline.',
        id: '/',
        start_url: '/',
        display: 'standalone',
        background_color: '#09090b',
        theme_color: '#4f46e5',
        categories: ['books', 'entertainment'],
        icons: [
          { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icons/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Browse novels', url: '/browse' },
          { name: 'My library', url: '/library' },
          { name: 'Offline library', url: '/downloads' },
        ],
      });

      const target = join(dirname(fileURLToPath(import.meta.url)), 'public', 'manifest.webmanifest');
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, JSON.stringify(manifest, null, 2));
      this.info(`[manifest] wrote ${target}`);
    },
  };
}

export default defineConfig({
  plugins: [manifestPlugin(), tanstackStart(), viteReact()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 3000, proxy },
  preview: { proxy },
});
