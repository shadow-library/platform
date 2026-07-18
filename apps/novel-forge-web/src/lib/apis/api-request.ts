/**
 * Importing npm packages
 */
import { createServerFn } from '@tanstack/react-start';
import { type ApiResult, call, type JsonValue, type QueryParams } from '@shadow-library/web';

/**
 * Importing user defined packages
 */
import { serverFetch } from './server-fetch';

/**
 * Defining types
 */

/** Options for query hooks that poll — e.g. following a job or workflow run to completion. */
export interface PollingOptions {
  refetchInterval?: number;
}

export type QueryValue = string | number | boolean;

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface ApiCallSpec {
  method: HttpMethod;
  path: string;
  query: Record<string, string>;
  body?: JsonValue;
}

/**
 * Declaring the constants
 *
 * The error and transport surface comes from `@shadow-library/web`, so one error contract flows
 * backend → server function → UI. `ApiError`/`isApiError` are re-exported under the path the app's
 * `*.api.ts` files already import.
 */
export { ApiError, isApiError } from '@shadow-library/web';
export type { ErrorField, ErrorResponse } from '@shadow-library/web';

/**
 * The single RPC every versioned-API call goes through. On the client it travels as a server-function
 * request; during SSR it short-circuits to a direct invocation — either way the handler runs on the Start
 * server, where `serverFetch` forwards the session cookie and satisfies the CSRF double-submit. The
 * validator pins the spec to a backend-relative path so the passthrough cannot be aimed elsewhere.
 */
const executeApiCall = createServerFn({ method: 'POST' })
  .validator((spec: ApiCallSpec): ApiCallSpec => {
    if (!spec.path.startsWith('/') || spec.path.includes('..')) throw new Error(`Invalid API path: ${spec.path}`);
    return spec;
  })
  .handler(({ data }): Promise<ApiResult<JsonValue>> => serverFetch({ method: data.method, path: data.path, query: data.query, body: data.body }));

/**
 * The app-facing HTTP client: the same chainable, thenable builder the screens have always used, now a
 * thin facade over the `@shadow-library/web` transport instead of a hand-rolled isomorphic `fetch`.
 */
export class APIRequest {
  private readonly spec: ApiCallSpec;

  private constructor(path: string, method: HttpMethod) {
    this.spec = { method, path, query: {} };
  }

  static get(path: string): APIRequest {
    return new APIRequest(path, 'GET');
  }

  static post(path: string): APIRequest {
    return new APIRequest(path, 'POST');
  }

  static put(path: string): APIRequest {
    return new APIRequest(path, 'PUT');
  }

  static patch(path: string): APIRequest {
    return new APIRequest(path, 'PATCH');
  }

  static delete(path: string): APIRequest {
    return new APIRequest(path, 'DELETE');
  }

  query(key: string, value: QueryValue): this;
  query(params: QueryParams): this;
  query(keyOrParams: string | QueryParams, value?: QueryValue): this {
    if (typeof keyOrParams === 'string') {
      if (value !== undefined) this.spec.query[keyOrParams] = String(value);
    } else {
      for (const [key, val] of Object.entries(keyOrParams)) {
        if (val !== undefined) this.spec.query[key] = String(val);
      }
    }
    return this;
  }

  /** Accepts any request DTO — generated bodies may carry freeform blobs; they stay JSON-serialisable as-is. */
  body(data: object): this {
    this.spec.body = data as JsonValue;
    return this;
  }

  async execute<T>(): Promise<T> {
    return call(executeApiCall({ data: this.spec }) as Promise<ApiResult<T>>);
  }

  then<T, TResult1 = T, TResult2 = never>(
    resolve?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    reject?: ((reason?: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute<T>().then(resolve, reject);
  }

  catch<T, TResult = never>(reject?: ((reason?: unknown) => TResult | PromiseLike<TResult>) | null): Promise<T | TResult> {
    return this.execute<T>().catch(reject);
  }

  finally(callback: () => void): Promise<unknown> {
    return this.execute().finally(callback);
  }
}
