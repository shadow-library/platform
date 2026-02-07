/**
 * Importing npm packages
 */
import { FactoryProvider, ModuleMetadata } from '@shadow-library/app';
import { JSONSchema } from '@shadow-library/class-schema';
import { FastifyInstance, FastifyServerOptions } from 'fastify';
import { Promisable } from 'type-fest';

/**
 * Importing user defined packages
 */
import { CustomTransformers } from '../decorators';
import { ErrorHandler } from '../interfaces';
import { ContextService } from '../services';

/**
 * Defining types
 */

declare module '@shadow-library/common' {
  export interface ConfigRecords {
    'app.port': number;
    'app.host': string;
  }
}

export interface FastifyConfig extends FastifyServerOptions {
  /**
   * The host on which the Fastify instance is to be started
   * @default localhost
   */
  host?: string;

  /**
   * The port on which the Fastify instance is to be started
   * @default 8080
   */
  port?: number;

  /**
   * The error handler to be used to handle errors thrown by the Fastify instance
   * @default DefaultErrorHandler
   */
  errorHandler?: ErrorHandler;

  /**
   * The schema to be used to validate the response of the Fastify instance
   * @default { '4xx': errorResponseSchema, '5xx': errorResponseSchema }
   */
  responseSchema?: Record<string | number, JSONSchema>;

  /**
   * Enables internal execution of child routes (e.g., for SSR data fetching) without making actual HTTP requests.
   * Useful for loading data while reusing middleware logic and shared context.
   * @default false
   */
  enableChildRoutes?: boolean;

  /**
   * Function to provide custom headers for internal child route requests.
   * Useful for passing authentication tokens or other necessary headers.
   */
  childRouteHeaders?: (contextService: ContextService) => Record<string, string>;

  /**
   * Masks fields marked as sensitive in API inputs (body, query, and URL params) when written to logs.
   * @default true
   */
  maskSensitiveData?: boolean;

  /**
   * Enables prefix-based versioning for all routes in the Fastify instance.
   * @default false
   */
  prefixVersioning?: boolean;

  /**
   * The global route prefix for all routes in the Fastify instance
   */
  routePrefix?: string;

  /**
   * Object defining custom transformers for request and response data transformation
   */
  transformers?: Record<keyof CustomTransformers, (value: any) => any>;
}

export interface FastifyModuleOptions extends Partial<FastifyConfig> {
  /**
   * The list of modules whose controllers are to be registered in the Fastify instance
   */
  imports?: ModuleMetadata['imports'];

  /**
   * Factory function to modify the Fastify instance before it is used to register the controllers
   */
  fastifyFactory?: (instance: FastifyInstance) => Promisable<FastifyInstance>;

  /**
   * The list of controllers to be registered in the Fastify instance
   */
  controllers?: ModuleMetadata['controllers'];

  /**
   * The list of providers to be registered in the Fastify instance
   */
  providers?: ModuleMetadata['providers'];

  /**
   * The list of providers to be exported by the Fastify module
   */
  exports?: ModuleMetadata['exports'];
}

export interface FastifyModuleAsyncOptions extends Pick<FastifyModuleOptions, 'imports' | 'controllers' | 'providers' | 'exports' | 'fastifyFactory'> {
  /**
   * Factory function to create the FastifyModuleOptions
   */
  useFactory: (...args: any[]) => Promisable<FastifyConfig>;

  /**
   * The list of providers to be injected into the factory function
   */
  inject?: FactoryProvider['inject'];
}
