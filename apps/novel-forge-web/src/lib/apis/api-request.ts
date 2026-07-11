/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { type JsonObject, type JsonValue } from '@/types';

import { type components } from './api-types.gen';

/**
 * Defining types
 */

/**
 * The stable error contract returned by the API. The backend's dev docs expose
 * this as `DevErrorResponseDto` (which additionally carries a dev-only `stack`);
 * the client speaks the production shape.
 */
export interface ErrorResponseDto {
  code: string;
  type: string;
  message: string;
  fields?: components['schemas']['ErrorFieldDto'][] | null;
}

export type QueryValue = string | number | boolean;

/** Options for query hooks that poll — e.g. following a job or workflow run to completion. */
export interface PollingOptions {
  refetchInterval?: number;
}

interface APIRequestOptions {
  path: string;
  method: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  data?: JsonObject;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly type: string;
  readonly fields: ErrorResponseDto['fields'];

  constructor(status: number, body: ErrorResponseDto) {
    // Validation errors carry the actual field problems ("body.content: must NOT have more than…");
    // fold them into the message so toasts explain the rejection instead of the generic sentence.
    const fieldDetail = body.fields?.length ? ` — ${body.fields.map(f => `${f.field}: ${f.msg}`).join('; ')}` : '';
    super(`${body.message}${fieldDetail}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.type = body.type;
    this.fields = body.fields;
  }
}

/**
 * Declaring the constants
 */
const BASE_URL = '/api/v1';

export class APIRequest {
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

  header(key: string, value: string): this {
    this.options.headers[key] = value;
    return this;
  }

  query(key: string, value: QueryValue): this;
  query(params: Record<string, QueryValue | undefined>): this;
  query(keyOrParams: string | Record<string, QueryValue | undefined>, value?: QueryValue): this {
    if (typeof keyOrParams === 'string') this.options.query[keyOrParams] = String(value);
    else {
      for (const [k, v] of Object.entries(keyOrParams)) {
        if (v !== undefined) this.options.query[k] = String(v);
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

  // Accepts any request DTO. Generated bodies may carry open-object fields (typed `{ [k]: unknown }`
  // for freeform blobs like frontmatter or workflow state), which aren't assignable to `JsonValue`;
  // they're still JSON-serialisable, so the object is stored as-is for `JSON.stringify`.
  body(data: object): this {
    this.options.data = data as JsonObject;
    return this;
  }

  async execute<T>(): Promise<T> {
    const { path, method, headers, query, data } = this.options;

    const queryString = Object.keys(query).length > 0 ? `?${new URLSearchParams(query).toString()}` : '';
    const url = `${BASE_URL}${path}${queryString}`;

    const init: RequestInit = { method, headers };
    if (data) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(data);
    }

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch {
      throw new ApiError(-1, { code: 'NETWORK_ERROR', type: 'NetworkError', message: 'Unable to reach the server' });
    }

    if (!response.ok) {
      let body: ErrorResponseDto;
      try {
        body = await response.json();
      } catch {
        throw new ApiError(response.status, { code: 'UNKNOWN_ERROR', type: 'UnknownError', message: `Request failed with status ${response.status}` });
      }
      throw new ApiError(response.status, body);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    // Some action endpoints (e.g. generate) return an OK with an empty or
    // non-JSON body — treat that as a successful void result rather than error.
    const text = await response.text();
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return undefined as T;
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

  finally(callback: () => void): Promise<unknown> {
    return this.execute().finally(callback);
  }
}
