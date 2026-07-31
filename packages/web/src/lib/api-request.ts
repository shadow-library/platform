/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { type JsonObject, type JsonValue, type VoidFn } from '../types';
import { ApiError, type ErrorResponse } from './api-error';

/**
 * Defining types
 */
export interface APIRequestOptions {
  path: string;
  method: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  data?: JsonObject;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface PreRequestContext {
  url: string;
  init: RequestInit;
  options: Readonly<APIRequestOptions>;
}

export interface PostResponseContext {
  response: Response;
  options: Readonly<APIRequestOptions>;
}

export type PreRequestHook = (context: PreRequestContext) => void | Promise<void>;

export type PostResponseHook = (context: PostResponseContext) => void | Promise<void>;

export type QueryParams = Record<string, string | number | boolean | undefined>;

/**
 * Declaring the constants
 */

/**
 * Read `VITE_API_BASE_URL` without assuming a Vite runtime. `import.meta.env` is injected only by
 * Vite-family bundlers; in a plain Node/SSR runtime it is `undefined`, so touching a property on it at
 * module-evaluation time throws and makes the module un-importable. Reading it defensively keeps the
 * module import-safe everywhere while still honoring the env var under Vite.
 */
function resolveEnvBaseUrl(): string {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return env?.VITE_API_BASE_URL ?? '';
}

/**
 * A chainable, thenable HTTP client for browser-origin calls (SPA apps, or any code that talks to the API
 * directly rather than through a server function). Non-2xx responses reject with an `ApiError`.
 */
export class APIRequest {
  private static baseUrl = resolveEnvBaseUrl();
  private static preRequestHook: PreRequestHook | null = null;
  private static postResponseHook: PostResponseHook | null = null;

  private readonly options: APIRequestOptions;

  private constructor(path: string, method: string) {
    this.options = { path, method, headers: {}, query: {} };
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

  static setBaseUrl(baseUrl: string): void {
    APIRequest.baseUrl = baseUrl;
  }

  static setPreRequestHook(hook: PreRequestHook | null): void {
    APIRequest.preRequestHook = hook;
  }

  static setPostResponseHook(hook: PostResponseHook | null): void {
    APIRequest.postResponseHook = hook;
  }

  header(key: string, value: string): this {
    this.options.headers[key] = value;
    return this;
  }

  query(key: string, value: string): this;
  query(params: QueryParams): this;
  query(keyOrParams: string | QueryParams, value?: string): this {
    if (typeof keyOrParams === 'string') {
      if (value !== undefined) this.options.query[keyOrParams] = String(value);
    } else {
      for (const [key, val] of Object.entries(keyOrParams)) {
        if (val !== undefined) this.options.query[key] = String(val);
      }
    }
    return this;
  }

  field(key: string, value: JsonValue): this {
    if (!this.options.data) this.options.data = {};

    const keys = key.split('.');
    let pointer = this.options.data;
    for (let index = 0; index < keys.length - 1; index++) {
      const currentKey = keys[index] as string;
      if (!pointer[currentKey]) pointer[currentKey] = {};
      pointer = pointer[currentKey] as JsonObject;
    }
    pointer[keys[keys.length - 1] as string] = value;

    return this;
  }

  body(data: object): this {
    // The internal store stays `JsonObject` so `field()` can walk it; `body()` accepts any request DTO
    // (generated bodies carry freeform `{ [k]: unknown }` blobs that aren't assignable to `JsonValue`) —
    // still JSON-serialisable, so it is kept as-is for `JSON.stringify`.
    this.options.data = data as JsonObject;
    return this;
  }

  /**
   * Bind an `AbortSignal` so the request is cancelled when the signal aborts. Pass the `signal` TanStack
   * Query hands a `queryFn` (`queryFn: ({ signal }) => APIRequest.get('/x').signal(signal).execute()`) to make
   * queries cancel on unmount or when superseded — the abort propagates as-is instead of becoming an `ApiError`.
   */
  signal(signal: AbortSignal): this {
    this.options.signal = signal;
    return this;
  }

  /** Abort the request if it hasn't settled within `ms`. Composes with `signal()` — either aborting cancels the fetch. */
  timeout(ms: number): this {
    this.options.timeoutMs = ms;
    return this;
  }

  async execute<T>(): Promise<T> {
    const { path, method, headers, query, data, signal, timeoutMs } = this.options;

    let url: string = path;
    const searchParams = new URLSearchParams(query);
    if (searchParams.size) url += `?${searchParams.toString()}`;
    if (!path.startsWith('http://') && !path.startsWith('https://')) url = APIRequest.baseUrl + url;

    const init: RequestInit = { method, headers };
    if (data) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(data);
    }

    // A caller `signal` (query cancellation) and a `timeout` deadline both abort the same fetch; combine
    // them when both are present so whichever fires first wins.
    const timeoutSignal = timeoutMs !== undefined ? AbortSignal.timeout(timeoutMs) : undefined;
    const requestSignal = signal && timeoutSignal ? AbortSignal.any([signal, timeoutSignal]) : (signal ?? timeoutSignal);
    if (requestSignal) init.signal = requestSignal;

    let response: Response;
    try {
      const options = { ...this.options };
      if (APIRequest.preRequestHook) await APIRequest.preRequestHook({ url, init, options });
      response = await fetch(url, init);
      if (APIRequest.postResponseHook) await APIRequest.postResponseHook({ response, options });
    } catch (error) {
      // A cancelled or timed-out request must propagate as-is so TanStack Query treats it as a
      // cancellation, not a failed request masquerading as a network error.
      if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')) throw error;
      throw new ApiError(-1, { code: 'NETWORK_ERROR', type: 'NetworkError', message: 'Unable to reach the server' });
    }

    if (!response.ok) {
      let body: ErrorResponse;
      try {
        body = await response.json();
      } catch {
        throw new ApiError(response.status, { code: 'UNKNOWN_ERROR', type: 'UnknownError', message: `Request failed with status ${response.status}` });
      }
      const retryAfter = response.headers.get('retry-after');
      throw new ApiError(response.status, body, retryAfter ? parseInt(retryAfter, 10) : undefined);
    }

    if (response.status === 204) return undefined as T;
    return response.json();
  }

  // biome-ignore lint/suspicious/noThenProperty: this class is intentionally thenable for convenient use in async contexts
  then<T, TResult1 = T, TResult2 = never>(
    resolve?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    reject?: ((reason?: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute<T>().then(resolve, reject);
  }

  catch<T, TResult = never>(reject?: ((reason?: unknown) => TResult | PromiseLike<TResult>) | null): Promise<T | TResult> {
    return this.execute<T>().catch(reject);
  }

  finally(callback: VoidFn): Promise<unknown> {
    return this.execute().finally(callback);
  }
}
