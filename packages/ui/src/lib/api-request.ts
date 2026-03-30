/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { type JsonObject, type JsonValue, type VoidFn } from '@/types';

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

export class APIRequest {
  private static baseUrl = import.meta.env.VITE_API_BASE_URL || '';
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

  body(data: JsonObject): this {
    this.options.data = data;
    return this;
  }

  async execute<T>(): Promise<T> {
    const { path, method, headers, query, data } = this.options;

    let url: string = path;
    const searchParams = new URLSearchParams(query);
    if (searchParams.size) url += `?${searchParams.toString()}`;
    if (!path.startsWith('http://') && !path.startsWith('https://')) url = APIRequest.baseUrl + url;

    const init: RequestInit = { method, headers };
    if (data) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(data);
    }

    let response: Response;
    try {
      const options = { ...this.options };
      if (APIRequest.preRequestHook) await APIRequest.preRequestHook({ url, init, options });
      response = await fetch(url, init);
      if (APIRequest.postResponseHook) await APIRequest.postResponseHook({ response, options });
    } catch {
      throw new ApiError(-1, { code: 'NETWORK_ERROR', type: 'NetworkError', message: 'Unable to reach the server' });
    }

    if (!response.ok) {
      let body: ErrorResponse;
      try {
        body = await response.json();
      } catch {
        throw new ApiError(response.status, { code: 'UNKNOWN_ERROR', type: 'UnknownError', message: `Request failed with status ${response.status}` });
      }
      throw new ApiError(response.status, body);
    }

    if (response.status === 204) return undefined as T;
    return response.json();
  }

  // biome-ignore lint/suspicious/noThenProperty: This class is designed to be thenable for convenient usage in async contexts
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
