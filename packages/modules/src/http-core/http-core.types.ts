import { FastifyCompressOptions } from '@fastify/compress';
import { FastifyHelmetOptions } from '@fastify/helmet';
import { OpenAPIV3 } from 'openapi-types';

import { type CSRFOptions } from './services/csrf-token.types';

declare module '@shadow-library/common' {
  export interface ConfigRecords {
    'app.version': string;

    'http-core.csrf.enabled': boolean;
    'http-core.helmet.enabled'?: boolean;
    'http-core.compress.enabled'?: boolean;
    'http-core.openapi.enabled'?: boolean;

    'health.host': string;
    'health.port': number;
    'health.enabled': boolean;
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Correlation ID */
    cid: string;
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
