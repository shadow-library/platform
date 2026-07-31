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
 * The server-only transport for webnovel-server, used by the session server function so the caller's
 * session cookie is forwarded during SSR (a plain browser fetch has no cookie on the Start server). Public
 * catalog reads stay on the browser `APIRequest` path. Server-only — the Start plugin strips it from the
 * client bundle.
 */
export type { ServerFetchSpec } from '@shadow-library/web/server';

/**
 * Declaring the constants
 */
const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:8080';

export const serverFetch = createServerFetch({ baseUrl: `${SERVER_URL}/api` });
