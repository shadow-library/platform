/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Router } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { FASTIFY_CONFIG, FASTIFY_INSTANCE } from '@lib/constants';
import { ContextService, FastifyModule, FastifyRouter, HttpController } from '@shadow-library/fastify';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('FastifyModule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('forRoot', () => {
    it('should create the application with controllers', async () => {
      @HttpController()
      class Controller {}

      const Module = FastifyModule.forRoot({ controllers: [Controller] });

      expect(Module).toStrictEqual({
        module: FastifyModule,
        controllers: [Controller],
        providers: expect.arrayContaining([{ token: Router, useClass: FastifyRouter }, ContextService, { token: FASTIFY_CONFIG, useFactory: expect.any(Function) }]),
        exports: [Router, ContextService, FASTIFY_INSTANCE],
      });
    });

    it('should append custom providers', async () => {
      class Provider {}

      const Module = FastifyModule.forRoot({ providers: [Provider] });

      expect(Module).toStrictEqual({
        module: FastifyModule,
        providers: expect.arrayContaining([Provider]),
        exports: [Router, ContextService, FASTIFY_INSTANCE],
      });
    });
  });

  describe('forRootAsync', () => {
    it('should create the application with controllers', async () => {
      @HttpController()
      class Controller {}

      const useFactory = () => ({}) as any;
      const Module = FastifyModule.forRootAsync({ controllers: [Controller], useFactory });

      expect(Module).toStrictEqual({
        module: FastifyModule,
        controllers: [Controller],
        providers: expect.arrayContaining([{ token: Router, useClass: FastifyRouter }, ContextService, { token: FASTIFY_CONFIG, useFactory }]),
        exports: [Router, ContextService, FASTIFY_INSTANCE],
      });
    });

    it('should append custom providers', async () => {
      class Provider {}

      const Module = FastifyModule.forRootAsync({ providers: [Provider], useFactory: () => ({}) as any });

      expect(Module).toStrictEqual({
        module: FastifyModule,
        providers: expect.arrayContaining([Provider]),
        exports: [Router, ContextService, FASTIFY_INSTANCE],
      });
    });

    it('should append custom imports', async () => {
      class Import {}

      const Module = FastifyModule.forRootAsync({ imports: [Import], useFactory: () => ({}) as any });

      expect(Module).toStrictEqual({
        module: FastifyModule,
        imports: [Import],
        providers: expect.arrayContaining([]),
        exports: [Router, ContextService, FASTIFY_INSTANCE],
      });
    });
  });
});
