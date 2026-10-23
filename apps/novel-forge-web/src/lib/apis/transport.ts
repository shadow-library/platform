import { createApiClient } from '@shadow-library/web';

/**
 * Browser calls are same-origin: the ingress routes `/api/*` to novel-forge-server. SSR reaches it directly through `createSsrTransport`, which resolves the origin from
 * `API_ORIGIN`, then `SERVER_URL`, then the fallback below.
 *
 * The `import.meta.env.SSR` guard must live in app code: `@shadow-library/web/server` ships prebuilt, so Vite cannot eliminate it from the client bundle, and a bare
 * `() => import(...)` would still make Rollup bundle `node:stream` into the client build.
 */
export { ApiError, isApiError } from '@shadow-library/web';
export type { ApiFailure, ApiResult, ErrorField, ErrorResponse, PollingOptions, QueryParams, QueryValue } from '@shadow-library/web';

export const apiClient = createApiClient({
  surfaces: { v1: '/api/v1', auth: '/api/auth' },
  ssr: import.meta.env.SSR ? () => import('@shadow-library/web/server').then(m => m.createSsrTransport({ fallback: 'http://localhost:8080' })) : undefined,
});

export const APIRequest = apiClient.v1;
