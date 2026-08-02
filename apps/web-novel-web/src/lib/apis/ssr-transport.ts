/**
 * Importing npm packages
 */
import { createServerFetch } from '@shadow-library/web/server';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 *
 * The SSR half of the reader's transport, and the only module that knows webnovel-server's origin. The
 * browser never needs it: the ingress routes `/api/*` on this origin to webnovel-server, so a browser call
 * is same-origin and carries its own cookies — which is also what lets the service worker see and cache
 * catalog reads, something an opaque server-function POST could never offer. SSR has no browser to resolve
 * a relative URL or supply a cookie jar, so it reaches webnovel-server directly.
 *
 * `createApiClient` loads this through a dynamic import it only ever invokes on the server, which is what
 * keeps `@tanstack/react-start/server` out of the client bundle.
 */

/**
 * Declaring the constants
 */
const API_ORIGIN = process.env.API_ORIGIN ?? process.env.SERVER_URL ?? 'http://localhost:8080';

export const serverFetch = createServerFetch({ baseUrl: API_ORIGIN });
