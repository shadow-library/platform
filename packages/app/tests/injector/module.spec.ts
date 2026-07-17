/**
 * Importing npm packages
 */
import { AppError } from '@shadow-library/common';
import { beforeEach, describe, expect, it, jest, mock, spyOn } from 'bun:test';

/**
 * Importing user defined packages
 */
import { HookTypes, ModuleRef, Module as ModuleWrapper } from '@lib/injector';
import { Controller, EnableIf, Handler, Inject, Injectable, Module, OnApplicationReady, OnModuleDestroy, OnModuleInit, Optional, forwardRef } from '@shadow-library/app';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('Module', () => {
  const testConfig = Symbol('CONFIG');
  const onModuleInitMock = mock(() => {});
  const onAppReadyMock = mock(() => {});
  const onModuleDestroyMock = mock(() => {});
  let module: ModuleWrapper;

  @Injectable()
  class CatSubService implements OnModuleInit {
    constructor(@Inject('CONFIG') public config: any) {}
    onModuleInit = onModuleInitMock;
  }

  @Injectable({ transient: true })
  class CatService implements OnApplicationReady {
    constructor(public catSubService: CatSubService) {}
    onApplicationReady = onAppReadyMock;
  }

  @Injectable()
  class MockCatService implements OnModuleInit {
    constructor(@Optional() @Inject(testConfig) public optionalData: any) {}
    onModuleInit = onModuleInitMock;
  }

  @Controller()
  class CatController {
    constructor(public catService: CatService) {}

    isBound(): boolean {
      return true;
    }

    @Handler()
    getCat(): boolean {
      return this.isBound();
    }
  }

  const catModuleMetadata = {
    providers: [
      CatService,
      { token: 'CONFIG', useValue: 'CONFIG_VALUE' },
      { token: 'MOCK_CAT', useClass: MockCatService },
      { token: testConfig, useFactory: (config: string) => `TEST_${config}`, inject: ['CONFIG'] },
      { token: 'NO_INJECT', useFactory: (config: string) => `NO_INJECT_${config}` },
      CatSubService,
    ],
    controllers: [CatController],
    exports: [CatService, 'MOCK_CAT'],
  };
  @Module(catModuleMetadata)
  class CatModule implements OnModuleDestroy {
    constructor(public catService: CatService) {}
    onModuleDestroy = onModuleDestroyMock;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    module = new ModuleWrapper(CatModule, catModuleMetadata);
    module.loadDependencies();
  });

  describe('module creation', () => {
    it('should throw an error if the controller is not annotated', () => {
      class InvalidController {}
      const metadata = { controllers: [InvalidController] };
      @Module(metadata)
      class InvalidModule {}

      expect(() => new ModuleWrapper(InvalidModule, metadata)).toThrow(AppError);
    });

    it('should throw an error for duplicate providers', () => {
      const metadata = { providers: [MockCatService, { token: MockCatService, useClass: CatSubService }] };
      @Module(metadata)
      class DuplicateModule {}

      expect(() => new ModuleWrapper(DuplicateModule, metadata)).toThrow(AppError);
    });

    it('should add the module ref provider', () => {
      expect(module['providers'].get(ModuleRef)).toBeDefined();
    });

    it('should add the providers', () => {
      expect(module['providers'].get(CatService)).toBeDefined();
      expect(module['providers'].get('CONFIG')).toBeDefined();
      expect(module['providers'].get('MOCK_CAT')).toBeDefined();
      expect(module['providers'].get(testConfig)).toBeDefined();
      expect(module['providers'].get('NO_INJECT')).toBeDefined();
      expect(module['providers'].get(CatSubService)).toBeDefined();
    });

    it('should add the controllers', () => {
      const controllers = Array.from(module['controllers'].values());
      expect(controllers).toHaveLength(1);
      expect(controllers[0]?.getToken()).toBe(CatController);
    });

    it('should add the exports', () => {
      const exports = Array.from(module['exports']);
      expect(exports).toStrictEqual([CatService, 'MOCK_CAT']);
    });

    it('should load the module when there are no providers and controllers', () => {
      @Module({})
      class EmptyModule {}

      const emptyModule = new ModuleWrapper(EmptyModule, {});
      expect(emptyModule['providers'].size).toBe(1); // ModuleRef
      expect(emptyModule['controllers'].size).toBe(0);
    });

    it('should replace a declared provider with a matching override', () => {
      const metadata = { providers: [MockCatService], exports: [MockCatService] };
      @Module(metadata)
      class OverrideModule {}

      const overrides = new Map([[MockCatService, { token: MockCatService, useValue: { overridden: true } }]]);
      const overrideModule = new ModuleWrapper(OverrideModule, metadata, overrides as any);

      expect(overrideModule.getProvider(MockCatService)?.getInstance()).toEqual({ overridden: true });
    });

    it('should load only the providers from the imports', () => {
      @Injectable()
      class AnimalService {
        constructor(private readonly catService: CatService) {}
      }

      const metadata = { imports: [CatModule], providers: [AnimalService] };
      @Module(metadata)
      class AnimalModule {}

      const module = new ModuleWrapper(AnimalModule, metadata);
      expect(module['providers'].size).toBe(2);
      expect(module['providers'].get(AnimalService)).toBeDefined();
    });

    it('should use metadata provided in constructor', () => {
      const module = new ModuleWrapper(CatModule, { providers: [{ token: 'TEST', useValue: 123 }] });
      expect(module['imports'].length).toBe(0);
      expect(module['controllers'].size).toBe(0);
      expect(module['providers'].size).toBe(2);
      expect(module['exports'].size).toBe(0);
      expect(module['providers'].get('TEST')).toBeDefined();
    });

    it('should handle alias providers correctly', () => {
      @Injectable()
      abstract class BaseService {
        abstract getName(): string;
      }

      @Injectable()
      class AliasService extends BaseService {
        override getName(): string {
          return 'AliasService';
        }

        getAliasName(): string {
          return 'AliasService';
        }
      }

      const metadata = {
        providers: [
          { token: AliasService, useClass: AliasService },
          { token: BaseService, useExisting: AliasService },
        ],
        exports: [AliasService, BaseService],
      };
      @Module(metadata)
      class AliasModule {}

      const module = new ModuleWrapper(AliasModule, metadata);
      module.loadDependencies();
      expect(module['providers'].get(BaseService)).toBeDefined();
      expect(module['providers'].get(AliasService)).toBeDefined();
      expect(module.getProvider(AliasService)).toBe(module.getProvider(BaseService));
    });

    it('should handle aliasing providers from imported modules', () => {
      const token = 'ALIASED_CAT_SERVICE';
      const metadata = {
        providers: [{ token, useExisting: CatService }],
        exports: [token],
      };
      @Module(metadata)
      class AliasModule {}

      const moduleWithAlias = new ModuleWrapper(AliasModule, metadata);
      moduleWithAlias.addImport(module);
      moduleWithAlias.loadDependencies();
      expect(moduleWithAlias.getProvider(token)).toBe(module.getProvider(CatService));
    });
  });

  describe('General methods', () => {
    it('should get the module metatype', () => {
      expect(module.getMetatype()).toBe(CatModule);
    });

    it('should throw an error if the provider is not exported or not found', () => {
      expect(() => module.getProvider('NOT_FOUND')).toThrow(AppError);
      expect(() => module.getProvider(CatSubService)).toThrow(AppError);
    });

    it('should get the exported provider', () => {
      expect(module.getProvider(CatService)?.getToken()).toBe(CatService);
      expect(module.getProvider('MOCK_CAT')?.getToken()).toBe('MOCK_CAT');
    });

    it('should not throw an error if the provider is not exported and is optional', () => {
      expect(module.getProvider('NOT_FOUND', true)).toBeUndefined();
      expect(module.getProvider(CatSubService, true)).toBeUndefined();
    });

    it('should add the import', () => {
      @Module({})
      class NewModule {}

      const importModule = new ModuleWrapper(NewModule, {});
      module.addImport(importModule);

      expect(module['imports']).toHaveLength(1);
      expect(module['imports'][0]).toBe(importModule);
    });

    it('should return the init status', () => {
      expect(module.isInitiated()).toBe(false);
      module['instance'].isResolved = mock(() => true);
      expect(module.isInitiated()).toBe(true);
    });
  });

  describe('Module Ref', () => {
    let moduleRef: ModuleRef;

    beforeEach(async () => {
      moduleRef = module['getInternalProvider'](ModuleRef).getInstance() as any;
      await module.init();
    });

    it('should throw an error if the provider is not found', () => {
      expect(() => moduleRef.get('NOT_FOUND')).toThrow(AppError);
    });

    it('should throw error if provider is not exported from the imported module', () => {
      const metadata = { imports: [CatModule] };
      @Module(metadata)
      class NewModule {}

      const newModule = new ModuleWrapper(NewModule, metadata).addImport(module);
      const moduleRef = newModule['getInternalProvider'](ModuleRef).getInstance() as any;

      expect(() => moduleRef.get(CatSubService)).toThrow(AppError);
    });

    it('should get the provider', () => {
      expect(moduleRef.get('CONFIG')).toBe('CONFIG_VALUE');
      expect(moduleRef.get('MOCK_CAT')).toBeInstanceOf(MockCatService);
      expect(moduleRef.get(CatSubService)).toBeInstanceOf(CatSubService);
    });

    it('should throw an error if a non transient provider is resolved', async () => {
      await expect(moduleRef.resolve(CatSubService)).rejects.toThrow(AppError);
    });

    it('should resolve the transient provider', async () => {
      const loadMock = mock(async () => ({}) as any);
      const service = module['providers'].get(CatService)!;
      service.loadInstance = loadMock;
      service.applyInterceptors = loadMock;
      await moduleRef.resolve(CatService);
      expect(loadMock).toBeCalledTimes(2);
    });

    it('should resolve the provider exported from the imported module', async () => {
      const loadMock = mock(async () => 'RESULT' as any);
      const service = module['providers'].get(CatService)!;
      service.loadInstance = loadMock;
      service.applyInterceptors = loadMock;

      const metadata = { imports: [CatModule] };
      @Module(metadata)
      class NewModule {}

      const newModule = new ModuleWrapper(NewModule, metadata).addImport(module);
      const moduleRef = newModule['getInternalProvider'](ModuleRef).getInstance() as any;
      const instance = await moduleRef.resolve(CatService);

      expect(loadMock).toBeCalledTimes(2);
      expect(instance).toBe('RESULT');
    });
  });

  describe('Initialization and termination', () => {
    it('should initialize the module', async () => {
      await module.init();
      const isProvidersResolved = Array.from(module['providers'].values()).every(provider => provider.isResolved());
      const isControllersResolved = Array.from(module['controllers'].values()).every(controller => controller.isResolved());

      expect(module.isInitiated()).toBe(true);
      expect(isProvidersResolved).toBe(true);
      expect(isControllersResolved).toBe(true);
    });

    it('should initialize the module when optional provider is not provided', async () => {
      const metadata = { providers: [MockCatService] };
      @Module(metadata)
      class OptionalModule {}
      const module = new ModuleWrapper(OptionalModule, metadata);

      await module.init();
      const isProvidersResolved = Array.from(module['providers'].values()).every(provider => provider.isResolved());
      const isControllersResolved = Array.from(module['controllers'].values()).every(controller => controller.isResolved());

      expect(module.isInitiated()).toBe(true);
      expect(isProvidersResolved).toBe(true);
      expect(isControllersResolved).toBe(true);
    });

    it('should throw an error if an unknown provider is exported', async () => {
      const metadata = { exports: ['UNKNOWN_PROVIDER'] };
      @Module(metadata)
      class InvalidModule {}

      const module = new ModuleWrapper(InvalidModule, metadata);
      await expect(module.init()).rejects.toThrowError(AppError);
    });

    it('should terminate the module', async () => {
      await module.init();
      await module.terminate();
      expect(onModuleDestroyMock).toBeCalledTimes(1);
    });

    it('should dispose instances implementing Symbol.asyncDispose and Symbol.dispose on terminate', async () => {
      const asyncDisposeMock = mock(async () => {});
      const disposeMock = mock(() => {});

      @Injectable()
      class AsyncDisposableService {
        async [Symbol.asyncDispose](): Promise<void> {
          await asyncDisposeMock();
        }
      }

      @Injectable()
      class DisposableService {
        [Symbol.dispose](): void {
          disposeMock();
        }
      }

      const metadata = { providers: [AsyncDisposableService, DisposableService] };
      @Module(metadata)
      class DisposableModule {}

      const disposableModule = new ModuleWrapper(DisposableModule, metadata);
      disposableModule.loadDependencies();
      await disposableModule.init();
      await disposableModule.terminate();

      expect(asyncDisposeMock).toBeCalledTimes(1);
      expect(disposeMock).toBeCalledTimes(1);
    });
  });

  describe('Hooks', () => {
    beforeEach(() => module.init());

    it('should execute the hook for static instance', async () => {
      expect(onModuleInitMock).toBeCalledTimes(2);
    });

    it('should execute the hook for all the instances of the transient provider', async () => {
      await module.callHook(HookTypes.ON_APPLICATION_READY);
      expect(onAppReadyMock).toBeCalledTimes(2);
    });
  });

  describe('Dispatcher', () => {
    const router = { register: mock() };

    @Controller()
    @Handler({ type: 'controller', isController: true })
    class DogController {
      constructor(public catService: CatService) {}

      @Handler({ type: 'route', isRoute: true })
      getDog() {}
    }

    @Module({ imports: [CatModule, forwardRef(() => AnimalModule)], controllers: [DogController] })
    class DogModule {}

    const animalModuleMetadata = { imports: [DogModule] };
    @Module(animalModuleMetadata)
    class AnimalModule {}
    const dogModuleMetadata = { imports: [CatModule, AnimalModule], controllers: [DogController] };

    beforeEach(() => module.init());

    it('should do nothing if the router is not registered', async () => {
      spyOn(module as any, 'getChildModules');
      await module.registerControllers();

      expect(module['getChildModules']).not.toBeCalled();
    });

    it('should register the routes for all the controllers', async () => {
      const dogModule = new ModuleWrapper(DogModule, dogModuleMetadata);
      spyOn(dogModule as any, 'getDispatcher').mockReturnValue(router);

      dogModule.addImport(module);
      dogModule.loadDependencies();
      await dogModule.init();
      await dogModule.registerControllers();

      expect(router.register).toBeCalledTimes(1);
      expect(router.register).toBeCalledWith([
        {
          metadata: {},
          instance: expect.any(DogController),
          metatype: DogController,
          handlers: [
            {
              metadata: { type: 'route', isController: true, isRoute: true },
              handler: expect.any(Function),
              handlerName: DogController.prototype.getDog.name,
              paramtypes: [],
              returnType: undefined,
            },
          ],
        },
        {
          metadata: {},
          instance: expect.any(CatController),
          metatype: CatController,
          handlers: [{ metadata: {}, handler: expect.any(Function), handlerName: CatController.prototype.getCat.name, paramtypes: [], returnType: Boolean }],
        },
      ]);
    });

    it('should bind the controller instance to the handler', () => {
      const catController = Array.from(module['controllers'].values())[0]!;
      const dispatchMetadata = module['getDispatchMetadata'](catController);
      const handlerEntry = dispatchMetadata?.handlers[0];

      expect(handlerEntry?.handler()).toBe(true);
    });

    it('should register controllers only once for cyclic dependent modules', async () => {
      const dogModule = new ModuleWrapper(DogModule, dogModuleMetadata);
      const animalModule = new ModuleWrapper(AnimalModule, animalModuleMetadata);
      dogModule.addImport(animalModule).addImport(module);
      animalModule.addImport(dogModule);

      spyOn(dogModule as any, 'getDispatcher').mockReturnValue(router);
      dogModule.loadDependencies();
      animalModule.loadDependencies();
      await dogModule.init();
      await dogModule.registerControllers();

      expect(router.register.mock.calls.at(-1)?.[0]).toHaveLength(2);
    });

    it('should not register controllers marked as disabled', async () => {
      @Controller()
      @EnableIf(false)
      class TestController {
        @Handler()
        getMethod() {}

        @Handler()
        postMethod() {}
      }

      const testModuleMetadata = { controllers: [TestController] };
      @Module(testModuleMetadata)
      class TestModule {}

      const moduleWrapper = new ModuleWrapper(TestModule, testModuleMetadata);
      spyOn(moduleWrapper as any, 'getDispatcher').mockReturnValue(router);
      await moduleWrapper.init();
      await moduleWrapper.registerControllers();

      expect(router.register).toBeCalledTimes(1);
      expect(router.register).toBeCalledWith([]);
    });

    it('should not register routes marked as disabled', async () => {
      @Controller()
      class TestController {
        @Handler()
        @EnableIf(() => false)
        getMethod() {}

        @Handler()
        postMethod() {}
      }

      const testModuleMetadata = { controllers: [TestController] };
      @Module(testModuleMetadata)
      class TestModule {}

      const moduleWrapper = new ModuleWrapper(TestModule, testModuleMetadata);
      spyOn(moduleWrapper as any, 'getDispatcher').mockReturnValue(router);
      await moduleWrapper.init();
      await moduleWrapper.registerControllers();

      expect(router.register).toBeCalledTimes(1);
      expect(router.register).toBeCalledWith([
        {
          metadata: {},
          instance: expect.any(TestController),
          metatype: TestController,
          handlers: [{ metadata: {}, handler: expect.any(Function), handlerName: TestController.prototype.postMethod.name, paramtypes: [], returnType: undefined }],
        },
      ]);
    });

    it('should start the router', async () => {
      const router = { start: mock() };
      spyOn(module as any, 'getDispatcher').mockReturnValue(router);

      await module.start();

      expect(router.start).toBeCalledTimes(1);
    });

    it('should stop the router', async () => {
      const router = { stop: mock() };
      spyOn(module as any, 'getDispatcher').mockReturnValue(router);

      await module.stop();

      expect(router.stop).toBeCalledTimes(1);
    });
  });
});
