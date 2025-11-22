/**
 * Importing npm packages
 */
import assert from 'node:assert';

import { Fn, InternalError, Logger, utils } from '@shadow-library/common';
import { Class } from 'type-fest';

/**
 * Importing user defined packages
 */
import { DIErrors, isAliasProvider, isClassProvider, isFactoryProvider, isValueProvider } from './helpers';
import { INJECTABLE_METADATA, INTERCEPTOR_METADATA, NAMESPACE, OPTIONAL_DEPS_METADATA, PARAMTYPES_METADATA, RETURN_TYPE_METADATA, SELF_DECLARED_DEPS_METADATA } from '../constants';
import { InjectMetadata, InjectableOptions } from '../decorators';
import { FactoryDependency, FactoryProvider, InjectionToken, Interceptor, InterceptorConfig, InterceptorContext, Provider } from '../interfaces';
import { ContextId, createContextId } from '../utils';
import { ModuleRef } from './module-ref';

/**
 * Defining types
 */

export interface InjectionMetadata extends FactoryDependency {
  forwardRef?: boolean;
  contextId?: ContextId;
}

export type Factory<T extends object> = (...args: any[]) => T | Promise<T>;

export interface InstancePerContext<T extends object> {
  instance: T;
  resolved: boolean;
  intercepted?: boolean;
}

interface InterceptorInvocation {
  interceptor: Interceptor;
  options?: any;
  context: Omit<InterceptorContext, 'getArgs'>;
}

/**
 * Declaring the constants
 */
const STATIC_CONTEXT: ContextId = Object.freeze({ id: 0 });

export class InstanceWrapper<T extends object = any> {
  private readonly logger = Logger.getLogger(NAMESPACE, 'InstanceWrapper');

  private readonly token: InjectionToken;
  private readonly inject: InjectionMetadata[];
  private readonly metatype?: Class<T> | Factory<T>;
  private readonly dependencies: (InstanceWrapper | undefined)[];
  private readonly instances = new Map<ContextId, InstancePerContext<T>>();

  private readonly transient: boolean = false;
  private readonly isFactory: boolean = false;
  private readonly isClass: boolean = false;
  private readonly isAlias: boolean = false;

  constructor(provider: Provider, injectable?: boolean) {
    if (isValueProvider(provider)) {
      this.inject = [];
      this.dependencies = [];
      this.token = provider.token;
      this.instances.set(STATIC_CONTEXT, { instance: provider.useValue, resolved: true });
      this.logger.debug(`Instance '${this.getTokenName()}' created`);
      return;
    }

    if (isFactoryProvider(provider)) {
      this.isFactory = true;
      this.token = provider.token;
      this.metatype = provider.useFactory;
      this.inject = this.getFactoryDependencies(provider.inject);
      this.dependencies = new Array(this.inject.length);
      return;
    }

    if (isAliasProvider(provider)) {
      this.isAlias = true;
      this.token = provider.token;
      this.inject = [{ token: provider.useExisting, optional: false }];
      this.dependencies = new Array(1);
      return;
    }

    const { token, useClass: Class } = isClassProvider(provider) ? provider : { token: provider, useClass: provider };
    if (injectable) {
      const injectable = Reflect.hasMetadata(INJECTABLE_METADATA, Class);
      if (!injectable) throw new InternalError(`Class '${Class.name}' is not an injectable provider`);
    }

    this.isClass = true;
    this.token = token;
    this.metatype = Class;
    this.inject = this.getClassDependencies(Class);
    this.dependencies = new Array(this.inject.length);
    this.transient = Reflect.getMetadata(INJECTABLE_METADATA, Class)?.transient ?? false;
    if (!this.transient) {
      const instance = Object.create(Class.prototype);
      this.instances.set(STATIC_CONTEXT, { instance, resolved: false });
    }
  }

  private getFactoryDependencies(deps: FactoryProvider['inject']): InjectionMetadata[] {
    if (!deps) return [];
    const index = deps.findIndex(d => d === undefined);
    if (index !== -1) return DIErrors.undefinedDependency(this.token, index);

    return deps.map(d => (typeof d === 'object' && 'token' in d ? d : { token: d, optional: false }));
  }

  private getInjectedToken(injectMetadata: InjectMetadata): InjectionMetadata {
    if (typeof injectMetadata.token === 'object' && 'forwardRef' in injectMetadata.token) {
      const token = injectMetadata.token.forwardRef();
      return { token, optional: false, forwardRef: true };
    }

    return { token: injectMetadata.token, optional: false };
  }

  private getClassDependencies(Class: Class<unknown>): InjectionMetadata[] {
    const dependencies = [] as InjectionMetadata[];

    const paramtypes: Class<unknown>[] = Reflect.getMetadata(PARAMTYPES_METADATA, Class) ?? [];
    for (const dependency of paramtypes) dependencies.push({ token: dependency, optional: false });

    const selfDependencies: InjectMetadata[] = Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, Class) ?? [];
    for (const dependency of selfDependencies) dependencies[dependency.index] = this.getInjectedToken(dependency);

    const optionalDependencies: number[] = Reflect.getMetadata(OPTIONAL_DEPS_METADATA, Class) ?? [];
    for (const index of optionalDependencies) {
      const dependency = dependencies[index];
      assert(dependency, `Dependency at index ${index} of '${this.getTokenName()}' is undefined`);
      dependency.optional = true;
    }

    for (const dependency of dependencies) {
      if (!utils.object.isClass(dependency.token)) continue;
      const metadata: InjectableOptions = Reflect.getMetadata(INJECTABLE_METADATA, dependency.token) ?? {};
      if (metadata.transient) dependency.contextId = createContextId();
    }

    return dependencies;
  }

  getToken(): InjectionToken {
    return this.token;
  }

  getMetatype(): Class<T> | Factory<T> | undefined {
    return this.metatype;
  }

  getTokenName(): string {
    const token = this.token as any;
    return token.name ?? token.toString();
  }

  isTransient(): boolean {
    return this.transient;
  }

  isAliasProvider(): boolean {
    return this.isAlias;
  }

  getAliasToken(): InjectionToken {
    const actualProvider = this.inject[0];
    assert(actualProvider, `Alias provider '${this.getTokenName()}' has no target token`);
    return actualProvider.token;
  }

  getDependencies(): InjectionMetadata[] {
    return this.inject;
  }

  setDependency(index: number, provider: InstanceWrapper): this {
    this.dependencies[index] = provider;
    return this;
  }

  clearInstance(contextId?: ContextId): void {
    if (contextId) this.instances.delete(contextId);
    else this.instances.clear();
  }

  isResolved(contextId?: ContextId): boolean {
    if (contextId) {
      const instancePerContext = this.instances.get(contextId);
      return instancePerContext?.resolved ?? false;
    }

    const instances = Array.from(this.instances.values());
    if (instances.length === 0) return false;
    return instances.every(i => i.resolved);
  }

  getAllInstances(): T[] {
    const instanceContexts = Array.from(this.instances.values());
    return instanceContexts.map(i => i.instance);
  }

  getInstance(contextId: ContextId = STATIC_CONTEXT): T {
    const instancePerContext = this.instances.get(contextId);
    if (!instancePerContext) throw new InternalError(`Instance of '${this.getTokenName()}' not found`);
    return instancePerContext.instance;
  }

  loadPrototype(contextId: ContextId = STATIC_CONTEXT): T {
    const name = this.getTokenName();
    if (this.isFactory) throw new InternalError(`Factory provider '${name}' cannot be used as a prototype`);

    const instancePerContext = this.instances.get(contextId);
    if (instancePerContext) return instancePerContext.instance;

    const prototype = Object.create(this.metatype?.prototype);
    this.instances.set(contextId, { instance: prototype, resolved: false });
    return prototype;
  }

  private async resolveDependency(index: number): Promise<unknown | undefined> {
    const metadata = this.inject[index] as InjectionMetadata;
    const dependency = this.dependencies[index];

    if (!dependency) {
      if (metadata.optional) return;
      throw DIErrors.unexpected(`The dependency at index ${index} of '${this.getTokenName()}' is undefined`);
    }

    if (!dependency.isResolved()) return await dependency.loadPrototype(metadata.contextId);
    return await dependency.loadInstance(metadata.contextId);
  }

  async loadAllInstances(): Promise<T[]> {
    const instances = [];
    for (const contextId of this.instances.keys()) {
      const instance = await this.loadInstance(contextId);
      instances.push(instance);
    }

    return instances;
  }

  async loadInstance(contextId: ContextId = STATIC_CONTEXT): Promise<T> {
    const instancePerContext = this.instances.get(contextId);
    if (instancePerContext?.resolved) return instancePerContext.instance;

    this.logger.debug(`Loading instance of '${this.getTokenName()}'`);

    const dependencies = [];
    for (let index = 0; index < this.inject.length; index++) {
      const dependency = await this.resolveDependency(index);
      dependencies.push(dependency);
    }

    let instance: T;
    if (this.isFactory) instance = await (this.metatype as Factory<T>)(...dependencies);
    else instance = new (this.metatype as Class<T>)(...dependencies);
    if (instancePerContext) instance = Object.assign(instancePerContext.instance, instance);
    this.instances.set(contextId, { instance, resolved: true });
    this.logger.debug(`Instance '${this.getTokenName()}' loaded`);

    return instance;
  }

  async applyInterceptors(moduleRef: ModuleRef, contextId: ContextId = STATIC_CONTEXT): Promise<void> {
    if (!this.isClass) {
      this.logger.debug(`Instance '${this.getTokenName()}' is not a class, skipping interceptor application`);
      return;
    }

    const instancePerContext = this.instances.get(contextId);
    assert(instancePerContext, `Instance of '${this.getTokenName()}' not found for context ID ${contextId.id}`);
    if (instancePerContext.intercepted) return;

    /** Extracting all the intercepted methods from the class instance */
    const Class = this.metatype as Class<T>;
    const instance = instancePerContext?.instance as Record<string, unknown>;
    const methods = new Set<Fn>();
    let prototype = instance;
    do {
      for (const propertyName of Object.getOwnPropertyNames(prototype)) {
        const method = instance[propertyName];
        const isInterceptor = typeof method === 'function' && Reflect.hasMetadata(INTERCEPTOR_METADATA, method);
        if (isInterceptor) methods.add(method as Fn);
      }
    } while ((prototype = Object.getPrototypeOf(prototype)));

    for (const method of methods) {
      /** resolve the interceptors and validate the interceptors */
      const Interceptors: InterceptorConfig[] = Reflect.getMetadata(INTERCEPTOR_METADATA, method);
      const interceptors = Interceptors.map(i => moduleRef.get<Interceptor>(i.token));
      const invalidInterceptor = interceptors.find(i => typeof i.intercept !== 'function');
      if (invalidInterceptor) throw new InternalError(`Interceptor '${invalidInterceptor.constructor.name}' does not implement 'intercept' method`);

      /** create the interceptor context and intercept the original method */
      const returnType = Reflect.getMetadata(RETURN_TYPE_METADATA, method);
      const isPromise = returnType === Promise || method.constructor.name === 'AsyncFunction';
      const interceptorInvocations: InterceptorInvocation[] = [];
      const invoker = (invocation: InterceptorInvocation, args: unknown[], handle: Fn) => {
        const context = { ...invocation.context, getArgs: () => args } as InterceptorContext;
        return invocation.interceptor.intercept(context, { handle });
      };
      for (let index = 0; index < interceptors.length; index++) {
        const interceptor = interceptors[index] as Interceptor;
        const options = Interceptors[index]?.options;
        const context: Omit<InterceptorContext, 'getArgs'> = {
          getClass: () => Class as Class<any>,
          getMethodName: () => method.name,
          isPromise: () => isPromise,
          getOptions: () => options,
        };
        interceptorInvocations.push({ interceptor, options, context });
      }

      instance[method.name] = function (...args: any[]) {
        const handler = () => method.apply(this, args);
        const executor = interceptorInvocations.reduceRight((handle, invocation) => () => invoker(invocation, args, handle), handler);
        return executor();
      };

      instancePerContext.intercepted = true;
      this.logger.debug(`Applied interceptors to '${this.getTokenName()}.${method.name}()'`, { contextId });
    }
  }

  async applyInterceptorsToAllInstances(moduleRef: ModuleRef): Promise<void> {
    if (!this.isClass) {
      this.logger.debug(`Instance '${this.getTokenName()}' is not a class, skipping interceptor application`);
      return;
    }

    for (const contextId of this.instances.keys()) await this.applyInterceptors(moduleRef, contextId);
    this.logger.debug(`Applied interceptors to all instances of '${this.getTokenName()}'`);
  }
}
