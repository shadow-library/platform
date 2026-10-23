import { createApiClient } from '@shadow-library/web';

export { ApiError, isApiError } from '@shadow-library/web';
export type { ApiFailure, ApiResult, ErrorField, ErrorResponse, PollingOptions, QueryParams, QueryValue } from '@shadow-library/web';

// The SSR guard must live in app code: @shadow-library/web ships prebuilt so Vite cannot prune its server graph there, and a bare dynamic import would still bundle node:stream.
export const apiClient = createApiClient({
  surfaces: { v1: '/api/v1', auth: '/api/auth' },
  ssr: import.meta.env.SSR ? () => import('@shadow-library/web/server').then(m => m.createSsrTransport({ fallback: 'http://localhost:8080' })) : undefined,
});

/** Paths are relative to the versioned API: `/dashboard/stats`, not `/api/v1/dashboard/stats`. */
export const APIRequest = apiClient.v1;
