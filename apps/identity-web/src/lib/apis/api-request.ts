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
 */
export { ApiError, isApiError } from '@shadow-library/web';
export type { ApiFailure, ApiResult, ErrorField, ErrorResponse, QueryParams, QueryValue } from '@shadow-library/web';

export const apiClient = createApiClient({
  surfaces: { v1: '/api/v1' },
  // Vite replaces `import.meta.env.SSR` with `false` in the client build, so this whole branch — and the
  // server module graph behind it — is eliminated there. A bare `() => import(...)` would not do: the thunk
  // is never called in the browser, but Rollup would still bundle its target for the client and drag
  // `node:stream` in with it.
  ssr: import.meta.env.SSR ? () => import('./ssr-transport') : undefined,
});

/** Paths are relative to the versioned API — `/me/sessions`, not `/api/v1/me/sessions`. */
export const APIRequest = apiClient.v1;
