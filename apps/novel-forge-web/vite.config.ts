import { URL, fileURLToPath } from 'node:url';

import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { type PluginOption, defineConfig } from 'vite';

// One backend origin drives everything: the dev/preview `/api` proxy (browser-side requests) and the
// SSR fetch base (see `src/lib/apis/api-request.ts`). Defaults to the local backend on 8080.
const API_ORIGIN = process.env.API_ORIGIN || 'http://localhost:8080';

// Bundle analysis is opt-in (`ANALYZE=1 bun run build`) so ordinary builds — which now run twice, once
// per environment under TanStack Start — stay quiet and don't fight over stats.html.
const analyze = process.env.ANALYZE ? [visualizer({ gzipSize: true, brotliSize: true }) as PluginOption] : [];

export default defineConfig({
  plugins: [tanstackStart(), viteReact(), ...analyze],
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
