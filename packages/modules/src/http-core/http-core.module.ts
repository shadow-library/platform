/**
 * Importing npm packages
 */
import { type FastifyCompressOptions } from '@fastify/compress';
import { fastifyCookie } from '@fastify/cookie';
import { type FastifyHelmetOptions } from '@fastify/helmet';
import { DynamicModule, Inject, Module, OnModuleInit } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { FASTIFY_INSTANCE, FastifyModule, type ServerInstance } from '@shadow-library/fastify';
import deepmerge from 'deepmerge';
import { OpenAPIV3 } from 'openapi-types';
import { PartialDeep } from 'type-fest';

/**
 * Importing user defined packages
 */
import { HTTP_CORE_CONFIGS } from './constants';
import { HealthController } from './controllers/health.controller';
import { CSRFOptions, CsrfProtectionMiddleware } from './middlewares/csrf-protection.middleware';
import { RequestInitializerMiddleware } from './middlewares/request-initializer.middleware';

/**
 * Defining types
 */

export interface HttpCoreModuleOptions {
  csrf: CSRFOptions;
  helmet: FastifyHelmetOptions;
  compress: FastifyCompressOptions;
  openapi: Partial<OpenAPIV3.Document>;
}

/**
 * Declaring the constants
 */
const DEFAULT_HTTP_CORE_CONFIGS: HttpCoreModuleOptions = {
  csrf: {
    expiresIn: { days: 1 },
    refreshLeeway: { hours: 6 },
    tokenRadix: 36,
    tokenLength: 32,
  },
  helmet: {
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
  compress: { global: true },
  openapi: {
    info: { title: Config.get('app.name'), version: '1.0.0' },
    components: {},
  },
};

@Module({})
export class HttpCoreModule implements OnModuleInit {
  constructor(
    @Inject(HTTP_CORE_CONFIGS) private readonly options: HttpCoreModuleOptions,
    @Inject(FASTIFY_INSTANCE) private readonly fastify: ServerInstance,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.fastify.register(fastifyCookie);

    if (Config.isDev()) {
      const fastifySwagger = await import('@fastify/swagger');
      const scalar = await import('@scalar/fastify-api-reference');

      await this.fastify.register(fastifySwagger, { openapi: this.options.openapi });
      await this.fastify.register(scalar.default, { routePrefix: '/dev/api-docs' });
    }

    if (Config.isProd()) {
      const helmet = await import('@fastify/helmet');
      const compress = await import('@fastify/compress');

      await this.fastify.register(helmet, this.options.helmet);
      await this.fastify.register(compress, this.options.compress);
    }
  }

  static forRoot(options: PartialDeep<HttpCoreModuleOptions> = {}): DynamicModule {
    const httpCoreOptions = deepmerge(DEFAULT_HTTP_CORE_CONFIGS, options);
    return {
      module: HttpCoreModule,
      imports: [FastifyModule],
      providers: [{ token: HTTP_CORE_CONFIGS, useValue: httpCoreOptions }],
      controllers: [HealthController, RequestInitializerMiddleware, CsrfProtectionMiddleware],
    };
  }
}
