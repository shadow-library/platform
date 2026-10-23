import { type JsonObject, type JsonValue, type QueryValue, type VoidFn } from '../types';
import { ApiError, type ErrorResponse } from './api-error';
import { type ApiResult } from './api-result';
import { type CsrfConfig, csrfSetCookie, ensureCsrfToken, resolveCsrfConfig } from './csrf';
import { type ServerFetch } from './transport';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Loads the server-only transport. Invoked lazily and only on the server, so the module never enters the client graph. */
export type SsrTransportLoader = () => Promise<{ serverFetch: ServerFetch }>;

export interface ApiClientConfig<TSurfaces extends Record<string, string>> {
  /** Named base paths rooted at the public origin, e.g. `{ v1: '/api/v1', auth: '/api/auth' }`; all share one cookie jar, CSRF policy and SSR transport. */
  surfaces: TSurfaces;
  /**
   * Dynamic import of the server-only transport, supplied behind Vite's `import.meta.env.SSR` so the client build eliminates it:
   * `ssr: import.meta.env.SSR ? () => import('./ssr-transport') : undefined`. A bare `() => import(...)` still bundles `node:*` modules into the client.
   */
  ssr?: SsrTransportLoader;
  /** CSRF cookie/header/TTL overrides; the defaults match every Shadow backend. */
  csrf?: CsrfConfig;
}

export interface ApiSurface {
  get(path: string): ApiRequest;
  post(path: string): ApiRequest;
  put(path: string): ApiRequest;
  patch(path: string): ApiRequest;
  delete(path: string): ApiRequest;
  /** For callers that need a URL rather than a request, e.g. a full-page redirect into `/api/auth/login`. */
  readonly basePath: string;
}

export type ApiClient<TSurfaces extends Record<string, string>> = { [K in keyof TSurfaces]: ApiSurface };

/** Options for polling query hooks; the function form receives the query's last data (as React Query's `refetchInterval` does) and returns `false` to stop. */
export interface PollingOptions<TData = unknown> {
  refetchInterval?: number | ((query: { state: { data?: TData } }) => number | false);
}

interface SurfaceContext {
  basePath: string;
  ssr?: SsrTransportLoader;
  csrf: ReturnType<typeof resolveCsrfConfig>;
}

interface RequestSpec {
  method: HttpMethod;
  path: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body?: JsonValue;
  modeled?: number[];
  signal?: AbortSignal;
  timeoutMs?: number;
}

// Evaluated per request: a module-load snapshot would predate a late-installed DOM and pin every call to the server branch.

function isServer(): boolean {
  return typeof window === 'undefined';
}

const NETWORK_FAILURE = { status: -1, code: 'NETWORK_ERROR', type: 'NetworkError', message: 'Unable to reach the server' } as const;

export class ApiClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiClientError';
  }
}

/** An abort or timeout must propagate untouched so TanStack Query reads it as a cancellation rather than a failed request. */
function isCancellation(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

/** A chainable, thenable request. The browser fetches same-origin; the SSR pass goes through `createServerFetch` by absolute origin with the inbound cookies. */
export class ApiRequest {
  private readonly spec: RequestSpec;

  constructor(
    private readonly context: SurfaceContext,
    method: HttpMethod,
    path: string,
  ) {
    this.spec = { method, path, headers: {}, query: {} };
  }

  header(key: string, value: string): this {
    this.spec.headers[key] = value;
    return this;
  }

  query(key: string, value: QueryValue): this;
  // Mapped over its own keys because an `interface` lacks the implicit index signature and would not be assignable to `Record<string, QueryValue>`.
  query<T extends object>(params: (T & { [K in keyof T]: QueryValue | undefined }) | undefined): this;
  query(keyOrParams: string | object | undefined, value?: QueryValue): this {
    if (keyOrParams === undefined) return this;

    if (typeof keyOrParams === 'string') {
      if (value !== undefined) this.spec.query[keyOrParams] = String(value);
      return this;
    }

    for (const [key, val] of Object.entries(keyOrParams)) {
      if (val !== undefined) this.spec.query[key] = String(val);
    }
    return this;
  }

  /** Sets a value at a dotted path, building the intermediate objects — `field('profile.name', 'Ada')`. */
  field(key: string, value: JsonValue): this {
    if (!this.spec.body) this.spec.body = {};

    const keys = key.split('.');
    let pointer = this.spec.body as JsonObject;
    for (let index = 0; index < keys.length - 1; index++) {
      const currentKey = keys[index] as string;
      if (!pointer[currentKey]) pointer[currentKey] = {};
      pointer = pointer[currentKey] as JsonObject;
    }
    pointer[keys[keys.length - 1] as string] = value;

    return this;
  }

  /** Accepts any request DTO — generated bodies carry freeform blobs that aren't assignable to `JsonValue`, and stay JSON-serialisable as-is. */
  body(data: object): this {
    this.spec.body = data as JsonValue;
    return this;
  }

  /** Non-2xx statuses whose typed body is part of the contract (e.g. an auth flow answering 400 with the next step); they resolve as data instead of throwing. */
  modeled(...statuses: number[]): this {
    this.spec.modeled = statuses;
    return this;
  }

  /** Cancels the request when the signal aborts; the abort propagates as-is instead of becoming an `ApiError`. */
  signal(signal: AbortSignal): this {
    this.spec.signal = signal;
    return this;
  }

  /** Aborts the request if it hasn't settled within `ms`. Composes with `signal()` — either aborting cancels the request. */
  timeout(ms: number): this {
    this.spec.timeoutMs = ms;
    return this;
  }

  /** The typed body, or a thrown `ApiError`. The shape every query and mutation is written against. */
  async execute<T>(): Promise<T> {
    const result = await this.result<T>();
    if (result.ok) return result.data;
    throw new ApiError(result.failure.status, result.failure, result.failure.retryAfterSeconds);
  }

  /** The result envelope instead of a throw, for callers that treat a failure as a value (a 401 on the session endpoint means signed out). */
  result<T>(): Promise<ApiResult<T>> {
    return isServer() ? this.dispatchOnServer<T>() : this.dispatchInBrowser<T>();
  }

  private async dispatchOnServer<T>(): Promise<ApiResult<T>> {
    if (!this.context.ssr) throw new ApiClientError('No SSR transport configured — pass `ssr` to `createApiClient` behind an `import.meta.env.SSR` guard.');
    const { serverFetch } = await this.context.ssr();
    const { method, path, headers, query, body, modeled } = this.spec;
    return serverFetch<T>({ method, path: this.context.basePath + path, headers, query, body, modeled, signal: this.abortSignal() });
  }

  private async dispatchInBrowser<T>(): Promise<ApiResult<T>> {
    const { method, path, headers, query, body, modeled } = this.spec;

    const search = new URLSearchParams(query);
    const url = `${this.context.basePath}${path}${search.size ? `?${search.toString()}` : ''}`;

    // Double-submit CSRF: the backend compares this header with the cookie; minted when absent, same rule as the SSR transport.
    const requestHeaders: Record<string, string> = { accept: 'application/json', ...headers };
    if (method !== 'GET') {
      const token = ensureCsrfToken(document.cookie, this.context.csrf);
      if (token.mintedValue) document.cookie = csrfSetCookie(token.mintedValue, this.context.csrf);
      requestHeaders[this.context.csrf.header] = token.token;
    }

    const init: RequestInit = { method, headers: requestHeaders, credentials: 'same-origin' };
    const signal = this.abortSignal();
    if (signal) init.signal = signal;
    if (body !== undefined) {
      requestHeaders['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      if (isCancellation(error)) throw error;
      return { ok: false, failure: NETWORK_FAILURE };
    }

    const payload = await parseBody(response);
    if (response.ok || modeled?.includes(response.status)) return { ok: true, data: payload as T };

    const envelope = (payload ?? {}) as Partial<ErrorResponse>;
    const retryAfter = response.headers.get('retry-after');
    return {
      ok: false,
      failure: {
        status: response.status,
        code: envelope.code ?? 'UNKNOWN_ERROR',
        type: envelope.type ?? 'UnknownError',
        message: envelope.message ?? `Request failed with status ${response.status}`,
        fields: envelope.fields,
        retryAfterSeconds: retryAfter ? parseInt(retryAfter, 10) : undefined,
      },
    };
  }

  private abortSignal(): AbortSignal | undefined {
    const { signal, timeoutMs } = this.spec;
    const timeoutSignal = timeoutMs !== undefined ? AbortSignal.timeout(timeoutMs) : undefined;
    if (signal && timeoutSignal) return AbortSignal.any([signal, timeoutSignal]);
    return signal ?? timeoutSignal;
  }

  // biome-ignore lint/suspicious/noThenProperty: intentionally thenable so a request can be awaited directly
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

// Some endpoints answer 200 with an empty or non-JSON body; that is a void result, not a parse failure.
async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Builds an app's single API client: one cookie/CSRF policy and SSR transport, one surface per base path. */
export function createApiClient<TSurfaces extends Record<string, string>>(config: ApiClientConfig<TSurfaces>): ApiClient<TSurfaces> {
  const csrf = resolveCsrfConfig(config.csrf);
  const client = {} as ApiClient<TSurfaces>;

  for (const [name, basePath] of Object.entries(config.surfaces)) {
    const context: SurfaceContext = { basePath, ssr: config.ssr, csrf };
    client[name as keyof TSurfaces] = {
      basePath,
      get: path => new ApiRequest(context, 'GET', path),
      post: path => new ApiRequest(context, 'POST', path),
      put: path => new ApiRequest(context, 'PUT', path),
      patch: path => new ApiRequest(context, 'PATCH', path),
      delete: path => new ApiRequest(context, 'DELETE', path),
    };
  }

  return client;
}
