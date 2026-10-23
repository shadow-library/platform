import { createApiClient } from '@shadow-library/web';

/** Identity is itself the provider, so unlike other Shadow web apps it has no `/api/auth` surface; its interactive flows are versioned endpoints under `/api/v1`. */
export { ApiError, isApiError } from '@shadow-library/web';
export type { ApiFailure, ApiResult, ErrorField, ErrorResponse, QueryParams, QueryValue } from '@shadow-library/web';

const apiClient = createApiClient({
  surfaces: { v1: '/api/v1' },
  // `import.meta.env.SSR` is `false` in the client build, so this branch and its server module graph (`node:stream`) are eliminated there.
  // The guard must live in app code: `@shadow-library/web/server` ships prebuilt, so Vite cannot substitute it inside the package.
  ssr: import.meta.env.SSR ? () => import('@shadow-library/web/server').then(m => m.createSsrTransport({ fallback: 'http://localhost:9091' })) : undefined,
});

/** Paths are relative to the versioned API — `/me/sessions`, not `/api/v1/me/sessions`. */
export const APIRequest = apiClient.v1;
