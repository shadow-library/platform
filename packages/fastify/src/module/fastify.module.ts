/**
 * Importing npm packages
 */
import { Module, Provider, Router } from '@shadow-library/app';
import { ClassSchema } from '@shadow-library/class-schema';
import { utils } from '@shadow-library/common';
import { Class } from 'type-fest';
import { v4 as uuid } from 'uuid';

/**
 * Importing user defined packages
 */
import { DefaultErrorHandler } from '../classes';
import { FASTIFY_CONFIG, FASTIFY_INSTANCE } from '../constants';
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

/* eslint-disable-next-line @typescript-eslint/no-extraneous-class */
export class FastifyModule {
  private static getDefaultConfig(): FastifyConfig {
    const errorResponseSchema = ClassSchema.generate(ErrorResponseDto);

    return {
      host: 'localhost',
      port: 8080,
      responseSchema: { '4xx': errorResponseSchema, '5xx': errorResponseSchema },
      errorHandler: new DefaultErrorHandler(),

      ignoreTrailingSlash: true,
      requestIdLogLabel: 'rid',
      genReqId: () => uuid(),
      ajv: { customOptions: { removeAdditional: true, useDefaults: true, allErrors: true } },
    };
  }

  static forRoot(options: FastifyModuleOptions): Class<FastifyModule> {
    const config = Object.assign({}, this.getDefaultConfig(), utils.object.omitKeys(options, ['imports', 'fastifyFactory']));
    return this.forRootAsync({ imports: options.imports, useFactory: () => config, fastifyFactory: options.fastifyFactory });
  }

  static forRootAsync(options: FastifyModuleAsyncOptions): Class<FastifyModule> {
    const imports = options.imports ?? [];
    const providers: Provider[] = [{ token: Router, useClass: FastifyRouter }];
    providers.push({ token: FASTIFY_CONFIG, useFactory: options.useFactory, inject: options.inject });
    const fastifyFactory = (config: FastifyConfig) => createFastifyInstance(config, options.fastifyFactory);
    providers.push({ token: FASTIFY_INSTANCE, useFactory: fastifyFactory, inject: [FASTIFY_CONFIG] });

    Module({ imports, providers, exports: [Router] })(FastifyModule);
    return FastifyModule;
  }
}
