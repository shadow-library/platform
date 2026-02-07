/**
 * Importing npm packages
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Module, Router, ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Field, Schema } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */
import { FASTIFY_CONFIG, FASTIFY_INSTANCE } from '@lib/constants';
import { Body, ContextService, FastifyModule, FastifyRouter, HttpController, Post, RespondFor } from '@shadow-library/fastify';

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
        providers: expect.arrayContaining([{ token: Router, useClass: FastifyRouter }, ContextService, { token: FASTIFY_CONFIG, useFactory: expect.any(Function) }]),
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

    it('should append custom exports', async () => {
      class Export {}

      const Module = FastifyModule.forRootAsync({ exports: [Export], useFactory: () => ({}) as any });

      expect(Module).toStrictEqual({
        module: FastifyModule,
        providers: expect.arrayContaining([]),
        exports: [Router, ContextService, FASTIFY_INSTANCE, Export],
      });
    });
  });

  describe('integration', () => {
    @Schema()
    class TestBody {
      @Field(() => String, { minLength: 1, maxLength: 10 })
      name: string;
    }

    @Schema()
    class TestResponse {
      @Field(() => String)
      message: string;
    }

    @HttpController('/test')
    class TestController {
      @Post()
      @RespondFor(200, TestResponse)
      create(@Body() body: TestBody): TestResponse {
        return { message: `Hello, ${body.name}!` };
      }
    }

    @Module({
      imports: [FastifyModule.forRoot({ controllers: [TestController] })],
    })
    class TestModule {}

    let app: ShadowApplication;
    let router: FastifyRouter;

    beforeAll(async () => {
      app = await ShadowFactory.create(TestModule).then(app => app.start());
      router = app.get(Router);
    });

    afterAll(() => app.stop());

    it('should validate and process request body correctly', async () => {
      const response = await router.mockRequest().post('/test').body({ name: 'World' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({ message: 'Hello, World!' });
    });

    it('should return validation error for invalid body', async () => {
      const response = await router.mockRequest().post('/test').body({ name: '' });
      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({
        code: 'S003',
        type: 'VALIDATION_ERROR',
        fields: [{ field: 'body.name', msg: expect.stringContaining('must NOT have fewer than 1 character') }],
      });
    });
  });
});
