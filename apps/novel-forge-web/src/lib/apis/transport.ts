import { createApiClient } from '@shadow-library/web';

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
 * The browser never needs the backend's origin: the ingress routes `/api/*` on this origin to
 * novel-forge-server, so a browser call is same-origin and carries its own cookies. SSR has no browser to
 * do that, so it reaches novel-forge-server directly — in-cluster, skipping the ingress — through
 * `createSsrTransport` (`@shadow-library/web/server`), which resolves the origin from `API_ORIGIN` (the
 * in-cluster Service DNS at deploy time, falling back to `SERVER_URL`, then the literal below for local
 * dev) and forwards the caller's cookies, user agent, accept-language and x-forwarded-for, stamping a
 * fresh x-correlation-id onto every request.
 *
 * The `import.meta.env.SSR` guard has to live here, in app code, rather than inside
 * `@shadow-library/web/server` itself: that package ships prebuilt, so Vite never gets to substitute
 * `import.meta.env.SSR` inside it and eliminate the server module graph behind it from the client bundle.
 * A bare `() => import(...)` would not do either — the thunk is never called in the browser, but Rollup
 * would still bundle its target for the client build and drag `node:stream` in with it.
 */
export { ApiError, isApiError } from '@shadow-library/web';
export type { ApiFailure, ApiResult, ErrorField, ErrorResponse, QueryParams, QueryValue } from '@shadow-library/web';

export const apiClient = createApiClient({
  surfaces: { v1: '/api/v1', auth: '/api/auth' },
  ssr: import.meta.env.SSR ? () => import('@shadow-library/web/server').then(m => m.createSsrTransport({ fallback: 'http://localhost:8080' })) : undefined,
});

export const APIRequest = apiClient.v1;
