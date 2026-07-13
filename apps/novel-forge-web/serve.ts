/**
 * A minimal, Bun-native production server for the built app. It fronts three things on one origin:
 *   1. `/api/*` → reverse-proxied to the backend (`API_ORIGIN`), streaming preserved for AI responses.
 *   2. static → hashed client assets served straight from `dist/client` with immutable caching.
 *   3. everything else → TanStack Start's SSR fetch handler (`dist/server/server.js`).
 *
 * Run with `bun run serve.ts` (package.json `start`). `API_ORIGIN` drives both the `/api` proxy and the
 * SSR-side fetch base (see `src/lib/apis/api-request.ts`), so the browser and the server hit the same backend.
 */
import { join, normalize } from 'node:path';

import handler from './dist/server/server.js';

const PORT = Number(process.env.PORT ?? 3000);
const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:8080';
const CLIENT_DIR = join(import.meta.dir, 'dist', 'client');

async function serveStatic(pathname: string): Promise<Response | null> {
  const filePath = join(CLIENT_DIR, normalize(pathname));
  if (!filePath.startsWith(CLIENT_DIR)) return null;
  const file = Bun.file(filePath);
  if (!(await file.exists())) return null;
  const immutable = pathname.startsWith('/assets/');
  return new Response(file, immutable ? { headers: { 'cache-control': 'public, max-age=31536000, immutable' } } : undefined);
}

function proxyApi(request: Request, url: URL): Promise<Response> {
  const headers = new Headers(request.headers);
  headers.delete('host');
  return fetch(`${API_ORIGIN}${url.pathname}${url.search}`, {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'manual',
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

Bun.serve({
  port: PORT,
  idleTimeout: 240,
  async fetch(request) {
    const url = new URL(request.url);
    // Liveness probe that never touches the backend or the SSR renderer (see the Dockerfile HEALTHCHECK).
    if (url.pathname === '/healthz') return new Response('ok', { headers: { 'content-type': 'text/plain' } });
    if (url.pathname.startsWith('/api/')) return proxyApi(request, url);
    if (url.pathname !== '/') {
      const asset = await serveStatic(url.pathname);
      if (asset) return asset;
    }
    return handler.fetch(request);
  },
});

console.log(`Novel Forge SSR server on http://localhost:${PORT} (API_ORIGIN=${API_ORIGIN})`);
