/// <reference types="bun" />
import { join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { Logger } from '@shadow-library/common';

interface SsrEntry {
  fetch(request: Request): Promise<Response>;
}

export interface ServeOptions {
  /** The built SSR entry (its default export is `{ fetch }`), e.g. `new URL('./dist/server/server.js', import.meta.url)`. */
  ssrEntry: string | URL;
  /** Absolute path to the built client assets directory (`dist/client`). */
  clientDir: string;
  /** Port the customer app listens on. @default 3000 (or `PORT`) */
  port?: number;
  /** Port the backend-independent `/healthz` probe listens on. @default 3001 (or `HEALTH_PORT`) */
  healthPort?: number;
  /** Paths served with service-worker headers (`no-cache` + `Service-Worker-Allowed: /`). @default ['/sw.js'] */
  serviceWorkerPaths?: string[];
}

// The consuming app attaches the logger transport; without one this logger is a no-op.
const logger = Logger.getLogger('@shadow-library/web/server-entry', 'Server');
const CACHE_IMMUTABLE = 'public, max-age=31536000, immutable';
const CACHE_REVALIDATE = 'public, max-age=3600, must-revalidate';
const COMPRESSIBLE = /^(?:text\/|application\/(?:javascript|json|xml|manifest\+json)|image\/svg\+xml)/;

// The body stays a stream so SSR output keeps flushing, and `new Headers(res.headers)` preserves multiple `Set-Cookie` on Bun.
function withGzip(res: Response, req: Request): Response {
  if (!res.body || res.headers.has('content-encoding')) return res;
  if (!COMPRESSIBLE.test(res.headers.get('content-type') ?? '')) return res;
  if (!(req.headers.get('accept-encoding') ?? '').includes('gzip')) return res;

  const headers = new Headers(res.headers);
  headers.set('content-encoding', 'gzip');
  headers.append('vary', 'accept-encoding');
  headers.delete('content-length');
  return new Response(res.body.pipeThrough(new CompressionStream('gzip')), { status: res.status, statusText: res.statusText, headers });
}

// Returns null to fall through to SSR, which owns the HTML: never a directory or trailing-slash path.
async function serveStatic(req: Request, pathname: string, clientDir: string, serviceWorkerPaths: readonly string[]): Promise<Response | null> {
  if (pathname.endsWith('/')) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const path = join(clientDir, normalize(decoded));
  if (path !== clientDir && !path.startsWith(clientDir + sep)) return new Response('Forbidden', { status: 403 });

  const file = Bun.file(path);
  if (!(await file.exists())) return null;

  // A long-cached service worker would keep the browser on a stale one.
  const isServiceWorker = serviceWorkerPaths.includes(pathname);
  let cacheControl = CACHE_REVALIDATE;
  if (isServiceWorker) cacheControl = 'no-cache';
  else if (pathname.startsWith('/assets/')) cacheControl = CACHE_IMMUTABLE;

  // Bun doesn't map `.webmanifest`, and it must be `application/manifest+json` for the install prompt.
  const contentType = pathname.endsWith('.webmanifest') ? 'application/manifest+json' : file.type || 'application/octet-stream';
  const headers = new Headers({ 'content-type': contentType, 'cache-control': cacheControl });
  if (isServiceWorker) headers.set('service-worker-allowed', '/');

  if (req.method === 'HEAD') {
    headers.set('content-length', String(file.size));
    return new Response(null, { headers });
  }
  return withGzip(new Response(file, { headers }), req);
}

/** Serves a built SSR app on Bun: static assets first, since the framework's SSR entry is only a fetch handler and would 404 them, then SSR, plus a health port. */
export async function serve(options: ServeOptions): Promise<void> {
  const appPort = options.port ?? Number(process.env.PORT ?? 3000);
  const healthPort = options.healthPort ?? Number(process.env.HEALTH_PORT ?? 3001);
  const serviceWorkerPaths = options.serviceWorkerPaths ?? ['/sw.js'];
  const entryUrl = typeof options.ssrEntry === 'string' ? pathToFileURL(options.ssrEntry) : options.ssrEntry;

  let ssr: SsrEntry;
  try {
    ({ default: ssr } = (await import(entryUrl.href)) as { default: SsrEntry });
  } catch (error) {
    const path = fileURLToPath(entryUrl);
    if (!(await Bun.file(path).exists())) logger.error('SSR build not found — run `bun run build` before starting', { path });
    else logger.error(`failed to load the SSR build at ${path}`, error);
    process.exit(1);
  }

  const app = Bun.serve({
    port: appPort,
    hostname: '0.0.0.0',
    // Under a fronting load balancer's idle timeout so Bun, not the LB, closes stale sockets.
    idleTimeout: 30,
    async fetch(req) {
      const start = performance.now();
      const { pathname } = new URL(req.url);
      try {
        let res: Response | null = null;
        if (req.method === 'GET' || req.method === 'HEAD') res = await serveStatic(req, pathname, options.clientDir, serviceWorkerPaths);
        res ??= withGzip(await ssr.fetch(req), req);
        const timeTaken = Math.round(performance.now() - start);
        logger.http(`${req.method} ${pathname} -> ${res.status} (${timeTaken}ms)`, { method: req.method, url: pathname, statusCode: res.status, timeTaken });
        return res;
      } catch (error) {
        const timeTaken = Math.round(performance.now() - start);
        logger.error(`${req.method} ${pathname} -> 500 (${timeTaken}ms)`, error);
        return new Response('Internal Server Error', { status: 500 });
      }
    },
    error(error) {
      logger.error('unhandled request error', error);
      return new Response('Internal Server Error', { status: 500 });
    },
  });

  const health = Bun.serve({
    port: healthPort,
    hostname: '0.0.0.0',
    fetch(req) {
      if (new URL(req.url).pathname === '/healthz') return new Response('ok', { headers: { 'cache-control': 'no-store' } });
      return new Response('Not Found', { status: 404 });
    },
  });

  for (const signal of ['SIGTERM', 'SIGINT'] as const)
    process.on(signal, () => {
      logger.info(`received ${signal}, draining in-flight requests and shutting down`);
      app.stop();
      health.stop();
    });

  logger.info(`app server started at ${app.url} (serving static assets from ${options.clientDir})`);
  logger.info(`health server started at ${health.url}healthz`);
}
