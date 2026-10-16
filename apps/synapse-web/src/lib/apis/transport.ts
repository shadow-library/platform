import { createApiClient } from '@shadow-library/web';

export { ApiError, isApiError } from '@shadow-library/web';

/**
 * The `import.meta.env.SSR` guard has to live in app code: `@shadow-library/web/server` ships prebuilt, so only here can Vite drop the
 * server module graph from the client bundle.
 */
export const apiClient = createApiClient({
  surfaces: { v1: '/api/v1', auth: '/api/auth' },
  ssr: import.meta.env.SSR ? () => import('@shadow-library/web/server').then(m => m.createSsrTransport({ fallback: 'http://localhost:8080' })) : undefined,
});

export const APIRequest = apiClient.v1;
