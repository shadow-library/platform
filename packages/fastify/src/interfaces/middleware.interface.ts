/**
 * Importing npm packages
 */
import { RouteMetadata } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { HttpCallback, HttpRequest, HttpResponse, RouteHandler } from './route-handler.interface';

/**
 * Defining types
 */

export interface MiddlewareGenerator {
  cacheKey?: (metadata: RouteMetadata) => string;
  generate(metadata: RouteMetadata): RouteHandler | undefined | Promise<RouteHandler | undefined>;
}

export interface AsyncHttpMiddleware {
  use(request: HttpRequest, response: HttpResponse): Promise<unknown>;
}

export interface CallbackHttpMiddleware {
  use(request: HttpRequest, response: HttpResponse, done: HttpCallback): void;
}
