/**
 * Importing npm packages
 */
import { InternalError, Logger } from '@shadow-library/common';
import { Class } from 'type-fest';

/**
 * Importing user defined packages
 */
import { DIErrors, DependencyGraph } from './helpers';
import { HookTypes, Module } from './module';
import { MODULE_METADATA, NAMESPACE } from '../constants';
import { Import, ModuleMetadata } from '../interfaces';

/**
 * Defining types
 */

type TModule = Class<unknown>;

interface ParsedImport {
  module: TModule;
  metadata?: ModuleMetadata;
}

/**
 * Declaring the constants
 */

export class ModuleRegistry {
  private readonly logger = Logger.getLogger(NAMESPACE, 'ModuleRegistry');
  private readonly modules = new Map<TModule, Module>();

  constructor(root: TModule) {
    const modules = this.scan(root);
    for (const module of modules) this.modules.set(module.getMetatype(), module);
  }

  private reflectImports(module: TModule): Import[] {
    const metadata: ModuleMetadata = Reflect.getMetadata(MODULE_METADATA, module);
    const imports = metadata.imports ?? [];
    const index = imports.findIndex(m => m === undefined);
    if (index !== -1) return DIErrors.undefinedDependency(module, index);

    const modules = imports.map(m => ('forwardRef' in m ? m.forwardRef() : m));
    for (const mod of modules) {
      const ModuleClass = 'module' in mod ? mod.module : mod;
      const isModule = Reflect.hasMetadata(MODULE_METADATA, ModuleClass);
      if (!isModule) throw new InternalError(`Class '${ModuleClass.name}' is not a module, but is imported by '${module.name}'`);
    }

    return imports;
  }

  private scan(module: TModule): Module[] {
    const graph = new DependencyGraph<TModule>();
    const modules = new Map<TModule, Module>();

    const scanModule = (module: TModule, metadata?: ModuleMetadata): Module => {
      if (modules.has(module) && metadata) {
        throw new InternalError(
          `Module '${module.name}' with dynamic configuration has already been registered. Dynamic modules must be imported only once with their metadata configuration. To reuse this module elsewhere, import the module class directly in the module's imports array.`,
        );
      }

      if (modules.has(module)) return modules.get(module) as Module;
      graph.addNode(module);

      this.logger.debug(`Scanning module '${module.name}'`);
      const imports: ParsedImport[] = [];
      const deps = metadata ? (metadata.imports ?? []) : this.reflectImports(module);
      for (const mod of deps) {
        if ('forwardRef' in mod) imports.push({ module: mod.forwardRef() });
        else {
          const parsedModule: ParsedImport = 'module' in mod ? { module: mod.module, metadata: mod } : { module: mod };
          if (!metadata) graph.addDependency(module, parsedModule.module);
          imports.push(parsedModule);
        }
      }

      const instance = new Module(module, metadata);
      modules.set(module, instance);
      const dependencies = imports.map(m => scanModule(m.module, m.metadata));
      dependencies.forEach(d => instance.addImport(d));
      instance.loadDependencies();

      this.logger.debug(`Module '${module.name}' scanned`);

      return instance;
    };

    scanModule(module);
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
