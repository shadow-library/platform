/**
 * Importing npm packages
 */
import { getRequest } from '@tanstack/react-start/server';
import { createServerFetch, type ServerFetch } from '@shadow-library/web/server';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 *
 * The server-only transport for the identity API. Every identity endpoint is reached through a
 * TanStack Start server function whose handler goes through `serverFetch`; the shared implementation
 * lives in `@shadow-library/web` (cookie forwarding, CSRF double-submit, `Set-Cookie` relay). This
 * module binds it to the identity server's origin so the app has a single, pre-configured instance to
 * import across its `*.api.ts` files. Server-only, so the Start plugin strips it from the browser bundle.
 */
export type { ServerFetchSpec } from '@shadow-library/web/server';

/**
 * Declaring the constants
 */
const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:9091';

const baseServerFetch = createServerFetch({ baseUrl: `${SERVER_URL}/api/v1` });

/**
 * Relays the browser's `User-Agent` to the identity server. `createServerFetch` forwards only the session
 * cookie and CSRF token, so without this every session the backend mints would record this SSR runtime as
 * the device — leaving "Sessions & devices" showing "Unknown device". The incoming request (browser → Start
 * server) carries the real agent for both the SSR document and client-invoked server-function RPC.
 */
export const serverFetch: ServerFetch = spec => {
  const userAgent = getRequest().headers.get('user-agent');
  return baseServerFetch(userAgent ? { ...spec, headers: { 'user-agent': userAgent, ...spec.headers } } : spec);
};
