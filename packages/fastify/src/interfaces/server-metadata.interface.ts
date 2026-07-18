/**
 * Importing npm packages
 */
import { FastifyInstance, RouteShorthandOptions } from 'fastify';
import { HandlerMetadata } from '@shadow-library/app';
import { JSONSchema, SchemaClass } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */
import { HTTP_CONTROLLER_TYPE } from '../constants';
import { ApiOperationMetadata, HttpMethod, RouteInputSchemas } from '../decorators';

/**
 * Defining types
 */

declare module '@shadow-library/app' {
  export interface HandlerMetadata extends Omit<RouteShorthandOptions, 'config'> {
    method?: HttpMethod;
    path?: string;
    version?: number;
    schemas?: RouteInputSchemas & { response?: Record<number | string, JSONSchema | SchemaClass> };
    operation?: ApiOperationMetadata;

    rawBody?: boolean;
    cookies?: boolean;
    silentValidation?: boolean;

    status?: number;
    headers?: Record<string, string | (() => string)>;
    redirect?: string;
    render?: string | true;
  }

  export interface ControllerMetadata {
    [HTTP_CONTROLLER_TYPE]?: 'router' | 'middleware';
    path?: string;
  }
}

export type ServerMetadata = HandlerMetadata;

export type ServerInstance = FastifyInstance;
