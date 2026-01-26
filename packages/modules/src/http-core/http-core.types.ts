/**
 * Importing npm packages
 */
import { FastifyCompressOptions } from '@fastify/compress';
import { FastifyHelmetOptions } from '@fastify/helmet';
import { OpenAPIV3 } from 'openapi-types';

/**
 * Importing user defined packages
 */
import { CSRFOptions } from './services';

/**
 * Defining types
 */

declare module 'fastify' {
  interface FastifyRequest {
    /** Correlation ID */
    cid: string;
  }
}

declare module '@shadow-library/common' {
  export interface ConfigRecords {
    'http-core.csrf.enabled': boolean;
    'http-core.helmet.enabled'?: boolean;
    'http-core.compress.enabled'?: boolean;
    'http-core.openapi.enabled'?: boolean;
  }
}

export interface CommonOptions {
  enabled?: boolean;
}

export interface OpenAPIOptions extends Partial<OpenAPIV3.Document>, CommonOptions {
  routePrefix?: `/${string}`;
  normalizeSchemaIds?: boolean;
}

export interface HttpCoreModuleOptions {
  csrf: CSRFOptions;
  helmet: FastifyHelmetOptions & CommonOptions;
  compress: FastifyCompressOptions & CommonOptions;
  openapi: OpenAPIOptions;
}
