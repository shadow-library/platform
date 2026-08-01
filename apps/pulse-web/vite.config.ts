import { fileURLToPath, URL } from 'node:url';

import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig, type PluginOption } from 'vite';

// One backend origin drives everything: the server-function fetch base (`src/lib/apis/server-fetch.ts`)
// and the dev `/api` proxy — which now only matters for the interactive `/api/auth/*` login redirects,
// since data calls travel through TanStack Start server functions. Defaults to the local backend on 8080.
const API_ORIGIN = process.env.API_ORIGIN || 'http://localhost:8080';

// Bundle analysis is opt-in (`ANALYZE=1 bun run build`) so ordinary builds — which now run twice, once
// per environment under TanStack Start — stay quiet and don't fight over stats.html.
const analyze = process.env.ANALYZE ? [visualizer({ gzipSize: true, brotliSize: true }) as PluginOption] : [];

export default defineConfig({
  // The generated route tree lives under `generated/` (the ecosystem's convention for generated
  // artifacts) so `shadow verify`'s lint/format globs never fight the generator's own output style.
  plugins: [tanstackStart({ router: { generatedRouteTree: '../generated/routeTree.gen.ts' } }), viteReact(), ...analyze],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // `@shadow-library/ui` reads `import.meta.env` in a static field initializer, which Vite only injects
  // when it transforms the module. Left external (the default for node_modules during dev SSR) that access
  // hits an undefined `import.meta.env` and throws on import — so pull it into the SSR transform pipeline.
  ssr: {
    noExternal: ['@shadow-library/ui'],
  },
  build: {
    chunkSizeWarningLimit: 750,
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: API_ORIGIN,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
