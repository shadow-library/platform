/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { type JsonObject, type JsonValue } from '@/types';

/**
 * Defining types
 */

/** A single field-level validation problem, folded into the thrown error's message. */
export interface ErrorFieldDto {
  field: string;
  msg: string;
}

/** The stable machine-readable error envelope every identity endpoint answers non-2xx with. */
export interface ErrorResponseDto {
  code: string;
  type: string;
  message: string;
  fields?: ErrorFieldDto[] | null;
}

export type QueryValue = string | number | boolean;

interface APIRequestOptions {
  path: string;
  method: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  data?: JsonObject;
  modeled: number[];
}

/**
 * Raised for any response the caller did not model. Carries the machine `code` (for the error page /
 * inline messages), the field problems, and `retryAfterSeconds` for rate-limited responses.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly type: string;
  readonly fields: ErrorResponseDto['fields'];
  readonly retryAfterSeconds?: number;

  constructor(status: number, body: ErrorResponseDto, retryAfterSeconds?: number) {
    // Validation errors carry the actual field problems; fold them into the message so a toast
    // explains the rejection instead of the generic sentence.
    const fieldDetail = body.fields?.length ? ` — ${body.fields.map(field => `${field.field}: ${field.msg}`).join('; ')}` : '';
    super(`${body.message}${fieldDetail}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.type = body.type;
    this.fields = body.fields;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Declaring the constants
 */
const BASE_URL = '/api/v1';
const CSRF_COOKIE = 'csrf-token';
const CSRF_HEADER = 'x-csrf-token';
const CSRF_SELF_MINT_TTL_SECONDS = 3600;

function readCookie(name: string): string | undefined {
  const prefix = `${name}=`;
  const entry = document.cookie.split('; ').find(part => part.startsWith(prefix));
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : undefined;
}

function writeCookie(name: string, value: string, maxAgeSeconds: number): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; samesite=lax`;
}

function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Double-submit CSRF: the server refreshes the `csrf-token` cookie on every cookied response, so
 * normally the client just echoes it. A cookieless first visit mints its own pair — the middleware
 * only compares cookie and header, it does not require a server-issued value.
 */
function csrfToken(): string {
  const existing = readCookie(CSRF_COOKIE);
  if (existing) {
    const [expiry, token] = existing.split(':');
    if (expiry && token && parseInt(expiry, 36) > Date.now()) return token;
  }
  const token = randomHex(16);
  const expiresAt = (Date.now() + CSRF_SELF_MINT_TTL_SECONDS * 1000).toString(36);
  writeCookie(CSRF_COOKIE, `${expiresAt}:${token}`, CSRF_SELF_MINT_TTL_SECONDS);
  return token;
}

/**
 * A small fluent HTTP client for the identity API. Unlike a plain JSON client it (a) sends the CSRF
 * double-submit header and same-origin credentials on every call, and (b) supports `.modeled(...)`:
 * the interactive auth flows answer 401/409/410/429 with *typed bodies* (attemptsLeft, resendsLeft,
 * status), so those statuses must resolve rather than throw.
 */
export class APIRequest {
  private readonly options: APIRequestOptions;

  private constructor(path: string, method: string) {
    this.options = { path, method, headers: {}, query: {}, modeled: [] };
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

  header(key: string, value: string): this {
    this.options.headers[key] = value;
    return this;
  }

  query(key: string, value: QueryValue): this;
  query(params: object): this;
  query(keyOrParams: string | object, value?: QueryValue): this {
    if (typeof keyOrParams === 'string') this.options.query[keyOrParams] = String(value);
    else {
      for (const [key, val] of Object.entries(keyOrParams)) {
        if (val !== undefined && val !== null) this.options.query[key] = String(val);
      }
    }
    return this;
  }

  field(key: string, value: JsonValue): this {
    if (!this.options.data) this.options.data = {};
    this.options.data[key] = value;
    return this;
  }

  body(data: object): this {
    this.options.data = data as JsonObject;
    return this;
  }

  /** Resolve (return the typed body) for these non-2xx statuses instead of throwing — for auth flows. */
  modeled(...statuses: number[]): this {
    this.options.modeled = statuses;
    return this;
  }

  async execute<T>(): Promise<T> {
    const { path, method, headers, query, data, modeled } = this.options;

    const queryString = Object.keys(query).length > 0 ? `?${new URLSearchParams(query).toString()}` : '';
    const url = `${BASE_URL}${path}${queryString}`;

    const init: RequestInit = { method, headers: { accept: 'application/json', [CSRF_HEADER]: csrfToken(), ...headers }, credentials: 'same-origin' };
    if (data) {
      init.headers = { ...init.headers, 'content-type': 'application/json' };
      init.body = JSON.stringify(data);
    }

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch {
      throw new ApiError(-1, { code: 'NETWORK_ERROR', type: 'NetworkError', message: 'Unable to reach the server' });
    }

    const payload = response.status === 204 ? undefined : await this.parse(response);

    if (response.ok || modeled.includes(response.status)) return payload as T;

    const envelope = (payload ?? {}) as Partial<ErrorResponseDto>;
    const retryAfter = response.headers.get('retry-after');
    throw new ApiError(
      response.status,
      {
        code: envelope.code ?? 'UNKNOWN_ERROR',
        type: envelope.type ?? 'UnknownError',
        message: envelope.message ?? `Request failed with status ${response.status}`,
        fields: envelope.fields,
      },
      retryAfter ? parseInt(retryAfter, 10) : undefined,
    );
  }

  // Some action endpoints answer 200 with an empty or non-JSON body — treat that as a void result.
  private async parse(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
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
}
