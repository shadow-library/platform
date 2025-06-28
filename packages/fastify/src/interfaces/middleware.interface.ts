/**
 * Importing npm packages
 */
import { RouteMetadata } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { HttpRequest, HttpResponse } from './route-handler.interface';

/**
 * Defining types
 */

export type MiddlewareHandler = (request: HttpRequest, response: HttpResponse) => Promise<any>;

export interface MiddlewareGenerator {
  cacheKey?: (metadata: RouteMetadata) => string;
  generate(metadata: RouteMetadata): MiddlewareHandler | undefined | Promise<MiddlewareHandler | undefined>;
}

export interface HttpMiddleware {
  use(request: HttpRequest, response: HttpResponse): Promise<any>;
}
