/**
 * Importing npm packages
 */
import { APIRequest } from '@shadow-library/web';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */
export type ApiMode = 'fixtures' | 'server';

/**
 * Declaring the constants
 *
 * The browser hits the same-origin `/api` (vite proxies it in dev; a reverse proxy routes it in prod). SSR
 * loaders run in the Start server process, where relative URLs cannot resolve — point the shared transport
 * at the backend origin there. webnovel-server does not exist yet, so dev defaults to typed fixtures; set
 * `VITE_API_MODE=server` to exercise the real HTTP path through the vite proxy.
 */
const SERVER_ORIGIN = typeof process === 'undefined' ? '' : (process.env.SERVER_URL ?? 'http://localhost:8080');
if (typeof window === 'undefined') APIRequest.setBaseUrl(SERVER_ORIGIN);

export const apiMode: ApiMode = import.meta.env.DEV && import.meta.env.VITE_API_MODE !== 'server' ? 'fixtures' : 'server';

export const useFixtures = apiMode === 'fixtures';

/** Deterministic small delay so fixture responses exercise loading states without feeling sluggish. */
export function fixtureDelay<T>(value: T, ms = 120): Promise<T> {
  return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

export { APIRequest };
export { ApiError, isApiError } from '@shadow-library/web';
