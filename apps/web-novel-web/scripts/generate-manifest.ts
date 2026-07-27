/**
 * Importing npm packages
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
 * The installable manifest, built with the ecosystem's `buildManifest` and written to `public/` at build
 * time so Vite copies it into `dist/client` and `serve()` delivers it as `application/manifest+json`.
 * This Start version has no server-route surface, so a static file is the canonical serving path.
 */
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

const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'manifest.webmanifest');
await mkdir(dirname(target), { recursive: true });
await writeFile(target, JSON.stringify(manifest, null, 2));
console.info(`[manifest] wrote ${target}`);
