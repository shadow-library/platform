import { FastifyInstance, FastifyServerOptions } from 'fastify';
import { Promisable } from 'type-fest';
import { FactoryProvider, ModuleMetadata } from '@shadow-library/app';
import { JSONSchema } from '@shadow-library/class-schema';

import { CustomTransformers } from '../decorators';
import { ErrorHandler } from '../interfaces';
import { ContextService } from '../services';

export interface FastifyConfig extends FastifyServerOptions {
  /** Defaults to the `app.host` config value (`localhost`). */
  host?: string;

  /** Defaults to the `app.port` config value (`8080`). */
  port?: number;

  /** Defaults to `DefaultErrorHandler`. */
  errorHandler?: ErrorHandler;

  /** Response schemas keyed by status code or class (`'4xx'`); defaults to the error response schema for `4xx` and `5xx`. */
  responseSchema?: Record<string | number, JSONSchema>;

  /** Enables `resolveChildRoute`, which runs a GET against this server in-process (e.g. SSR data loading) without an HTTP round trip. */
  enableChildRoutes?: boolean;

  /** Headers added to every `resolveChildRoute` request, e.g. forwarded credentials. */
  childRouteHeaders?: (contextService: ContextService) => Record<string, string>;

  /** Masks fields marked as sensitive in API inputs (body, query, and URL params) when written to logs. `FastifyModule` defaults it to on in production only. */
  maskSensitiveData?: boolean;

  /** Prefixes every route with `/v{version}`. */
  prefixVersioning?: boolean;

  routePrefix?: string;

  transformers?: Record<keyof CustomTransformers, (value: any) => any>;

  /** Options for the optional `@fastify/cookie` plugin, registered lazily when a route uses `@Cookie()` (e.g. `secret` for signed cookies). */
  cookie?: Record<string, unknown>;
}

export interface FastifyModuleOptions extends Partial<FastifyConfig> {
  imports?: ModuleMetadata['imports'];

  fastifyFactory?: (instance: FastifyInstance) => Promisable<FastifyInstance>;

  controllers?: ModuleMetadata['controllers'];

  providers?: ModuleMetadata['providers'];

  exports?: ModuleMetadata['exports'];
}

export interface FastifyModuleAsyncOptions extends Pick<FastifyModuleOptions, 'imports' | 'controllers' | 'providers' | 'exports' | 'fastifyFactory'> {
  useFactory: (...args: any[]) => Promisable<FastifyConfig>;

  inject?: FactoryProvider['inject'];
}
