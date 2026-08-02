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
 * Declaring the constants
 *
 * The whole of identity-web's transport configuration. `@shadow-library/web` owns the request builder, the
 * browser/SSR split, the CSRF double-submit and the error contract, so what is left here is the one base
 * path this app talks to and how to reach the backend during SSR.
 *
 * Identity is itself the provider, so — unlike every other Shadow web app — it has no `/api/auth` surface
 * to mount alongside `/api/v1`: the interactive flows in `auth.api.ts` are its own versioned endpoints.
 *
 * In the browser this calls the same-origin `/api/v1/...` (the reverse proxy routes that prefix to the
 * identity server, so cookies and the CSRF double-submit work natively). During SSR there is no browser to
 * do that, so it reaches the backend origin directly through `createSsrTransport` — resolved from
 * `API_ORIGIN` (the canonical deploy-time var), falling back to `SERVER_URL`, falling back to identity-web's
 * own local-dev default below.
 */
export { ApiError, isApiError } from '@shadow-library/web';
export type { ApiFailure, ApiResult, ErrorField, ErrorResponse, QueryParams, QueryValue } from '@shadow-library/web';

export const apiClient = createApiClient({
  surfaces: { v1: '/api/v1' },
  // Vite replaces `import.meta.env.SSR` with `false` in the client build, so this whole branch — and the
  // server module graph behind it — is eliminated there. A bare `() => import(...)` would not do: the thunk
  // is never called in the browser, but Rollup would still bundle its target for the client and drag
  // `node:stream` in with it. The guard has to live here, in app code, rather than inside
  // `@shadow-library/web/server`: that package ships prebuilt, so Vite never gets to substitute
  // `import.meta.env.SSR` inside it and eliminate the server module graph from the client bundle.
  ssr: import.meta.env.SSR ? () => import('@shadow-library/web/server').then(m => m.createSsrTransport({ fallback: 'http://localhost:9091' })) : undefined,
});

/** Paths are relative to the versioned API — `/me/sessions`, not `/api/v1/me/sessions`. */
export const APIRequest = apiClient.v1;
