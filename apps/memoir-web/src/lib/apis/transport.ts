import { createApiClient } from '@shadow-library/web';

/**
 * The browser hits the same-origin `/api/*` — vite proxies it in dev, the ingress routes it in prod — so cookies and the CSRF double-submit
 * work natively and the service worker can apply a strategy to a real GET. Paths are surface-relative: `/quests`, not `/api/quests`.
 */
export const apiClient = createApiClient({
  surfaces: { api: '/api', auth: '/api/auth' },
  // Vite replaces `import.meta.env.SSR` with `false` in the client build, eliminating this branch and the
  // server module graph behind it. The guard lives here rather than in the package because
  // `@shadow-library/web` ships prebuilt: a bare `() => import(...)` is never called in the browser, but
  // Rollup would still bundle its target for the client and drag `node:stream` in with it.
  ssr: import.meta.env.SSR ? () => import('@shadow-library/web/server').then(m => m.createSsrTransport({ fallback: 'http://localhost:8080' })) : undefined,
});

export const APIRequest = apiClient.api;

export { isApiError } from '@shadow-library/web';
