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
type ErrorResponseDto = components['schemas']['ErrorResponseDto'];

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
    super(body.message);
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

  query(key: string, value: string): this;
  query(params: Record<string, string | undefined>): this;
  query(keyOrParams: string | Record<string, string | undefined>, value?: string): this {
    if (typeof keyOrParams === 'string') this.options.query[keyOrParams] = value as string;
    else {
      for (const [k, v] of Object.entries(keyOrParams)) {
        if (v !== undefined) this.options.query[k] = v;
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

  body(data: JsonObject): this {
    this.options.data = data;
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

    return response.json();
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
