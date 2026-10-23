import { type ApiResult } from './api-result';

// Declared here, not in `server/server-fetch`: importing from there would pull `@tanstack/react-start/server` into the client bundle.

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
