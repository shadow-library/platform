/**
 * Importing npm packages
 */
import { Route } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { ApiOperation } from './api-operation.decorator';

/**
 * Defining types
 */

export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
  PATCH = 'PATCH',
  OPTIONS = 'OPTIONS',
  HEAD = 'HEAD',
  ALL = 'ALL',
}

export interface RouteOptions {
  method: HttpMethod;
  path?: string;
}

/**
 * Declaring the constants
 */

export function HttpRoute(options: RouteOptions): MethodDecorator {
  if (options.path && options.path.charAt(0) !== '/') options.path = `/${options.path}`;

  return (target, propertyKey, descriptor) => {
    const methodName = propertyKey.toString();
    const summary = methodName.charAt(0).toUpperCase() + methodName.slice(1).replace(/([a-z])([A-Z])|([A-Z]+)([A-Z][a-z])/g, '$1$3 $2$4');
    Route(options)(target, propertyKey, descriptor);
    ApiOperation({ summary })(target, propertyKey, descriptor);
  };
}

export const Get = (path?: string): MethodDecorator => HttpRoute({ method: HttpMethod.GET, path });

export const Post = (path?: string): MethodDecorator => HttpRoute({ method: HttpMethod.POST, path });

export const Put = (path?: string): MethodDecorator => HttpRoute({ method: HttpMethod.PUT, path });

export const Delete = (path?: string): MethodDecorator => HttpRoute({ method: HttpMethod.DELETE, path });

export const Patch = (path?: string): MethodDecorator => HttpRoute({ method: HttpMethod.PATCH, path });

export const Options = (path?: string): MethodDecorator => HttpRoute({ method: HttpMethod.OPTIONS, path });

export const Head = (path?: string): MethodDecorator => HttpRoute({ method: HttpMethod.HEAD, path });

export const All = (path?: string): MethodDecorator => HttpRoute({ method: HttpMethod.ALL, path });
