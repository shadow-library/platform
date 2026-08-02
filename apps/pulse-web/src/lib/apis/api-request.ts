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

/** Query hooks that poll — a static interval polls forever; the function form reads the query's own last-fetched data to decide whether to keep polling. */
export interface PollingOptions<TData = unknown> {
  refetchInterval?: number | ((query: { state: { data?: TData } }) => number | false);
}

/**
 * Declaring the constants
 *
 * The whole of pulse-web's transport configuration. `@shadow-library/web` owns the request builder, the
 * browser/SSR split, the CSRF double-submit and the error contract, so what is left here is the two base
 * paths this app talks to and how to reach the backend during SSR.
 *
 * The two surfaces are paths, not clients: `/api/v1` is the versioned API and `/api/auth` is the
 * un-versioned session surface `@shadow-library/auth` mounts. They share one cookie jar, one CSRF policy
 * and one SSR transport — which is why the second `serverFetch` instance this app used to keep is gone.
 */
export { ApiError, isApiError } from '@shadow-library/web';
export type { ApiFailure, ApiResult, ErrorField, ErrorResponse, QueryParams, QueryValue } from '@shadow-library/web';

export const apiClient = createApiClient({
  surfaces: { v1: '/api/v1', auth: '/api/auth' },
  // Vite replaces `import.meta.env.SSR` with `false` in the client build, so this whole branch — and the
  // server module graph behind it — is eliminated there. A bare `() => import(...)` would not do: the thunk
  // is never called in the browser, but Rollup would still bundle its target for the client and drag
  // `node:stream` in with it.
  ssr: import.meta.env.SSR ? () => import('./ssr-transport') : undefined,
});

/** Paths are relative to the versioned API — `/dashboard/stats`, not `/api/v1/dashboard/stats`. */
export const APIRequest = apiClient.v1;
