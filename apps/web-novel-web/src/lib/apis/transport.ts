/**
 * Importing npm packages
 */
import { createApiClient } from '@shadow-library/web';

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
 * The whole of the reader's transport configuration. `@shadow-library/web` owns the request builder, the
 * browser/SSR split, the CSRF double-submit and the error contract; what is left here is the two base paths
 * this app talks to and the fixture switch.
 *
 * The browser hits the same-origin `/api/*` — vite proxies it in dev, the ingress routes it in prod — so
 * cookies and the CSRF double-submit work natively, and the service worker can apply a caching strategy to
 * a real GET. SSR goes out through `./ssr-transport` instead. Paths are surface-relative: `/novels`, not
 * `/api/novels`.
 */
export const apiClient = createApiClient({
  surfaces: { api: '/api', auth: '/api/auth' },
  // Vite replaces `import.meta.env.SSR` with `false` in the client build, so this branch — and the server
  // module graph behind it — is eliminated there. A bare `() => import(...)` would not do: the thunk is
  // never called in the browser, but Rollup would still bundle its target for the client and drag
  // `node:stream` in with it.
  ssr: import.meta.env.SSR ? () => import('./ssr-transport') : undefined,
});

/** The reader's public and authed API surface (`/api/novels`, `/api/library`, …). */
export const APIRequest = apiClient.api;

/**
 * webnovel-server does not exist yet, so dev defaults to typed fixtures; set `VITE_API_MODE=server` to
 * exercise the real HTTP path through the vite proxy.
 */
export const apiMode: ApiMode = import.meta.env.DEV && import.meta.env.VITE_API_MODE !== 'server' ? 'fixtures' : 'server';

export const useFixtures = apiMode === 'fixtures';

/** Deterministic small delay so fixture responses exercise loading states without feeling sluggish. */
export function fixtureDelay<T>(value: T, ms = 120): Promise<T> {
  return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

export { ApiError, isApiError } from '@shadow-library/web';
