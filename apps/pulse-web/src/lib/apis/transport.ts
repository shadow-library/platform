import { createApiClient } from '@shadow-library/web';

/** Query hooks that poll — a static interval polls forever; the function form reads the query's own last-fetched data to decide whether to keep polling. */
export interface PollingOptions<TData = unknown> {
  refetchInterval?: number | ((query: { state: { data?: TData } }) => number | false);
}

/**
 * The whole of pulse-web's transport configuration. `@shadow-library/web` owns the request builder, the
 * browser/SSR split, the CSRF double-submit and the error contract, so what is left here is the two base
 * paths this app talks to and how to reach the backend during SSR.
 *
 * The two surfaces are paths, not clients: `/api/v1` is the versioned API and `/api/auth` is the
 * un-versioned session surface `@shadow-library/auth` mounts. They share one cookie jar, one CSRF policy
 * and one SSR transport — which is why the second `serverFetch` instance this app used to keep is gone.
 *
 * The browser never needs the backend's origin: the ingress routes `/api/*` on this origin to
 * pulse-server, so a browser call is same-origin and carries its own cookies. SSR has no browser to do
 * that, so it reaches pulse-server directly — in-cluster, skipping the ingress — through
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

/** Paths are relative to the versioned API — `/dashboard/stats`, not `/api/v1/dashboard/stats`. */
export const APIRequest = apiClient.v1;
