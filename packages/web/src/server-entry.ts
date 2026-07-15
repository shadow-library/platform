/// <reference types="bun" />
/**
 * Importing npm packages
 */
import { join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */
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
}

/**
 * Declaring the constants
 */
const CACHE_IMMUTABLE = 'public, max-age=31536000, immutable';
const CACHE_REVALIDATE = 'public, max-age=3600, must-revalidate';
const COMPRESSIBLE = /^(?:text\/|application\/(?:javascript|json|xml|manifest\+json)|image\/svg\+xml)/;

/*
 * gzip a response on the fly when the client accepts it and the payload is text-shaped. The body stays a
 * stream, so SSR output keeps flushing progressively, and `new Headers(res.headers)` preserves multiple
 * `Set-Cookie` on Bun — auth cookies survive the re-wrap.
 */
function withGzip(res: Response, req: Request): Response {
  if (!res.body || res.headers.has('content-encoding')) return res;
  if (!COMPRESSIBLE.test(res.headers.get('content-type') ?? '')) return res;
  if (!(req.headers.get('accept-encoding') ?? '').includes('gzip')) return res;

  const headers = new Headers(res.headers);
  headers.set('content-encoding', 'gzip');
  headers.append('vary', 'accept-encoding');
  /* Length is unknown once the body is re-encoded. */
  headers.delete('content-length');
  return new Response(res.body.pipeThrough(new CompressionStream('gzip')), { status: res.status, statusText: res.statusText, headers });
}

/*
 * Serve a file from the client directory, or return null so the request falls through to SSR. Rejects path
 * traversal and never treats a directory (or a trailing-slash path) as a static hit — SSR owns the HTML.
 */
async function serveStatic(req: Request, pathname: string, clientDir: string): Promise<Response | null> {
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

  const cacheControl = pathname.startsWith('/assets/') ? CACHE_IMMUTABLE : CACHE_REVALIDATE;
  const headers = new Headers({ 'content-type': file.type || 'application/octet-stream', 'cache-control': cacheControl });

  if (req.method === 'HEAD') {
    headers.set('content-length', String(file.size));
    return new Response(null, { headers });
  }
  return withGzip(new Response(file, { headers }), req);
}

/**
 * Declaring the server
 */

/**
 * Serve a built Shadow SSR app on Bun. The framework's SSR entry is only the fetch handler — served alone
 * every client asset 404s — so this wraps it: static assets first (immutable cache + gzip), everything else
 * streamed from SSR, plus a liveness probe on its own port and graceful drain on shutdown.
 */
export async function serve(options: ServeOptions): Promise<void> {
  const appPort = options.port ?? Number(process.env.PORT ?? 3000);
  const healthPort = options.healthPort ?? Number(process.env.HEALTH_PORT ?? 3001);
  const entryUrl = typeof options.ssrEntry === 'string' ? pathToFileURL(options.ssrEntry) : options.ssrEntry;

  let ssr: SsrEntry;
  try {
    ({ default: ssr } = (await import(entryUrl.href)) as { default: SsrEntry });
  } catch (error) {
    const path = fileURLToPath(entryUrl);
    if (!(await Bun.file(path).exists())) console.error(`[web] SSR build not found at ${path} — run \`bun run build\` before starting.`);
    else console.error(`[web] failed to load the SSR build at ${path}:`, error);
    process.exit(1);
  }

  const app = Bun.serve({
    port: appPort,
    hostname: '0.0.0.0',
    /* Keep under a fronting load balancer's idle timeout so Bun, not the LB, closes stale sockets. */
    idleTimeout: 30,
    async fetch(req) {
      if (req.method === 'GET' || req.method === 'HEAD') {
        const asset = await serveStatic(req, new URL(req.url).pathname, options.clientDir);
        if (asset) return asset;
      }
      return withGzip(await ssr.fetch(req), req);
    },
    error(error) {
      console.error('[web] unhandled request error', error);
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

  /* Drain in-flight requests on shutdown so rolling deploys don't sever active responses. */
  for (const signal of ['SIGTERM', 'SIGINT'] as const)
    process.on(signal, () => {
      app.stop();
      health.stop();
    });

  console.info(`[web] app    listening on ${app.url} — static from ${options.clientDir}`);
  console.info(`[web] health listening on ${health.url}healthz`);
}
