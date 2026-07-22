/**
 * Importing npm packages
 */
import qs from 'node:querystring';
import { Dispatcher, request } from 'undici';
import deepmerge from 'deepmerge';
import { JsonObject, JsonValue } from 'type-fest';

/**
 * Importing user defined packages
 */
import { NAMESPACE } from '@lib/constants';
import { AppError, ErrorCode } from '@lib/errors';
import { Logger } from '@lib/services';
import { utils } from '@lib/utils';

/**
 * Defining types
 */

export interface APIRequestOptions extends Partial<Dispatcher.DispatchOptions> {
  baseURL?: string;
  throwErrorOnFailure?: boolean;
  /** Total time budget in milliseconds for the whole request — dispatch, response headers and body read — unlike undici's per-phase `headersTimeout`/`bodyTimeout` */
  timeout?: number;
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

export class APIRequest {
  private static readonly logger = Logger.getLogger(NAMESPACE, 'APIRequest');
  private static readonly SERVICE_SCHEME = 'svc://';
  private static readonly SERVICE_NAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;
  private static readonly SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

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

  /**
   * Resolves a `svc://<service>/<path>` URL for internal service-to-service calls; every other URL
   * is returned untouched. In Kubernetes a Service is reachable by its own name via cluster DNS, so
   * the service name is the host and the cluster decides where it resolves — a dotted host such as
   * `pulse-server.<namespace>` targets another namespace. `SERVICE_URL_<NAME>` points a service at an
   * override host or full URL for local dev or out-of-cluster targets; an override carrying its own
   * `scheme://` is used verbatim, otherwise `SERVICE_DISCOVERY_SCHEME` (default `http`) supplies the
   * scheme — the same scheme applied to the in-cluster service host.
   */
  private static resolveServiceUrl(url: string): string {
    if (!url.startsWith(APIRequest.SERVICE_SCHEME)) return url;

    const rest = url.slice(APIRequest.SERVICE_SCHEME.length);
    const separator = rest.indexOf('/');
    const service = separator === -1 ? rest : rest.slice(0, separator);
    const path = separator === -1 ? '' : rest.slice(separator);
    if (!APIRequest.SERVICE_NAME_PATTERN.test(service)) throw ErrorCode.SERVICE_UNKNOWN.create({ reason: `'${service}' is not a valid service name` });

    const scheme = process.env['SERVICE_DISCOVERY_SCHEME'] ?? 'http';
    const override = process.env[`SERVICE_URL_${service.toUpperCase().replace(/[-.]/g, '_')}`];
    if (!override) return `${scheme}://${service}${path}`;

    const base = APIRequest.SCHEME_PATTERN.test(override) ? override : `${scheme}://${override}`;
    if (!URL.canParse(base)) throw ErrorCode.SERVICE_UNKNOWN.create({ reason: `service url override for '${service}' is not a valid url` });
    return `${base.replace(/\/+$/, '')}${path}`;
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

  /** Bounds the entire request to `ms` milliseconds; on expiry the request is aborted and `ErrorCode.API_REQUEST_TIMEOUT` is thrown regardless of `suppressErrors()` */
  timeout(ms: number): this {
    if (!Number.isFinite(ms) || ms <= 0) throw AppError.internal(`API request timeout must be a positive number of milliseconds, received ${ms}`);
    this.options.timeout = ms;
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

  /** Accepts any JSON-serializable object: `JsonObject` rejects `interface` types (no index signature), which would force `as unknown as JsonObject` casts on callers. */
  body(data: object): this {
    this.options.data = data as JsonObject;
    return this;
  }

  async execute<T = any>(): Promise<APIResponse<T>> {
    const { baseURL = '', throwErrorOnFailure, data, path, timeout, ...requestOptions } = this.options;

    const query = this.options.query ? `?${qs.stringify(this.options.query)}` : '';
    const url = APIRequest.resolveServiceUrl(baseURL + path);
    const uri = url + query;
    if (data) {
      if (!requestOptions.headers) requestOptions.headers = {};
      (requestOptions.headers as Record<string, string>)['content-type'] = 'application/json';
      /** `body(data: object)` cannot prove serializability at compile time, so a top-level function/symbol must fail loudly instead of sending an empty body. */
      const body = JSON.stringify(data);
      if (body === undefined) throw AppError.internal('API request body is not JSON-serializable');
      requestOptions.body = body;
    }

    /** Log the request. Read the level per request so a runtime level change is honoured. */
    const isDebug = Logger.isDebugEnabled();
    const reqLog = `${this.options.method} ${uri}`;
    if (isDebug) APIRequest.logger.debug(reqLog, requestOptions);
    else APIRequest.logger.info(reqLog);

    /** Execute the request. One signal bounds dispatch and body read together, so the timeout is a total budget rather than undici's per-phase ones. */
    const signal = timeout === undefined ? undefined : AbortSignal.timeout(timeout);
    const startTime = process.hrtime();
    const perform = async (): Promise<{ response: Dispatcher.ResponseData; resData: unknown }> => {
      const response = await request(url, signal ? { ...requestOptions, signal } : requestOptions);
      const resData = response.headers['content-type']?.includes('application/json') ? await response.body.json() : null;
      return { response, resData };
    };
    const { response, resData } = await perform().catch((error: unknown) => {
      if (!signal?.aborted) throw error;
      APIRequest.logger.error(`${reqLog} - timed out after ${timeout}ms`);
      throw ErrorCode.API_REQUEST_TIMEOUT.create({ timeout }, error);
    });
    const endTime = process.hrtime(startTime);
    const timeTaken = (endTime[0] * 1e3 + endTime[1] * 1e-6).toFixed(3);

    /** Log the response */
    const resLog = `${this.options.method} ${uri} - ${response.statusCode} - ${timeTaken}ms`;
    if (isDebug) APIRequest.logger.debug(resLog, { statusCode: response.statusCode, data: resData, headers: response.headers });
    else APIRequest.logger.info(resLog, { contentLength: response.headers['content-length'] ?? 0, statusCode: response.statusCode });

    /** Handle errors */
    if (throwErrorOnFailure && response.statusCode >= 400) {
      APIRequest.logger.error(`Request failed with status code ${response.statusCode}`, { data: resData, headers: response.headers });
      ErrorCode.API_REQUEST_FAILED.throw({ status: response.statusCode, response: resData });
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
