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

export const serverFetch = createServerFetch({ baseUrl: `${SERVER_URL}/api/v1` });
