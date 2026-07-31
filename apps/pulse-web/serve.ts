/**
 * Importing npm packages
 */
import { file, serve } from 'bun';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const DIST = new URL('./dist/', import.meta.url).pathname;
const INDEX = `${DIST}index.html`;
const PORT = Number(process.env.PORT ?? 3000);
const HEALTH_PORT = Number(process.env.HEALTH_PORT ?? 3001);

/**
 * Static file server for the built Vite SPA. Unknown paths fall back to index.html so client-side
 * routes resolve on a hard refresh; the API is same-origin (`/api`), routed to pulse-server by the
 * ingress, so this server never proxies. Liveness/readiness answer on a dedicated port that stays up
 * regardless of the backend.
 */
serve({ port: HEALTH_PORT, fetch: () => new Response('ok', { headers: { 'content-type': 'text/plain' } }) });

serve({
  port: PORT,
  async fetch(req) {
    const { pathname } = new URL(req.url);
    /** Strip leading slashes and neutralise any `..` traversal before resolving under DIST. */
    const rel = pathname.replace(/^\/+/, '').replace(/\.\.+/g, '');
    const asset = rel === '' ? file(INDEX) : file(`${DIST}${rel}`);
    if (await asset.exists()) return new Response(asset);
    return new Response(file(INDEX), { headers: { 'content-type': 'text/html' } });
  },
});

console.log(`pulse-web serving ${DIST} on :${PORT} (health :${HEALTH_PORT})`);
