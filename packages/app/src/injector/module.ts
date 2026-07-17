/**
 * Importing npm packages
 */
import assert from 'node:assert';

import { AppError, Logger } from '@shadow-library/common';
import merge from 'deepmerge';
import { Class } from 'type-fest';

/**
 * Importing user defined packages
 */
import { InternalOperationMetadata } from '@lib/internal.types';

import { DIErrors, DependencyGraph, getProviderToken } from './helpers';
import { InstanceWrapper } from './instance-wrapper';
import { ModuleRef } from './module-ref';
import { DispatchMetadata, Dispatcher } from '../classes';
import { CONTROLLER_METADATA, HANDLER_METADATA, INTERNAL_OPERATION_METADATA, NAMESPACE, PARAMTYPES_METADATA, RETURN_TYPE_METADATA } from '../constants';
import { HandlerMetadata } from '../decorators';
import { ModuleMetadata, Provider, ProviderToken, TokenValue, ValueProvider } from '../interfaces';
import { ContextId, createContextId } from '../utils';

/**
 * Defining types
 */

type Controller = Record<string, any>;

export enum HookTypes {
  ON_MODULE_INIT = 'onModuleInit',
  ON_MODULE_DESTROY = 'onModuleDestroy',
  ON_APPLICATION_READY = 'onApplicationReady',
  ON_APPLICATION_STOP = 'onApplicationStop',
}

interface ParsedInternalMetadata {
  enabled: boolean;
}

/**
 * Declaring the constants
 */

export class Module {
  private readonly logger = Logger.getLogger(NAMESPACE, 'Module');

  private readonly imports = [] as Module[];
  private readonly controllers = new Set<InstanceWrapper<Controller>>();
  private readonly providers = new Map<ProviderToken, InstanceWrapper>();
  private readonly exports = new Set<ProviderToken>();

  private readonly instance: InstanceWrapper;

  constructor(
    private readonly metatype: Class<unknown>,
    private readonly metadata: ModuleMetadata,
    private readonly overrides: Map<ProviderToken, Provider> = new Map(),
  ) {
    this.instance = new InstanceWrapper(metatype);

    this.addModuleRef();
    this.loadProviders();
    this.loadControllers();
    this.loadExports(false);
  }

  private addModuleRef() {
    /* eslint-disable-next-line @typescript-eslint/no-this-alias */
    const self = this;
    const CustomModuleRef = class extends ModuleRef {
      override get<Token extends ProviderToken>(token: Token): TokenValue<Token> {
        const provider = self.getInternalProvider(token);
        return provider.getInstance() as TokenValue<Token>;
      }

      override async resolve<T>(typeOrToken: Class<T>, contextId?: ContextId): Promise<T> {
        const provider = self.getInternalProvider(typeOrToken) as InstanceWrapper;
        if (!provider.isTransient()) throw AppError.internal(`The provider '${provider.getTokenName()}' is not transient`);
        if (!contextId) contextId = createContextId();
        const instance = await provider.loadInstance(contextId);
        await provider.applyInterceptors(this, contextId);
        return instance as T;
      }
    };

    const provider: ValueProvider = { token: ModuleRef, useValue: new CustomModuleRef() };
    const instance = new InstanceWrapper(provider);
    this.providers.set(provider.token, instance);
  }

  private loadProviders() {
    const declared = this.metadata.providers ?? [];
    const providers = declared.map(provider => this.overrides.get(getProviderToken(provider)) ?? provider);
    const providerMap = new Map<ProviderToken, InstanceWrapper>();
    const graph = new DependencyGraph();

    /** Create instance wrapper for all the providers */
    for (const provider of providers) {
      const instance = new InstanceWrapper(provider, true);
      const token = instance.getToken();
      if (providerMap.has(token)) throw AppError.internal(`Duplicate provider '${token.toString()}' in module '${this.metatype.name}'`);
      providerMap.set(token, instance);
      graph.addNode(token);
    }

    /** Add the dependencies to the graph */
    for (const provider of providerMap.values()) {
      if (provider.isResolved()) continue;
      for (const dependency of provider.getDependencies()) {
        if (!providerMap.has(dependency.token)) continue;
        else graph.addDependency(provider.getToken(), dependency.token);
      }
    }

    /** Sort the providers based on the dependencies and insert the providers into the map */
    for (const token of graph.getInitOrder()) {
      const provider = providerMap.get(token);
      assert(provider, `Unexpected Provider '${token.toString()}' not found in the provider map`);
      this.providers.set(token, provider);
    }
  }

  private loadControllers() {
    const controllers = this.metadata.controllers ?? [];
    for (const controller of controllers) {
      const isController = Reflect.hasMetadata(CONTROLLER_METADATA, controller);
      if (!isController) throw AppError.internal(`Class '${controller.name}' is not a controller`);
      const instance = new InstanceWrapper<Controller>(controller);
      this.controllers.add(instance);
    }
  }

  private loadExports(verify: boolean) {
    const exports = this.metadata.exports ?? [];
    for (const token of exports) {
      if (verify) {
        const provider = this.getInternalProvider(token, true);
        if (!provider) throw DIErrors.unknownExport(token, this.metatype);
      }
      this.exports.add(token);
    }
  }

  private getChildModules(): Set<Module> {
    const modules = new Set<Module>();
    const scanModules = (module: Module) => {
      if (modules.has(module)) return;
      modules.add(module);
      module.imports.forEach(importModule => scanModules(importModule));
    };

    this.imports.forEach(scanModules);
    return modules;
  }

  private getInternalProvider<T extends object = object>(token: ProviderToken): InstanceWrapper<T>;
  private getInternalProvider<T extends object = object>(token: ProviderToken, optional: boolean): InstanceWrapper<T> | undefined;
  private getInternalProvider<T extends object = object>(token: ProviderToken, optional?: boolean): InstanceWrapper<T> | undefined {
    const provider = this.providers.get(token);
    if (provider) return provider;

    for (const module of this.imports) {
      const provider = module.getProvider(token, true);
      if (provider) return provider;
    }

    if (!optional) DIErrors.notFound(token, this.metatype);
    return;
  }

  getMetatype(): Class<unknown> {
    return this.metatype;
  }

  getProvider(token: ProviderToken): InstanceWrapper;
  getProvider(token: ProviderToken, optional: boolean): InstanceWrapper | undefined;
  getProvider(token: ProviderToken, optional?: boolean): InstanceWrapper | undefined {
    const isExported = this.exports.has(token);
    if (!isExported) {
      if (optional) return;
      return DIErrors.notFound(token, this.metatype);
    }

    return this.getInternalProvider(token, optional ?? false);
  }

  addImport(module: Module): this {
    this.imports.push(module);
    return this;
  }

  isInitiated(): boolean {
    return this.instance.isResolved();
  }

  private getAllInstances(): InstanceWrapper[] {
    const instances = [] as InstanceWrapper[];
    for (const provider of this.providers.values()) instances.push(provider);
    for (const controller of this.controllers) instances.push(controller);
    instances.push(this.instance);
    return instances;
  }

  private getDispatcher(): Dispatcher | undefined {
    const dispatcher = this.providers.get(Dispatcher) as InstanceWrapper<Dispatcher> | undefined;
    return dispatcher?.getInstance();
  }

  loadDependencies(): void {
    const instances = this.getAllInstances();
    for (const provider of instances) {
      if (provider.isAliasProvider()) {
        const aliasProvider = this.getInternalProvider(provider.getAliasToken());
        this.providers.set(provider.getToken(), aliasProvider);
        continue;
      }

      const dependencies = provider.getDependencies();
      for (let index = 0; index < dependencies.length; index++) {
        const dependency = dependencies[index];
        assert(dependency, `Unexpected dependency not found at index ${index}`);
        const instanceWrapper = this.getInternalProvider(dependency.token, dependency.optional);
        if (instanceWrapper) provider.setDependency(index, instanceWrapper);
        if (instanceWrapper?.isTransient() && dependency.contextId) instanceWrapper.loadPrototype(dependency.contextId);
      }
    }
  }

  async init(): Promise<void> {
    this.logger.debug(`Initializing module '${this.instance.getTokenName()}'`);

    /**
     * Loading the providers and controllers.
     * If a provider is transient, it will be loaded after all other providers.
     * This is to ensure that the transient provider instances are created only when they are needed.
     */

    const instances = this.getAllInstances();
    this.logger.debug(`Module '${this.instance.getTokenName()}' Provider initialization order: ${instances.map(i => i.getTokenName()).join(' -> ')}`);
    for (const provider of instances) {
      if (provider.isTransient()) await provider.loadAllInstances();
      else await provider.loadInstance();
    }

    /** Setting up the interceptors */
    const moduleRefProvider = this.getInternalProvider<ModuleRef>(ModuleRef);
    const moduleRef = moduleRefProvider.getInstance();
    for (const provider of instances) provider.applyInterceptorsToAllInstances(moduleRef);

    this.loadExports(true);
    await this.callHook(HookTypes.ON_MODULE_INIT);
    this.logger.info(`Module '${this.instance.getTokenName()}' initialized`);
  }

  private getParsedInternalMetadata(target: object): ParsedInternalMetadata {
    const internalMetadata: InternalOperationMetadata = Reflect.getMetadata(INTERNAL_OPERATION_METADATA, target) || {};

    let enabled = true;
    if (internalMetadata.enableIf !== undefined) enabled = typeof internalMetadata.enableIf === 'function' ? internalMetadata.enableIf() : internalMetadata.enableIf;

    return { enabled };
  }

  private getDispatchMetadata(controller: InstanceWrapper<Controller>): DispatchMetadata | null {
    /* Extracting the handler methods present in the instance */
    const methods = new Set<() => any>();
    const instance = controller.getInstance();
    let prototype = instance;
    do {
      for (const propertyName of Object.getOwnPropertyNames(prototype)) {
        const method = instance[propertyName];
        const isHandlerMethod = typeof method === 'function' && Reflect.hasMetadata(HANDLER_METADATA, method) && method !== instance.constructor;
        if (isHandlerMethod) methods.add(method);
      }
    } while ((prototype = Object.getPrototypeOf(prototype)));

    /* Extracting the handler metadata from the handler methods */
    const metatype = controller.getMetatype() as Class<Controller>;
    const metadata = Reflect.getMetadata(CONTROLLER_METADATA, metatype);
    const controllerHandlerMetadata = Reflect.getMetadata(HANDLER_METADATA, metatype);
    const internalControllerMetadata = this.getParsedInternalMetadata(metatype);
    if (!internalControllerMetadata.enabled) return null;

    const handlers: DispatchMetadata['handlers'] = [];
    for (const method of methods) {
      const internalMethodMetadata = this.getParsedInternalMetadata(method);
      if (!internalMethodMetadata.enabled) continue;

      const handlerName = method.name;
      const handlerMetadata = Reflect.getMetadata(HANDLER_METADATA, method);
      const metadata = merge<HandlerMetadata>(controllerHandlerMetadata, handlerMetadata);
      const paramtypes = Reflect.getMetadata(PARAMTYPES_METADATA, instance, handlerName);
      const returnType = Reflect.getMetadata(RETURN_TYPE_METADATA, instance, handlerName);
      handlers.push({ metadata, handler: method.bind(instance), paramtypes, returnType, handlerName });
    }

    return { metadata, metatype, handlers, instance };
  }

  async registerControllers(): Promise<void> {
    const dispatcher = this.getDispatcher();
    if (!dispatcher) return;

    this.logger.debug(`Registering controllers in module '${this.metatype.name}'`);
    const modules = this.getChildModules();
    const controllers = new Set(this.controllers);
    const dispatchMetadata: DispatchMetadata[] = [];
    modules.forEach(module => module.controllers.forEach(controller => controllers.add(controller)));

    for (const controller of controllers) {
      const metadata = this.getDispatchMetadata(controller);
      if (metadata) dispatchMetadata.push(metadata);
    }

    await dispatcher.register(dispatchMetadata);
    this.logger.debug(`Controllers registered in module '${this.metatype.name}'`);
  }

  async start(): Promise<void> {
    const dispatcher = this.getDispatcher();
    if (dispatcher) await dispatcher.start();
  }

  async stop(): Promise<void> {
    const dispatcher = this.getDispatcher();
    if (dispatcher) await dispatcher.stop();
  }

  async terminate(): Promise<void> {
    this.logger.debug(`Terminating module '${this.metatype.name}'`);
    await this.callHook(HookTypes.ON_MODULE_DESTROY);
    await this.disposeInstances();
    for (const provider of this.getAllInstances().reverse()) provider.clearInstance();
    this.logger.debug(`Module '${this.metatype.name}' terminated`);
  }

  private async disposeInstances(): Promise<void> {
    const instances = this.getAllInstances()
      .reverse()
      .flatMap(instance => instance.getAllInstances());
    for (const instance of instances) {
      const dispose = instance[Symbol.asyncDispose] ?? instance[Symbol.dispose];
      if (typeof dispose === 'function') await dispose.call(instance);
    }
  }

  async callHook(method: HookTypes): Promise<void> {
    const instances = this.getAllInstances().flatMap(instance => instance.getAllInstances());
    for (const instance of instances) {
      const methodFn = instance[method];
      if (typeof methodFn === 'function') await methodFn.call(instance);
    }
  }
}
