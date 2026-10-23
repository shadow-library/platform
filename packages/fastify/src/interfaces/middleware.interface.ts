import { HandlerMetadata } from '@shadow-library/app';

import { HttpCallback, HttpRequest, HttpResponse, RouteHandler } from './route-handler.interface';

export interface MiddlewareGenerator {
  cacheKey?: (metadata: HandlerMetadata) => string;
  generate(metadata: HandlerMetadata): RouteHandler | undefined | Promise<RouteHandler | undefined>;
}

export interface AsyncHttpMiddleware {
  use(request: HttpRequest, response: HttpResponse): Promise<unknown>;
}

export interface CallbackHttpMiddleware {
  use(request: HttpRequest, response: HttpResponse, done: HttpCallback): void;
}
