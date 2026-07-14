/// <reference types="bun" />
/**
 * Importing npm packages
 */
import { join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */
interface ServerEntry {
  fetch(request: Request): Promise<Response>;
}

/**
 * Declaring the constants
 */
const CLIENT_DIR = join(import.meta.dir, 'dist', 'client');
const SERVER_ENTRY = new URL('./dist/server/server.js', import.meta.url);

const APP_PORT = Number(process.env.PORT ?? 3000);
const HEALTH_PORT = Number(process.env.HEALTH_PORT ?? 3001);

const CACHE_IMMUTABLE = 'public, max-age=31536000, immutable';
const CACHE_REVALIDATE = 'public, max-age=3600, must-revalidate';
const COMPRESSIBLE = /^(?:text\/|application\/(?:javascript|json|xml|manifest\+json)|image\/svg\+xml)/;

/*
 * The SSR handler is a build artifact, imported through a computed URL so this launcher stays outside the
 * bundler's view. A missing build is the common "forgot to run `bun run build`" mistake, so fail with a
 * clear, actionable message rather than an opaque module-resolution stack.
 */
let ssr: ServerEntry;
try {
  ({ default: ssr } = (await import(SERVER_ENTRY.href)) as { default: ServerEntry });
} catch (error) {
  const path = fileURLToPath(SERVER_ENTRY);
  if (!(await Bun.file(path).exists())) console.error(`[main] SSR build not found at ${path} — run \`bun run build\` before starting.`);
  else console.error(`[main] failed to load the SSR build at ${path}:`, error);
  process.exit(1);
}

/**
 * Declaring the helpers
 */

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
 * Serve a file from dist/client, or return null so the request falls through to SSR. Rejects path
 * traversal and never treats a directory (or a trailing-slash path) as a static hit — SSR owns the HTML.
 */
async function serveStatic(req: Request, pathname: string): Promise<Response | null> {
  if (pathname.endsWith('/')) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    /* Malformed %-encoding: let SSR return a normal 404 rather than surfacing a decode error. */
    return null;
  }

  const path = join(CLIENT_DIR, normalize(decoded));
  if (path !== CLIENT_DIR && !path.startsWith(CLIENT_DIR + sep)) return new Response('Forbidden', { status: 403 });

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
 * Declaring the servers
 */

/*
 * Customer traffic: static assets first (immutable + gzip-negotiated), everything else streamed from SSR.
 */
const app = Bun.serve({
  port: APP_PORT,
  hostname: '0.0.0.0',
  /* Keep under a fronting load balancer's idle timeout so Bun, not the LB, closes stale sockets. */
  idleTimeout: 30,
  async fetch(req) {
    if (req.method === 'GET' || req.method === 'HEAD') {
      const asset = await serveStatic(req, new URL(req.url).pathname);
      if (asset) return asset;
    }
    return withGzip(await ssr.fetch(req), req);
  },
  error(error) {
    console.error('[app] unhandled request error', error);
    return new Response('Internal Server Error', { status: 500 });
  },
});

/*
 * Liveness/readiness on its own port so the cluster can probe it without the route ever being reachable
 * through the customer listener. Publish only APP_PORT to the public edge; keep this one internal.
 */
const health = Bun.serve({
  port: HEALTH_PORT,
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

console.info(`[app]    listening on ${app.url} — static from ${CLIENT_DIR}`);
console.info(`[health] listening on ${health.url}healthz`);
