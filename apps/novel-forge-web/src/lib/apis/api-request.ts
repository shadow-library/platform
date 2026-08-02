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

/**
 * Options for query hooks that poll — e.g. following a job or workflow run to completion. A static
 * interval polls forever; the function form reads the query's own last-fetched data (the same shape
 * React Query's own `refetchInterval` callback receives) to decide whether there is still anything
 * worth polling for and stop (`false`) once there isn't — a screen that lists background jobs so it
 * can watch one in flight shouldn't keep polling after that job (or every job) has settled.
 */
export interface PollingOptions<TData = unknown> {
  refetchInterval?: number | ((query: { state: { data?: TData } }) => number | false);
}

/**
 * Declaring the constants
 *
 * The whole of novel-forge-web's transport configuration. `@shadow-library/web` owns the request builder,
 * the browser/SSR split, the CSRF double-submit and the error contract, so what is left here is the two
 * base paths this app talks to and how to reach the backend during SSR.
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

/** Paths are relative to the versioned API — `/projects`, not `/api/v1/projects`. */
export const APIRequest = apiClient.v1;
