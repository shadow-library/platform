/**
 * Importing npm packages
 */
import { RouteMetadata } from '@shadow-library/app';
import { JSONSchema, SchemaClass } from '@shadow-library/class-schema';
import { FastifyInstance, RouteShorthandOptions } from 'fastify';

/**
 * Importing user defined packages
 */
import { HTTP_CONTROLLER_TYPE } from '../constants';
import { HttpMethod, RouteInputSchemas } from '../decorators';

/**
 * Defining types
 */

declare module '@shadow-library/app' {
  export interface RouteMetadata extends Omit<RouteShorthandOptions, 'config'> {
    method?: HttpMethod;
    path?: string;
    version?: number;
    schemas?: RouteInputSchemas & { response?: Record<number | string, JSONSchema | SchemaClass> };

    rawBody?: boolean;
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

export type ServerMetadata = RouteMetadata;

export type ServerInstance = FastifyInstance;
