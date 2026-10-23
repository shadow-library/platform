import { createApiClient } from '@shadow-library/web';

/**
 * The browser hits same-origin `/api/*` (vite proxy in dev, ingress in prod) so cookies, CSRF and the service worker's GET caching work natively.
 * SSR has no relative URLs or cookie jar, so it reaches webnovel-server directly and forwards the caller's cookie. Paths are surface-relative (`/novels`).
 */
export const apiClient = createApiClient({
  surfaces: { api: '/api', auth: '/api/auth' },
  // The `import.meta.env.SSR` guard must live in app code: `@shadow-library/web` ships prebuilt, so a bare `() => import(...)` in the package would still make Rollup
  // bundle its target (and `node:stream`) for the client. Vite folds it to `false` in the client build.
  ssr: import.meta.env.SSR ? () => import('@shadow-library/web/server').then(m => m.createSsrTransport({ fallback: 'http://localhost:8080' })) : undefined,
});

export const APIRequest = apiClient.api;

export { ApiError, isApiError } from '@shadow-library/web';
