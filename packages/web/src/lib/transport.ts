/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { type ApiResult } from './api-result';

/**
 * Defining types
 *
 * The contract between `createApiClient` and its server-only half. It lives here, beside the browser code,
 * rather than next to the implementation: importing it from `../server/server-fetch` would leave a bare
 * `import {} from '../server/server-fetch.js'` in the emitted browser module — type-only at the source
 * level, but a side-effectful module record after transpilation, which is enough to pull
 * `@tanstack/react-start/server` into the client bundle. Types have no runtime, so they cost nothing here.
 */
export interface ServerFetchSpec {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Path under the transport's configured `baseUrl`, e.g. `/api/v1/me`. */
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  headers?: Record<string, string>;
  /** Non-2xx statuses whose typed body should resolve instead of failing (interactive auth flows). */
  modeled?: number[];
  signal?: AbortSignal;
}

export type ServerFetch = <T>(spec: ServerFetchSpec) => Promise<ApiResult<T>>;

/**
 * Declaring the constants
 */
