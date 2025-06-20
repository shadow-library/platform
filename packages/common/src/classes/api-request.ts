/**
 * Importing npm packages
 */
import qs from 'node:querystring';

import deepmerge from 'deepmerge';
import { JsonObject, JsonValue } from 'type-fest';
import { Dispatcher, request } from 'undici';

/**
 * Importing user defined packages
 */
import { NAMESPACE } from '@lib/constants';
import { InternalError } from '@lib/errors';
import { Logger } from '@lib/services';
import { utils } from '@lib/utils';

/**
 * Defining types
 */

export interface APIRequestOptions extends Partial<Dispatcher.DispatchOptions> {
  baseURL?: string;
  throwErrorOnFailure?: boolean;
  data?: JsonObject;
}

export interface APIResponse<T = any> {
  statusCode: number;
  headers: Record<string, string>;
  data: T | null;
}

export interface CustomAPIRequest {
  new (options?: APIRequestOptions): APIRequest;
  setOptions(options: Omit<APIRequestOptions, 'baseURL' | 'path' | 'method'>): void;
}

/**
 * Declaring the constants
 */
const isDebug = Logger.isDebugEnabled();

export class APIRequest {
  private static readonly logger = Logger.getLogger(NAMESPACE, 'APIRequest');

  private constructor(private readonly options: APIRequestOptions = {}) {
    if (typeof options.throwErrorOnFailure === 'undefined') options.throwErrorOnFailure = true;
  }

  static get(url: string): APIRequest {
    return new APIRequest({ path: url, method: 'GET' });
  }

  static post(url: string): APIRequest {
    return new this({ path: url, method: 'POST' });
  }

  static put(url: string): APIRequest {
    return new this({ path: url, method: 'PUT' });
  }

  static patch(url: string): APIRequest {
    return new this({ path: url, method: 'PATCH' });
  }

  static delete(url: string): APIRequest {
    return new this({ path: url, method: 'DELETE' });
  }

  child(): CustomAPIRequest {
    let options = utils.object.omitKeys(this.options, ['path', 'baseURL', 'method']);
    const baseURL = this.options.path;
    return class extends APIRequest {
      constructor() {
        super({ baseURL, ...options });
      }

      static setOptions(newOptions: Omit<APIRequestOptions, 'baseURL' | 'path' | 'method'>): void {
        options = deepmerge(options, newOptions);
      }
    };
  }

  suppressErrors(): this {
    this.options.throwErrorOnFailure = false;
    return this;
  }

  header(key: string, value: string): this {
    if (!this.options.headers) this.options.headers = {};
    (this.options.headers as Record<string, string>)[key] = value;
    return this;
  }

  query(key: string, value: string): this {
    if (!this.options.query) this.options.query = {};
    this.options.query[key] = value;
    return this;
  }

  field(key: string, value: JsonValue): this {
    if (!this.options.data) this.options.data = {};

    const keys = key.split('.');
    let pointer = this.options.data;
    for (let index = 0; index < keys.length - 1; index++) {
      const key = keys[index] as string;
      if (!pointer[key]) pointer[key] = {};
      pointer = pointer[key] as JsonObject;
    }
    const lastKey = keys[keys.length - 1] as string;
    pointer[lastKey] = value;

    return this;
  }

  body(data: JsonObject): this {
    this.options.data = data;
    return this;
  }

  async execute<T = any>(): Promise<APIResponse<T>> {
    const { baseURL = '', throwErrorOnFailure, data, path, ...requestOptions } = this.options;

    const query = this.options.query ? `?${qs.stringify(this.options.query)}` : '';
    const url = baseURL + path;
    const uri = url + query;
    if (data) {
      if (!requestOptions.headers) requestOptions.headers = {};
      (requestOptions.headers as Record<string, string>)['content-type'] = 'application/json';
      requestOptions.body = JSON.stringify(data);
    }

    /** Log the request */
    const reqLog = `${this.options.method} ${uri}`;
    if (isDebug) APIRequest.logger.debug(reqLog, requestOptions);
    else APIRequest.logger.info(reqLog);

    /** Execute the request */
    const startTime = process.hrtime();
    const response = await request(url, requestOptions);
    const resData = response.headers['content-type']?.includes('application/json') ? await response.body.json() : null;
    const endTime = process.hrtime(startTime);
    const timeTaken = (endTime[0] * 1e3 + endTime[1] * 1e-6).toFixed(3);

    /** Log the response */
    const resLog = `${this.options.method} ${uri} - ${response.statusCode} - ${timeTaken}ms`;
    if (isDebug) APIRequest.logger.debug(resLog, { statusCode: response.statusCode, data: resData, headers: response.headers });
    else APIRequest.logger.info(resLog, { contentLength: response.headers['content-length'] ?? 0, statusCode: response.statusCode });

    /** Handle errors */
    if (throwErrorOnFailure && response.statusCode >= 400) {
      APIRequest.logger.error(`Request failed with status code ${response.statusCode}`, { data: resData, headers: response.headers });
      throw new APIError(response.statusCode, resData);
    }

    return {
      data: resData as T | null,
      statusCode: response.statusCode,
      headers: response.headers as Record<string, string>,
    };
  }

  then<T>(resolve: (value: APIResponse<T>) => void, reject?: (reason?: Error) => any): Promise<APIResponse<T>> {
    return this.execute().then(resolve, reject);
  }

  catch<T>(reject: (reason?: Error) => any): Promise<APIResponse<T>> {
    return this.execute().catch(reject);
  }

  finally(callback: () => void): Promise<APIResponse<any>> {
    return this.execute().finally(callback);
  }
}

export class APIError extends InternalError {
  constructor(
    public readonly statusCode: number,
    public readonly data?: unknown,
  ) {
    super(`API request failed with status code ${statusCode}`);
  }
}
