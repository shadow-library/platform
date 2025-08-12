/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { InternalError, NeverError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { InstanceWrapper } from '@lib/injector';
import { CallHandler, Interceptor, InterceptorContext } from '@lib/interfaces';
import { Inject, Injectable, Optional, UseInterceptor, UseInterceptors, createContextId, forwardRef } from '@shadow-library/app';

/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

describe('InstanceWrapper', () => {
  let instanceWrapper: InstanceWrapper;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.restoreAllMocks();
  });

  describe('Value Provider', () => {
    const provider = { token: 'CONFIG', useValue: 'CONFIG_VALUE' };

    beforeEach(() => {
      instanceWrapper = new InstanceWrapper(provider);
    });

    it('should create an instance during initialization', () => {
      const instances = Array.from(instanceWrapper['instances'].values());
      expect(instances).toStrictEqual([{ instance: provider.useValue, resolved: true }]);
    });

    it('should return the provider for loadPrototype()', () => {
      expect(instanceWrapper.loadPrototype()).toBe(provider.useValue);
    });

    it('should return false for isTransient and isFactory', () => {
      expect(instanceWrapper.isTransient()).toBe(false);
      expect(instanceWrapper['isFactory']).toBe(false);
    });
  });

  describe('Class Provider', () => {
    @Injectable()
    class ClassProvider {}

    it('should throw an error if the class is not injectable', () => {
      class InvalidClassProvider {}
      expect(() => new InstanceWrapper(InvalidClassProvider, true)).toThrowError(InternalError);
    });

    it('should create an prototype instance during initialization', () => {
      const instanceWrapper = new InstanceWrapper(ClassProvider);
      const instances = Array.from(instanceWrapper['instances'].values());
      expect(instances).toStrictEqual([{ instance: expect.any(ClassProvider), resolved: false }]);
    });

    it('should handle alias tokens', () => {
      const provider = { token: 'CONFIG', useClass: ClassProvider };
      const instanceWrapper = new InstanceWrapper(provider);
      const instances = Array.from(instanceWrapper['instances'].values());
      expect(instanceWrapper.getToken()).toBe(provider.token);
      expect(instances).toStrictEqual([{ instance: expect.any(ClassProvider), resolved: false }]);
    });

    it('should identify transient provider', () => {
      @Injectable({ transient: true })
      class TransientProvider {}

      const instanceWrapper = new InstanceWrapper(TransientProvider);
      expect(instanceWrapper.isTransient()).toBe(true);
      expect(instanceWrapper['instances']).toHaveProperty('size', 0);
    });

    it('should identify the dependencies', () => {
      class ProviderOne {}
      class ProviderTwo {}
      class OptionalProvider {}

      @Injectable()
      class ClassProvider {
        constructor(
          public providerOne: ProviderOne,
          @Optional() public optionalProvider: OptionalProvider,
          public providerTwo: ProviderTwo,
          @Inject('CUSTOM') public customProvider: object,
          @Inject(forwardRef(() => ProviderOne)) public forwardedProvider: object,
        ) {}
      }

      const instanceWrapper = new InstanceWrapper(ClassProvider);
      expect(instanceWrapper.getDependencies()).toStrictEqual([
        { token: ProviderOne, optional: false },
        { token: OptionalProvider, optional: true },
        { token: ProviderTwo, optional: false },
        { token: 'CUSTOM', optional: false },
        { token: ProviderOne, optional: false, forwardRef: true },
      ]);
    });

    it('should return false for isFactory', () => {
      const instanceWrapper = new InstanceWrapper(ClassProvider);
      expect(instanceWrapper['isFactory']).toBe(false);
    });

    it('should load the instance', async () => {
      @Injectable()
      class ProviderOne {}

      @Injectable()
      class ProviderTwo {}

      @Injectable()
      class Provider {
        constructor(
          public readonly providerOne: ProviderOne,
          public readonly providerTwo: ProviderTwo,
        ) {}
      }

      const instanceWrapper = new InstanceWrapper(Provider);
      instanceWrapper.setDependency(0, new InstanceWrapper(ProviderOne));
      instanceWrapper.setDependency(1, new InstanceWrapper(ProviderTwo));
      const instance = await instanceWrapper.loadInstance();

      expect(instance).toBeInstanceOf(Provider);
      expect(instance.providerOne).toBeInstanceOf(ProviderOne);
      expect(instance.providerTwo).toBeInstanceOf(ProviderTwo);
    });

    it('should load the instance for forwardRef', async () => {
      @Injectable()
      class ProviderOne {
        constructor(@Inject(forwardRef(() => ProviderTwo)) public readonly providerTwo: object) {}
      }

      @Injectable()
      class ProviderTwo {
        constructor(@Inject(forwardRef(() => ProviderOne)) public readonly providerOne: object) {}
      }

      const providerOneWrapper = new InstanceWrapper(ProviderOne);
      const providerTwoWrapper = new InstanceWrapper(ProviderTwo);
      providerOneWrapper.setDependency(0, providerTwoWrapper);

      const instance = await providerOneWrapper.loadInstance();

      expect(instance).toBeInstanceOf(ProviderOne);
      expect(instance.providerTwo).toBeInstanceOf(ProviderTwo);
    });
  });

  describe('Factory Provider', () => {
    const provider = {
      token: Symbol('factory'),
      useFactory: (key: string, optional?: string) => 'CONFIG_VALUE' + key + optional,
      inject: ['DEPENDENCY', { token: 'OPTIONAL', optional: true }],
    };

    beforeEach(() => {
      instanceWrapper = new InstanceWrapper(provider);
    });

    it('should throw an error of undefined dependency', () => {
      const invalidProvider = { ...provider, inject: [...provider.inject, undefined] } as any;
      expect(() => new InstanceWrapper(invalidProvider)).toThrowError(InternalError);
    });

    it('should identify the dependencies', () => {
      expect(instanceWrapper.getDependencies()).toStrictEqual([
        { token: 'DEPENDENCY', optional: false },
        { token: 'OPTIONAL', optional: true },
      ]);
    });

    it('should return true for isFactory and false for isTransient', () => {
      expect(instanceWrapper['isFactory']).toBe(true);
      expect(instanceWrapper.isTransient()).toBe(false);
    });

    it('should throw an error if prototype is loaded', () => {
      expect(() => instanceWrapper.loadPrototype()).toThrowError(InternalError);
    });

    it('should load the instance', async () => {
      instanceWrapper.setDependency(0, new InstanceWrapper({ token: 'DEPENDENCY', useValue: 'DEPENDENCY_VALUE' }));
      const instance = await instanceWrapper.loadInstance();
      expect(instance).toBe('CONFIG_VALUE' + 'DEPENDENCY_VALUE' + undefined);
    });

    it('should load the instance when there are no dependencies', async () => {
      const instanceWrapper = new InstanceWrapper({ token: 'factory', useFactory: () => 'CONFIG_VALUE' });
      const instance = await instanceWrapper.loadInstance();
      expect(instance).toBe('CONFIG_VALUE');
    });
  });

  describe('Transient Provider', () => {
    @Injectable({ transient: true })
    class TransientProviderOne {}

    @Injectable()
    class Provider {
      constructor(public readonly transientProvider: TransientProviderOne) {}
    }

    @Injectable({ transient: true })
    class TransientProvider {
      constructor(
        public readonly provider: Provider,
        public readonly transientProvider: TransientProviderOne,
      ) {}
    }

    beforeEach(() => {
      instanceWrapper = new InstanceWrapper(TransientProvider);
      const providerWrapper = new InstanceWrapper(Provider);
      const transientProviderWrapper = new InstanceWrapper(TransientProviderOne);
      instanceWrapper.setDependency(0, providerWrapper);
      instanceWrapper.setDependency(1, transientProviderWrapper);
      providerWrapper.setDependency(0, transientProviderWrapper);
    });

    it('should return true for isTransient and false for isFactory', () => {
      expect(instanceWrapper.isTransient()).toBe(true);
      expect(instanceWrapper['isFactory']).toBe(false);
    });

    it('should load the instance', async () => {
      const instance = await instanceWrapper.loadInstance(createContextId());
      expect(instance).toBeInstanceOf(TransientProvider);
      expect(instance.provider).toBeInstanceOf(Provider);
      expect(instance.transientProvider).toBeInstanceOf(TransientProviderOne);
    });

    it('should load all the transient instances', async () => {
      @Injectable()
      class Provider {
        constructor(@Inject(forwardRef(() => TransientProvider)) public readonly transientProvider: object) {}
      }

      @Injectable({ transient: true })
      class TransientProvider {
        constructor(public readonly provider: Provider) {}
      }

      const providerWrapper = new InstanceWrapper(Provider);
      const transientProviderWrapper = new InstanceWrapper(TransientProvider);
      providerWrapper.setDependency(0, transientProviderWrapper);
      await providerWrapper.loadInstance();
      transientProviderWrapper.setDependency(0, providerWrapper);

      await transientProviderWrapper.loadAllInstances();

      const instances = Array.from(transientProviderWrapper['instances'].values());
      expect(instances).toStrictEqual([{ instance: expect.any(TransientProvider), resolved: true }]);
    });

    it('should create a new instance for each context', async () => {
      const instanceOne = await instanceWrapper.loadInstance(createContextId());
      const instanceTwo = await instanceWrapper.loadInstance(createContextId());
      expect(instanceOne).not.toBe(instanceTwo);
    });

    it('should create and return an instance for the same context', async () => {
      const contextId = createContextId();
      const instanceOne = await instanceWrapper.loadInstance(contextId);
      const instanceTwo = await instanceWrapper.loadInstance(contextId);
      expect(instanceOne).toBe(instanceTwo);
    });
  });

  describe('General', () => {
    @Injectable()
    class Provider {
      constructor(@Inject('DEPENDENCY') public dependency: object) {}
    }

    beforeEach(() => {
      instanceWrapper = new InstanceWrapper(Provider);
      instanceWrapper.setDependency(0, new InstanceWrapper({ token: 'DEPENDENCY', useValue: 'DEPENDENCY_VALUE' }));
    });

    it('should return the token', () => {
      expect(instanceWrapper.getToken()).toBe(Provider);
    });

    it('should return the metatype', () => {
      expect(instanceWrapper.getMetatype()).toBe(Provider);
    });

    it('should return the dependencies', () => {
      expect(instanceWrapper.getDependencies()).toStrictEqual([{ token: 'DEPENDENCY', optional: false }]);
    });

    it('should return the instance', () => {
      const instance = instanceWrapper.getInstance();
      expect(instance).toBeInstanceOf(Provider);
    });

    it('should get the resolved status', async () => {
      const factoryProvider = new InstanceWrapper({ token: 'factory', useFactory: () => 'CONFIG_VALUE' });

      expect(factoryProvider.isResolved()).toBe(false);
      expect(instanceWrapper.isResolved()).toBe(false);
      expect(instanceWrapper.isResolved(createContextId())).toBe(false);
      instanceWrapper.setDependency(0, new InstanceWrapper({ token: 'DEPENDENCY', useValue: 'DEPENDENCY_VALUE' }));
      await instanceWrapper.loadInstance();
      expect(instanceWrapper.isResolved()).toBe(true);
    });

    it('should throw an error if the instance is not found', () => {
      expect(() => instanceWrapper.getInstance(createContextId())).toThrowError(InternalError);
    });

    it('should throw an error if the dependencies are not set', async () => {
      instanceWrapper['dependencies'].pop();
      await expect(() => instanceWrapper.loadInstance()).rejects.toThrowError(NeverError);
    });

    it('should load a transient prototype of the instance', () => {
      const contextId = createContextId();
      const prototype = instanceWrapper.loadPrototype(contextId);
      expect(prototype).toBeInstanceOf(Provider);
    });

    it('should clear the instance', () => {
      instanceWrapper.clearInstance();
      expect(instanceWrapper['instances']).toHaveProperty('size', 0);
    });

    it('should clear the instance for a specific context', async () => {
      const contextId = createContextId();
      await instanceWrapper.loadInstance();
      await instanceWrapper.loadInstance(contextId);
      instanceWrapper.clearInstance(contextId);
      expect(instanceWrapper['instances']).toHaveProperty('size', 1);
    });

    it('should load the dependency instance if the dependency is already resolved', async () => {
      class DependencyOne {}
      class Provider {}
      const dependencyOne = new InstanceWrapper(DependencyOne);
      const provider = new InstanceWrapper(Provider);
      provider['inject'].push({ token: DependencyOne, optional: false });
      provider.setDependency(0, dependencyOne);
      dependencyOne.isResolved = jest.fn(() => true);
      dependencyOne.loadInstance = jest.fn(() => ({}) as any);

      await provider.loadInstance();

      expect(dependencyOne.loadInstance).toHaveBeenCalled();
    });

    it('should load the dependency prototype instance if the dependency is not yet resolved', async () => {
      class DependencyOne {}
      class Provider {}
      const dependencyOne = new InstanceWrapper(DependencyOne);
      const provider = new InstanceWrapper(Provider);
      provider['inject'].push({ token: DependencyOne, optional: false });
      provider.setDependency(0, dependencyOne);
      dependencyOne.isResolved = jest.fn(() => false);
      dependencyOne.loadPrototype = jest.fn(() => ({}) as any);

      await provider.loadInstance();

      expect(dependencyOne.loadPrototype).toHaveBeenCalled();
    });
  });

  describe('applyInterceptors', () => {
    const moduleRef = { get: jest.fn() } as any;
    const interceptor = jest.fn();

    class InvalidInterceptor {
      intercept = 'Hello, World!';
    }

    class TestInterceptor implements Interceptor {
      intercept(_context: InterceptorContext, next: CallHandler): any {
        interceptor('Test:Before');
        const result = next.handle();
        interceptor('Test:After');
        return result;
      }
    }

    class SecondTestInterceptor implements Interceptor {
      intercept(_context: InterceptorContext, next: CallHandler): any {
        interceptor('SecondTest:Before');
        const result = next.handle();
        interceptor('SecondTest:After');
        return result;
      }
    }

    it('should skip interceptor application for non-class instances', async () => {
      const valueProvider = { token: 'CONFIG', useValue: 'CONFIG_VALUE' };
      const instanceWrapper = new InstanceWrapper(valueProvider);
      instanceWrapper['instances'].get = jest.fn() as any;

      await instanceWrapper.applyInterceptors(moduleRef);

      expect(instanceWrapper['instances'].get).not.toHaveBeenCalled();
    });

    it('should skip interceptor application for factory providers', async () => {
      const factoryProvider = { token: 'FACTORY', useFactory: () => ({ testMethod: () => 'result' }) };
      const instanceWrapper = new InstanceWrapper(factoryProvider);
      instanceWrapper['instances'].get = jest.fn() as any;

      await instanceWrapper.applyInterceptors(moduleRef);

      expect(instanceWrapper['instances'].get).not.toHaveBeenCalled();
    });

    it('should skip if interceptors already applied to the context', async () => {
      @Injectable()
      class TestClass {
        testMethod() {
          return 'original';
        }
      }

      const instanceWrapper = new InstanceWrapper(TestClass);
      instanceWrapper['instances'].get = jest.fn().mockReturnValue({ intercepted: true }) as any;
      jest.spyOn(Reflect, 'getMetadata').mockReturnValue([]);

      await instanceWrapper.applyInterceptors(moduleRef);

      expect(Reflect.getMetadata).not.toHaveBeenCalled();
    });

    it('should apply interceptor to decorated method', async () => {
      @Injectable()
      class TestClass {
        @UseInterceptors(TestInterceptor)
        testMethod() {
          return 'original';
        }
      }

      const testInterceptor = new TestInterceptor();
      const spy = jest.spyOn(testInterceptor, 'intercept');
      const instanceWrapper = new InstanceWrapper(TestClass);
      const instance = await instanceWrapper.loadInstance();
      moduleRef.get.mockReturnValueOnce(testInterceptor);

      await instanceWrapper.applyInterceptors(moduleRef);

      const result = instance.testMethod();
      expect(result).toBe('original');
      expect(spy).toHaveBeenCalledTimes(1);
      expect(interceptor).toHaveBeenCalledWith('Test:Before');
      expect(interceptor).toHaveBeenCalledWith('Test:After');
    });

    it('should apply multiple interceptors', async () => {
      @Injectable()
      class TestClass {
        @UseInterceptors(TestInterceptor, SecondTestInterceptor)
        testMethod() {
          return 'original';
        }
      }

      const instanceWrapper = new InstanceWrapper(TestClass);
      const instance = await instanceWrapper.loadInstance();
      moduleRef.get.mockReturnValueOnce(new TestInterceptor()).mockReturnValueOnce(new SecondTestInterceptor());

      await instanceWrapper.applyInterceptors(moduleRef);

      const result = instance.testMethod();
      expect(result).toBe('original');
      expect(interceptor).toHaveBeenCalledWith('Test:Before');
      expect(interceptor).toHaveBeenCalledWith('SecondTest:Before');
      expect(interceptor).toHaveBeenCalledWith('SecondTest:After');
      expect(interceptor).toHaveBeenCalledWith('Test:After');
    });

    it('should skip non-function properties', async () => {
      @Injectable()
      class TestClass {
        propertyValue = 'not a function';
      }

      const instanceWrapper = new InstanceWrapper(TestClass);
      await instanceWrapper.loadInstance();
      jest.spyOn(Reflect, 'getMetadata').mockReturnValue([]);

      await instanceWrapper.applyInterceptors(moduleRef);
      expect(Reflect.getMetadata).not.toHaveBeenCalled();
    });

    it('should skip methods without interceptor metadata', async () => {
      @Injectable()
      class TestClass {
        plainMethod() {
          return 'plain';
        }
      }

      const instanceWrapper = new InstanceWrapper(TestClass);
      await instanceWrapper.loadInstance();
      jest.spyOn(Reflect, 'getMetadata').mockReturnValue([]);

      await instanceWrapper.applyInterceptors(moduleRef);
      expect(Reflect.getMetadata).not.toHaveBeenCalled();
    });

    it('should throw error for invalid interceptor without intercept method', async () => {
      @Injectable()
      class TestClass {
        @UseInterceptors(InvalidInterceptor)
        testMethod() {
          return 'original';
        }
      }

      const instanceWrapper = new InstanceWrapper(TestClass);
      await instanceWrapper.loadInstance();
      moduleRef.get.mockReturnValueOnce(new InvalidInterceptor());

      await expect(instanceWrapper.applyInterceptors(moduleRef)).rejects.toThrowError(InternalError);
    });

    it('should call the interceptor with the correct context', async () => {
      @Injectable()
      class TestClass {
        @UseInterceptor(TestInterceptor, { some: 'option' })
        testMethod() {
          return 'original';
        }
      }

      const testInterceptor = new TestInterceptor();
      const instanceWrapper = new InstanceWrapper(TestClass);
      const instance = await instanceWrapper.loadInstance();
      moduleRef.get.mockReturnValueOnce(testInterceptor);
      testInterceptor.intercept = jest.fn().mockImplementation((context: any, next: any) => {
        expect(context.getClass()).toBe(TestClass);
        expect(context.getMethodName()).toBe('testMethod');
        expect(context.isPromise()).toBe(false);
        expect(context.getOptions()).toEqual({ some: 'option' });
        return next.handle();
      });

      await instanceWrapper.applyInterceptors(moduleRef);

      instance.testMethod();
    });

    it('should preserve method binding when intercepted', async () => {
      @Injectable()
      class TestClass {
        private readonly msg = 'Hello, World!';

        @UseInterceptors(TestInterceptor)
        testMethod() {
          return this.msg;
        }
      }

      const instanceWrapper = new InstanceWrapper(TestClass);
      const instance = await instanceWrapper.loadInstance();
      moduleRef.get.mockReturnValueOnce(new TestInterceptor());

      await instanceWrapper.applyInterceptors(moduleRef);

      const result = instance.testMethod();
      expect(result).toBe('Hello, World!');
      expect(interceptor).toHaveBeenCalledWith('Test:Before');
      expect(interceptor).toHaveBeenCalledWith('Test:After');
    });

    it('should handle interceptor chain execution order', async () => {
      @Injectable()
      class TestClass {
        @UseInterceptors(TestInterceptor, SecondTestInterceptor)
        testMethod() {
          return 'original';
        }
      }

      const instanceWrapper = new InstanceWrapper(TestClass);
      const instance = await instanceWrapper.loadInstance();
      moduleRef.get.mockReturnValueOnce(new TestInterceptor()).mockReturnValueOnce(new SecondTestInterceptor());

      await instanceWrapper.applyInterceptors(moduleRef);

      const result = instance.testMethod();
      expect(result).toBe('original');
      expect(interceptor).toHaveBeenNthCalledWith(1, 'Test:Before');
      expect(interceptor).toHaveBeenNthCalledWith(2, 'SecondTest:Before');
      expect(interceptor).toHaveBeenNthCalledWith(3, 'SecondTest:After');
      expect(interceptor).toHaveBeenNthCalledWith(4, 'Test:After');
    });

    it('should handle interceptors for inherited methods', async () => {
      @Injectable()
      class BaseClass {
        @UseInterceptors(TestInterceptor)
        baseMethod() {
          return 'base';
        }
      }

      @Injectable()
      class DerivedClass extends BaseClass {
        derivedMethod() {
          return 'derived';
        }
      }

      const instanceWrapper = new InstanceWrapper(DerivedClass);
      const instance = await instanceWrapper.loadInstance();
      moduleRef.get.mockReturnValueOnce(new TestInterceptor());

      await instanceWrapper.applyInterceptors(moduleRef);

      const baseResult = instance.baseMethod();
      expect(baseResult).toBe('base');
      expect(interceptor).toHaveBeenCalledWith('Test:Before');
      expect(interceptor).toHaveBeenCalledWith('Test:After');

      interceptor.mockReset();
      const derivedResult = instance.derivedMethod();
      expect(derivedResult).toBe('derived');
      expect(interceptor).not.toHaveBeenCalledWith('Test:Before');
      expect(interceptor).not.toHaveBeenCalledWith('Test:After');
    });
  });
});
