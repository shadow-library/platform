/**
 * Importing npm packages
 */
import assert from 'node:assert';

import { fastifyCookie } from '@fastify/cookie';
import { FastifyDynamicSwaggerOptions } from '@fastify/swagger';
import { DynamicModule, Inject, Module, OnModuleInit } from '@shadow-library/app';
import { JSONSchema } from '@shadow-library/class-schema';
import { Config, LogData, Logger, utils } from '@shadow-library/common';
import { ContextService, FASTIFY_INSTANCE, FastifyModule, type ServerInstance } from '@shadow-library/fastify';
import { OpenAPIV3 } from 'openapi-types';
import { PartialDeep } from 'type-fest';

/**
 * Importing user defined packages
 */
import { HealthController } from './controllers/health.controller';
import { HTTP_CORE_CONFIGS } from './http-core.constants';
import { type HttpCoreModuleOptions } from './http-core.types';
import { CsrfProtectionMiddleware, RequestInitializerMiddleware } from './middlewares';
import { CSRFTokenService } from './services';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const DEFAULT_HTTP_CORE_CONFIGS = {
  csrf: {
    cookieName: 'csrf-token',
    headerName: 'x-csrf-token',
    expiresIn: { days: 1 },
    refreshLeeway: { hours: 6 },
    tokenRadix: 36,
    tokenLength: 32,
  },
  helmet: {
    enabled: Config.isProd(),
    global: true,
    hidePoweredBy: true,
    xContentTypeOptions: true,
    dnsPrefetchControl: { allow: false },
    frameguard: { action: 'sameorigin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: { maxAge: 60 * 60 * 24 * 365, includeSubDomains: true, preload: false },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ['self'],
        baseUri: ['self'],
        scriptSrc: ['self'],
        styleSrc: ['self'],
        objectSrc: ['none'],
        formAction: ['self'],
        upgradeInsecureRequests: [],
        manifestSrc: ['self'],
      },
    },
  },
  compress: {
    enabled: Config.isProd(),
    global: true,
  },
  openapi: {
    enabled: Config.isDev(),
    routePrefix: '/dev/api-docs',
    info: { title: Config.get('app.name'), version: '1.0.0' },
    components: { schemas: {} },
  },
} satisfies HttpCoreModuleOptions;

@Module()
export class HttpCoreModule implements OnModuleInit {
  private schemaCounter = 0;
  private schemaIdMap = new Map<string, string>();

  constructor(
    @Inject(HTTP_CORE_CONFIGS) private readonly options: HttpCoreModuleOptions,
    @Inject(FASTIFY_INSTANCE) private readonly fastify: ServerInstance,
    private readonly contextService: ContextService,
  ) {
    Config.load('http-core.csrf.enabled', { defaultValue: 'true' });
  }

  private resolveSchemaId(id: string): string {
    if (!this.options.openapi.normalizeSchemaIds) return id;
    if (!id.startsWith('class-schema:')) return id;

    const existing = this.schemaIdMap.get(id);
    if (existing) return existing;

    const existingValues = Array.from(this.schemaIdMap.values());
    let normalized = id.replace('class-schema:', '').split(/[:-]/g)[0] as string;
    for (let index = 1; index <= 100; index++) {
      const candidate = normalized + index;
      if (!existingValues.includes(candidate)) {
        normalized = candidate;
        break;
      }
      if (index === 100) throw new Error(`Unable to normalize schema ID for ${id} after 100 attempts`);
    }

    this.schemaIdMap.set(id, normalized);
    return normalized;
  }

  private normalizeOpenapiSpec(document: Partial<OpenAPIV3.Document>, schema: JSONSchema): JSONSchema {
    document.components ??= {};
    document.components.schemas ??= {};
    assert(schema.$id, 'Schema must have an $id');

    const schemaId = this.resolveSchemaId(schema.$id);
    if (document.components.schemas[schemaId]) return { $ref: `#/components/schemas/${schemaId}` };

    const definitions = [schema, ...Object.values(schema.definitions ?? {})];
    for (const definition of definitions) {
      if (definition.required?.length === 0) delete definition.required;
      if (definition.$id) {
        const resolvedId = this.resolveSchemaId(definition.$id);
        document.components.schemas[resolvedId] = utils.object.omitKeys(definition, ['definitions', '$id']);
      }

      const properties = [...Object.values(definition.properties ?? {}), ...Object.values(definition.patternProperties ?? {})];
      for (const property of properties) {
        if (property.$ref && !property.$ref.startsWith('#/components/schemas/')) {
          const resolvedRefId = this.resolveSchemaId(property.$ref);
          property.$ref = `#/components/schemas/${resolvedRefId}`;
        }

        if (property.items?.$ref && !property.items.$ref.startsWith('#/components/schemas/')) {
          const resolvedRefId = this.resolveSchemaId(property.items.$ref);
          property.items.$ref = `#/components/schemas/${resolvedRefId}`;
        }
      }
    }

    return { $ref: `#/components/schemas/${schemaId}` };
  }

  private getFastifySwaggerOptions(): FastifyDynamicSwaggerOptions {
    return {
      openapi: utils.object.omitKeys(this.options.openapi, ['enabled', 'routePrefix', 'normalizeSchemaIds']),
      refResolver: { buildLocalReference: (json, _1, _2, index) => (typeof json.$id === 'string' ? json.$id : `Fragment-${index}`) },
      transform: opts => {
        const schema = opts.schema as JSONSchema;
        const document = (opts as any).openapiObject;
        if (!schema.$id) schema.$id = `AutoGeneratedSchema${++this.schemaCounter}`;
        const swaggerSchema = structuredClone(schema);
        const responses = (swaggerSchema.response ?? {}) as Record<string, JSONSchema>;
        if (swaggerSchema.body) swaggerSchema.body = this.normalizeOpenapiSpec(document, swaggerSchema.body);
        for (const statusCode in responses) responses[statusCode] = this.normalizeOpenapiSpec(document, responses[statusCode] as JSONSchema);
        return { schema: swaggerSchema, url: opts.url };
      },
    };
  }

  async onModuleInit(): Promise<void> {
    await this.fastify.register(fastifyCookie);

    Logger.addContextProvider('http', () => {
      if (!this.contextService.isInitialized()) return;

      const request = this.contextService.getRequest();
      const context: LogData = {};
      context.rid = request.id;
      context.cid = request.cid;
      return context;
    });

    if (this.options.openapi.enabled) {
      const fastifySwagger = await import('@fastify/swagger');
      const scalar = await import('@scalar/fastify-api-reference');
      const routePrefix = this.options.openapi.routePrefix ?? DEFAULT_HTTP_CORE_CONFIGS.openapi.routePrefix;

      await this.fastify.register(fastifySwagger, this.getFastifySwaggerOptions());
      await this.fastify.register(scalar.default, { routePrefix });
    }

    if (this.options.helmet.enabled) {
      const helmet = await import('@fastify/helmet');
      await this.fastify.register(helmet, this.options.helmet);
    }

    if (this.options.compress.enabled) {
      const compress = await import('@fastify/compress');
      await this.fastify.register(compress, this.options.compress);
    }
  }

  static forRoot(options: PartialDeep<HttpCoreModuleOptions> = {}): DynamicModule {
    const httpCoreOptions: Record<string, any> = { ...DEFAULT_HTTP_CORE_CONFIGS };
    for (const key in options) httpCoreOptions[key] = { ...httpCoreOptions[key], ...(options as Record<string, any>)[key] };

    return {
      module: HttpCoreModule,
      imports: [FastifyModule],
      providers: [CSRFTokenService, { token: HTTP_CORE_CONFIGS, useValue: httpCoreOptions }],
      controllers: [HealthController, RequestInitializerMiddleware, CsrfProtectionMiddleware],
      exports: [CSRFTokenService],
    };
  }
}
