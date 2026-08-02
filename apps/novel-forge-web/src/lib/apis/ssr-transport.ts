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
 * The SSR half of novel-forge-web's transport, and the only module in the app that knows the backend's
 * origin. The browser never needs it: the ingress routes `/api/*` on this origin to novel-forge-server, so
 * a browser call is same-origin and carries its own cookies. The SSR pass has no browser to do that, so it
 * reaches novel-forge-server directly — in-cluster, skipping the ingress — forwarding the caller's cookies
 * and user agent.
 *
 * `createApiClient` loads this through a dynamic import it only ever invokes on the server, which is what
 * keeps `@tanstack/react-start/server` out of the client bundle.
 */

/**
 * Declaring the constants
 */
const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:8080';

export const serverFetch = createServerFetch({ baseUrl: API_ORIGIN });
