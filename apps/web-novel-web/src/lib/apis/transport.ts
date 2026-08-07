import { createApiClient } from '@shadow-library/web';

/**
 * The whole of the reader's transport configuration. `@shadow-library/web` owns the request builder, the
 * browser/SSR split, the CSRF double-submit and the error contract; what is left here is the two base paths
 * this app talks to and how to reach webnovel-server during SSR.
 *
 * The browser hits the same-origin `/api/*` — vite proxies it in dev, the ingress routes it in prod — so
 * cookies and the CSRF double-submit work natively, and the service worker can apply a caching strategy to a
 * real GET. SSR has no browser to resolve a relative URL or supply a cookie jar, so it reaches webnovel-server
 * directly through `@shadow-library/web/server`, forwarding the caller's cookie. Paths are surface-relative:
 * `/novels`, not `/api/novels`.
 */
export const apiClient = createApiClient({
  surfaces: { api: '/api', auth: '/api/auth' },
  // Vite replaces `import.meta.env.SSR` with `false` in the client build, so this branch — and the server
  // module graph behind it — is eliminated there. The `import.meta.env.SSR` guard lives here in app code, not
  // in the package, because `@shadow-library/web` ships prebuilt: a bare `() => import(...)` is never *called*
  // in the browser, but Rollup would still bundle its target for the client and drag `node:stream` in with it.
  // `createSsrTransport` resolves the origin (`API_ORIGIN` ?? `SERVER_URL` ?? the fallback) on the SSR-only path.
  ssr: import.meta.env.SSR ? () => import('@shadow-library/web/server').then(m => m.createSsrTransport({ fallback: 'http://localhost:8080' })) : undefined,
});

export const APIRequest = apiClient.api;

export { ApiError, isApiError } from '@shadow-library/web';
