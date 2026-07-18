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
 * The server-only transport for the Novel Forge backend. Every backend call travels through a TanStack
 * Start server function whose handler goes through one of these instances; the shared implementation in
 * `@shadow-library/web` forwards the caller's session cookie, replays the CSRF double-submit token, and
 * relays the backend's `Set-Cookie` headers back to the browser. Server-only, so the Start plugin strips
 * this module from the browser bundle.
 */
export type { ServerFetchSpec } from '@shadow-library/web/server';

/**
 * Declaring the constants
 */
const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:8080';

/** The versioned API surface (projects, chapters, runs, …). */
export const serverFetch = createServerFetch({ baseUrl: `${API_ORIGIN}/api/v1` });

/** The first-party session surface novel-forge-server exposes outside the versioned API (`GET /api/auth/session`, 401 = no session). */
export const serverAuthFetch = createServerFetch({ baseUrl: `${API_ORIGIN}/api/auth` });
