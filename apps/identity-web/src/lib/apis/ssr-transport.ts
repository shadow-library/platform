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
 * The SSR half of identity-web's transport, and the only module in the app that knows the identity
 * server's origin. The browser never needs it: the reverse proxy routes `/api/*` on this origin to
 * identity-server, so a browser call is same-origin and carries its own cookies. The SSR pass has no
 * browser to do that, so it reaches identity-server directly — forwarding the caller's cookies and, so
 * that "Sessions & devices" names the real browser rather than this runtime, their `user-agent`.
 *
 * `createApiClient` loads this through a dynamic import it only ever invokes on the server, which is what
 * keeps `@tanstack/react-start/server` out of the client bundle.
 */

/**
 * Declaring the constants
 */
const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:9091';

export const serverFetch = createServerFetch({ baseUrl: SERVER_URL });
