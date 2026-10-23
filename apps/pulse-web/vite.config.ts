import { fileURLToPath, URL } from 'node:url';

import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig, type PluginOption } from 'vite';

// Also the origin the SSR transport targets (src/lib/apis/transport.ts); the dev /api proxy stands in for the production ingress.
const API_ORIGIN = process.env.API_ORIGIN || 'http://localhost:8080';

const analyze = process.env.ANALYZE ? [visualizer({ gzipSize: true, brotliSize: true }) as PluginOption] : [];

export default defineConfig({
  // Keeps the generated route tree out of the lint/format globs.
  plugins: [tanstackStart({ router: { generatedRouteTree: '../generated/routeTree.gen.ts' } }), viteReact(), ...analyze],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // @shadow-library/ui reads import.meta.env in a static initializer, which Vite injects only on transform; externalised in dev SSR it throws on import.
  ssr: { noExternal: ['@shadow-library/ui'] },
  build: { chunkSizeWarningLimit: 750 },
  server: { port: 3000, proxy: { '/api': { target: API_ORIGIN, changeOrigin: true, secure: false } } },
});
