/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Module, Router } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { FASTIFY_CONFIG } from '@lib/constants';
import { ContextService, FastifyModule, FastifyRouter, HttpController } from '@shadow-library/fastify';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const target = jest.fn();

jest.mock('@shadow-library/app', () => {
  const originalModule: object = jest.requireActual('@shadow-library/app');
  return { ...originalModule, Module: jest.fn().mockImplementation(() => target) };
});

describe('FastifyModule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('forRoot', () => {
    it('should create the application with controllers', async () => {
      @HttpController()
      class Controller {}

      FastifyModule.forRoot({ controllers: [Controller] });

      expect(target).toHaveBeenCalledWith(expect.any(Function));
      expect((target.mock.calls[0]?.[0] as any)?.prototype).toBeInstanceOf(FastifyModule);
      expect(Module).toHaveBeenCalledWith({
        imports: [],
        controllers: [Controller],
        providers: expect.arrayContaining([{ token: Router, useClass: FastifyRouter }, ContextService, { token: FASTIFY_CONFIG, useFactory: expect.any(Function) }]),
        exports: [Router, ContextService],
      });
    });

    it('should append custom providers', async () => {
      class Provider {}

      FastifyModule.forRoot({ providers: [Provider] });

      expect(Module).toHaveBeenCalledWith({
        imports: [],
        controllers: [],
        providers: expect.arrayContaining([Provider]),
        exports: [Router, ContextService],
      });
    });
  });

  describe('forRootAsync', () => {
    it('should create the application with controllers', async () => {
      @HttpController()
      class Controller {}

      const useFactory = () => ({}) as any;
      FastifyModule.forRootAsync({ controllers: [Controller], useFactory });

      expect(target).toHaveBeenCalledWith(expect.any(Function));
      expect((target.mock.calls[0]?.[0] as any)?.prototype).toBeInstanceOf(FastifyModule);
      expect(Module).toHaveBeenCalledWith({
        imports: [],
        controllers: [Controller],
        providers: expect.arrayContaining([{ token: Router, useClass: FastifyRouter }, ContextService, { token: FASTIFY_CONFIG, useFactory }]),
        exports: [Router, ContextService],
      });
    });

    it('should append custom providers', async () => {
      class Provider {}

      FastifyModule.forRootAsync({ providers: [Provider], useFactory: () => ({}) as any });

      expect(Module).toHaveBeenCalledWith({
        imports: [],
        controllers: [],
        providers: expect.arrayContaining([Provider]),
        exports: [Router, ContextService],
      });
    });

    it('should append custom imports', async () => {
      class Import {}

      FastifyModule.forRootAsync({ imports: [Import], useFactory: () => ({}) as any });

      expect(Module).toHaveBeenCalledWith({
        imports: [Import],
        controllers: [],
        providers: expect.arrayContaining([]),
        exports: [Router, ContextService],
      });
    });
  });
});
