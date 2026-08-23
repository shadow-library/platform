import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { buildManifest } from '@shadow-library/web/pwa';

/**
 * The browser talks to shadow-memoir-server on the same origin (`/api/...`), so dev proxies `/api` to the
 * backend at `API_ORIGIN` (falling back to `SERVER_URL`, then localhost). Production fronts this server and
 * the API with an ingress that routes `/api` to shadow-memoir-server and everything else here.
 */
const proxyTarget = process.env.API_ORIGIN || process.env.SERVER_URL || 'http://localhost:8080';
const proxy = { '/api': { target: proxyTarget, changeOrigin: true, secure: false } };

/**
 * Writes the installable manifest into `public/` at build time so Vite copies it into `dist/client` and
 * `serve()` delivers it as `application/manifest+json`. Shortcuts point at the two capture surfaces a
 * phone user reaches for from the launcher.
 */
function manifestPlugin(): Plugin {
  return {
    name: 'shadow-memoir-manifest',
    async buildStart() {
      const manifest = buildManifest({
        name: 'Shadow Memoir',
        short_name: 'Memoir',
        description: 'A private self-improvement RPG — quests, hero progression, finance and reflection in one place.',
        id: '/',
        start_url: '/',
        display: 'standalone',
        background_color: '#09090b',
        theme_color: '#4f46e5',
        categories: ['lifestyle', 'productivity', 'health'],
        icons: [
          { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icons/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Today', url: '/' },
          { name: 'Quick log', url: '/log' },
          { name: 'Add expense', url: '/finance' },
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
  plugins: [manifestPlugin(), tanstackStart({ router: { generatedRouteTree: '../generated/routeTree.gen.ts' } }), viteReact()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // `@shadow-library/ui` reads `import.meta.env` in a static field initializer, which Vite only injects when
  // it transforms the module; left external during dev SSR that access throws on import.
  ssr: { noExternal: ['@shadow-library/ui'] },
  server: { port: 3000, proxy },
  preview: { proxy },
});
