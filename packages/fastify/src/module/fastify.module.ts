/**
 * Importing npm packages
 */
import { DynamicModule, InjectionToken, Module, Provider, Router } from '@shadow-library/app';
import { ClassSchema } from '@shadow-library/class-schema';
import { Config, utils } from '@shadow-library/common';
import { v4 as uuid } from 'uuid';

/**
 * Importing user defined packages
 */
import { DefaultErrorHandler } from '../classes';
import { FASTIFY_CONFIG, FASTIFY_INSTANCE } from '../constants';
import { ContextService } from '../services';
import { ErrorResponseDto } from './error-response.dto';
import { FastifyConfig, FastifyModuleAsyncOptions, FastifyModuleOptions } from './fastify-module.interface';
import { FastifyRouter } from './fastify-router';
import { createFastifyInstance } from './fastify.utils';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({})
export class FastifyModule {
  private static getDefaultConfig(): FastifyConfig {
    const errorResponseSchema = ClassSchema.generate(ErrorResponseDto);

    return {
      host: 'localhost',
      port: 8080,
      responseSchema: { '4xx': errorResponseSchema, '5xx': errorResponseSchema },
      errorHandler: new DefaultErrorHandler(),
      maskSensitiveData: Config.isProd(),

      requestIdLogLabel: 'rid',
      genReqId: () => uuid(),
      routerOptions: {
        ignoreTrailingSlash: true,
        ignoreDuplicateSlashes: true,
      },
    };
  }

  static forRoot(options: FastifyModuleOptions): DynamicModule {
    const config = Object.assign({}, this.getDefaultConfig(), utils.object.omitKeys(options, ['imports', 'controllers', 'providers', 'exports', 'fastifyFactory']));
    return this.forRootAsync({
      imports: options.imports,
      controllers: options.controllers,
      providers: options.providers,
      exports: options.exports,
      useFactory: () => config,
      fastifyFactory: options.fastifyFactory,
    });
  }

  static forRootAsync(options: FastifyModuleAsyncOptions): DynamicModule {
    const fastifyFactory = (config: FastifyConfig) => createFastifyInstance(config, options.fastifyFactory);

    const providers: Provider[] = [{ token: Router, useClass: FastifyRouter }, ContextService];
    providers.push({ token: FASTIFY_CONFIG, useFactory: options.useFactory, inject: options.inject });
    providers.push({ token: FASTIFY_INSTANCE, useFactory: fastifyFactory, inject: [FASTIFY_CONFIG] });
    if (options.providers) providers.push(...options.providers);

    const exports: InjectionToken[] = [Router, ContextService, FASTIFY_INSTANCE];
    if (options.exports) exports.push(...options.exports);

    const Module: DynamicModule = { module: FastifyModule, providers, exports };
    if (options.imports) Module.imports = options.imports;
    if (options.controllers) Module.controllers = options.controllers;

    return Module;
  }
}
