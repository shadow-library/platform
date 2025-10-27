/**
 * Importing npm packages
 */
import assert from 'node:assert';

import { InternalError, Logger } from '@shadow-library/common';
import { Class } from 'type-fest';

/**
 * Importing user defined packages
 */
import { DIErrors, DependencyGraph } from './helpers';
import { HookTypes, Module } from './module';
import { MODULE_METADATA, NAMESPACE } from '../constants';
import { DynamicModule, ModuleMetadata } from '../interfaces';

/**
 * Defining types
 */

type TModule = Class<unknown>;

type TParsedModule = TModule | DynamicModule;

interface ParsedModuleMetadata extends ModuleMetadata {
  isNoop?: boolean;
  isDynamic?: boolean;
  module: TModule;
  imports?: TParsedModule[];
}

/**
 * Declaring the constants
 */
const getModuleClass = (module: TParsedModule): TModule => ('module' in module ? module.module : module);
const isDynamicModule = (module: TParsedModule): module is DynamicModule => 'module' in module;

export class ModuleRegistry {
  private readonly logger = Logger.getLogger(NAMESPACE, 'ModuleRegistry');
  private readonly modules = new Map<TModule, Module>();

  constructor(root: TModule) {
    const modules = this.scan(root);
    for (const module of modules) this.modules.set(module.getMetatype(), module);
  }

  private extractMetadata(module: TParsedModule): ParsedModuleMetadata {
    const Class = getModuleClass(module);
    const metadata: ModuleMetadata = 'module' in module ? module : Reflect.getMetadata(MODULE_METADATA, module);
    if (Object.keys(metadata).length === 0) return { module: Class, isNoop: true };

    const imports = metadata.imports ?? [];
    const index = imports.findIndex(m => m === undefined);
    if (index !== -1) return DIErrors.undefinedDependency(Class, index);

    const modules = imports.map(m => ('forwardRef' in m ? m.forwardRef() : m));
    for (const mod of modules) {
      const ModuleClass = getModuleClass(mod);
      const isModule = Reflect.hasMetadata(MODULE_METADATA, ModuleClass);
      if (!isModule) throw new InternalError(`Class '${ModuleClass.name}' is not a module, but is imported by '${Class.name}'`);
    }

    return { ...metadata, module: Class, imports: modules };
  }

  private scan(module: TModule): Module[] {
    const graph = new DependencyGraph<TModule>();
    const modules = new Map<TModule, Module>();
    const moduleMetadata = new Map<TModule, ParsedModuleMetadata>();

    /** Scan all the imports to find all the modules, especially dynamic ones which could be configured later */
    const scanModule = (module: TParsedModule): void => {
      const isDynamic = isDynamicModule(module);
      const metadata = this.extractMetadata(module);
      const existingMetadata = moduleMetadata.get(metadata.module);
      if (existingMetadata && !isDynamic) return;
      if (existingMetadata && !existingMetadata.isNoop) DIErrors.duplicateDynamicModule(metadata.module);
      modules.set(metadata.module, new Module(metadata.module, metadata));
      moduleMetadata.set(metadata.module, { ...metadata, isDynamic });
      metadata.imports?.forEach(imp => scanModule(imp));
    };

    scanModule(module);
    for (const [ModuleClass, metadata] of moduleMetadata.entries()) {
      const module = modules.get(ModuleClass);
      graph.addNode(ModuleClass);
      assert(module, DIErrors.unexpected(`Module '${ModuleClass.name}' not found in registry while processing its dependencies`));
      for (const dependency of metadata.imports ?? []) {
        const Class = getModuleClass(dependency);
        const dependencyModule = modules.get(Class);
        assert(dependencyModule, DIErrors.unexpected(`Dependency module '${Class.name}' not found while processing module '${ModuleClass.name}'`));
        module.addImport(dependencyModule);
        graph.addDependency(ModuleClass, Class);
      }
      module.loadDependencies();
    }

    const initOrder = graph.getInitOrder();
    this.logger.debug(`Module initialization order: ${initOrder.map(m => m.name).join(', ')}`);
    return initOrder.map(m => modules.get(m) as Module);
  }

  async init(): Promise<void> {
    this.logger.debug('Initializing the modules');
    const modules = Array.from(this.modules.values());
    for (const module of modules) await module.init();
    this.logger.debug('Modules initialized');

    for (const module of modules) await module.registerRoutes();
    this.logger.debug('Routes registered');

    for (const module of modules) await module.callHook(HookTypes.ON_APPLICATION_READY);
    this.logger.debug('Application ready');
  }

  async terminate(): Promise<void> {
    this.logger.debug('Terminating the modules');
    const modules = Array.from(this.modules.values()).reverse();
    for (const module of modules) await module.callHook(HookTypes.ON_APPLICATION_STOP);

    for (const module of modules) await module.stop();
    this.logger.debug('Routes stopped');

    for (const module of modules) await module.terminate();
    this.logger.debug('Modules terminated');
  }

  get(): Module[];
  get(module: TModule): Module;
  get(module?: TModule): Module | Module[] {
    if (!module) return Array.from(this.modules.values());
    const mod = this.modules.get(module);
    if (!mod) throw new InternalError(`Module '${module.name}' not found`);
    return mod;
  }
}
