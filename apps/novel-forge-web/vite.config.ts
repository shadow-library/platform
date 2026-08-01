import { fileURLToPath, URL } from 'node:url';

import { visualizer } from 'rollup-plugin-visualizer';
import { type PluginOption } from 'vite';

import { createStartViteConfig } from '../../scripts/config/vite-start.factory.ts';

// One backend origin drives everything: the server-function fetch base (`src/lib/apis/server-fetch.ts`)
// and the dev `/api` proxy — which now only matters for the interactive `/api/auth/*` login redirects,
// since data calls travel through TanStack Start server functions. Defaults to the local backend on 8080.
const API_ORIGIN = process.env.API_ORIGIN || 'http://localhost:8080';

// Bundle analysis is opt-in (`ANALYZE=1 bun run build`) so ordinary builds — which now run twice, once
// per environment under TanStack Start — stay quiet and don't fight over stats.html.
const analyze = process.env.ANALYZE ? [visualizer({ gzipSize: true, brotliSize: true }) as PluginOption] : [];

export default createStartViteConfig({
  alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  // The generated route tree lives under `generated/` (the ecosystem's convention for generated
  // artifacts) so `shadow verify`'s lint/format globs never fight the generator's own output style.
  routerOptions: { generatedRouteTree: '../generated/routeTree.gen.ts' },
  plugins: analyze,
  // `@shadow-library/ui` reads `import.meta.env` in a static field initializer, which Vite only injects
  // when it transforms the module. Left external (the default for node_modules during dev SSR) that access
  // hits an undefined `import.meta.env` and throws on import — so pull it into the SSR transform pipeline.
  ssrNoExternal: ['@shadow-library/ui'],
  chunkSizeWarningLimit: 750,
  proxy: { '/api': { target: API_ORIGIN, changeOrigin: true, secure: false } },
});
