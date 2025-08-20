/**
 * Importing npm packages
 */
import { RouteMetadata } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { RouteHandler } from './route-handler.interface';

/**
 * Defining types
 */

export interface MiddlewareGenerator {
  cacheKey?: (metadata: RouteMetadata) => string;
  generate(metadata: RouteMetadata): RouteHandler | undefined | Promise<RouteHandler | undefined>;
}

export interface HttpMiddleware {
  use: RouteHandler;
}
