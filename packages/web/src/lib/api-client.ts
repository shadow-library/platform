/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { type JsonObject, type JsonValue, type QueryValue, type VoidFn } from '../types';
import { ApiError, type ErrorResponse } from './api-error';
import { type ApiResult } from './api-result';
import { type CsrfConfig, csrfSetCookie, ensureCsrfToken, resolveCsrfConfig } from './csrf';
import { type ServerFetch } from './transport';

/**
 * Defining types
 *
 * One transport, two runtimes. Deployments front each app with a single origin whose ingress routes `/api/*`
 * to the backend and everything else to the web app, which makes the browser's call to `/api/v1/...`
 * same-origin: the session cookie is attached natively, the CSRF double-submit works natively, `AbortSignal`
 * cancels a real request, and HTTP caching and service-worker interception both still apply. The SSR pass
 * has none of that — no browser, no relative resolution, no cookie jar — so it goes out through
 * `createServerFetch`, which reaches the backend by absolute origin and forwards the inbound request's
 * cookies and headers.
 *
 * Call sites see neither: `api.get('/projects').execute()` is written once and does the right thing in both.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Loads the server-only transport. Invoked lazily and only on the server, so the module never enters the client graph. */
export type SsrTransportLoader = () => Promise<{ serverFetch: ServerFetch }>;

export interface ApiClientConfig<TSurfaces extends Record<string, string>> {
  /**
   * The named base paths this app talks to, each rooted at the public origin — typically
   * `{ v1: '/api/v1', auth: '/api/auth' }`. Surfaces are paths, not clients: they share one cookie jar, one
   * CSRF policy, and one SSR transport, which is why an app needs exactly one `createApiClient` call.
   */
  surfaces: TSurfaces;
  /**
   * Dynamic import of the app's server-only transport module. It must be supplied behind Vite's
   * `import.meta.env.SSR`, which the client build replaces with `false` so the branch — and with it the
   * whole server module graph — is eliminated:
   *
   * ```ts
   * ssr: import.meta.env.SSR ? () => import('./ssr-transport') : undefined,
   * ```
   *
   * A bare `() => import(...)` is not enough: the thunk is never invoked in the browser, but Rollup still
   * resolves and bundles the target for the client environment, which pulls `node:stream` and
   * `node:async_hooks` in and fails the build. The guard has to live in app code, because that is what
   * Vite transforms — this package ships prebuilt, so a guard written here would never be substituted.
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
  /** The surface's base path, for the handful of places that need a URL rather than a request — a full-page redirect into `/api/auth/login`, say. */
  readonly basePath: string;
}

export type ApiClient<TSurfaces extends Record<string, string>> = { [K in keyof TSurfaces]: ApiSurface };

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

/**
 * Declaring the constants
 */

/**
 * SSR is the absence of a browser, not the presence of Node — the check must hold under Bun, workers and
 * tests alike. It is evaluated per request rather than once at module load: a module-load snapshot would be
 * captured before a test (or any environment that installs a DOM late) had a `window` to find, and would
 * then route every browser call down the server branch for the lifetime of the process.
 */
function isServer(): boolean {
  return typeof window === 'undefined';
}

const NETWORK_FAILURE = { status: -1, code: 'NETWORK_ERROR', type: 'NetworkError', message: 'Unable to reach the server' } as const;

/** A misconfigured client — raised where the mistake is, rather than surfacing later as an unexplained request failure. */
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

/**
 * A chainable, thenable request. Identical to write on both runtimes; only `dispatch` differs.
 */
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
  /**
   * The params object is typed as a mapped type over its own keys rather than as `QueryParams`, because
   * TypeScript withholds the implicit index signature from an `interface`: a declared `ListUsersParams`
   * would not be assignable to `Record<string, QueryValue>`, and every caller holding a generated params
   * interface would have to spread it (`.query({ ...params })`) to launder the type. This form accepts the
   * interface directly and still checks each property's value type.
   */
  query<T extends object>(params: (T & { [K in keyof T]: QueryValue | undefined }) | undefined): this;
  query(keyOrParams: string | object | undefined, value?: QueryValue): this {
    // An absent params object is a no-op, so a caller holding optional filters can pass them straight
    // through instead of guarding every call site with `?? {}`.
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

  /**
   * Non-2xx statuses whose typed body is part of the contract rather than a failure — an interactive auth
   * flow answering 400 with the next step, say. They resolve as data instead of throwing.
   */
  modeled(...statuses: number[]): this {
    this.spec.modeled = statuses;
    return this;
  }

  /**
   * Binds an `AbortSignal` so the request is cancelled when the signal aborts. Pass the `signal` TanStack
   * Query hands a `queryFn` to make queries cancel on unmount or when superseded — the abort propagates
   * as-is instead of becoming an `ApiError`.
   */
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

  /**
   * The result envelope rather than a throw, for the callers that treat a specific failure as a value —
   * a 401 on the session endpoint means "signed out", which is a state a guest-browsable app renders
   * rather than an error it reports.
   */
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

    // The backend's double-submit compares a header against a cookie the browser holds. Reading and, when
    // absent, minting it here is the same rule the SSR transport applies — one implementation, two callers.
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

  /** A caller `signal` and a `timeout` deadline abort the same request; combine them so whichever fires first wins. */
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

// Some endpoints answer 200 with an empty or non-JSON body — treat that as a void result rather than a parse failure.
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

/**
 * Builds an app's API client: one instance, one cookie and CSRF policy, one SSR transport, and a surface
 * per base path the app talks to. This is the whole of an app's transport configuration — everything that
 * used to be hand-rolled per app (the request builder, the environment split, the CSRF handling, the second
 * client for the un-versioned auth routes) is behind it.
 */
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
