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
import { ModuleMetadata } from '../decorators';
import { ForwardReference } from '../utils';

/**
 * Defining types
 */

type TModule = Class<unknown>;

type Import = Class<unknown> | ForwardReference<Class<unknown>>;

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
      const isModule = Reflect.hasMetadata(MODULE_METADATA, mod);
      if (!isModule) throw new InternalError(`Class '${mod.name}' is not a module, but is imported by '${module.name}'`);
    }

    return imports;
  }

  private scan(module: TModule): Module[] {
    const graph = new DependencyGraph<TModule>();
    const modules = new Map<TModule, Module>();

    const scanModule = (module: TModule): Module => {
      if (modules.has(module)) return modules.get(module) as Module;
      graph.addNode(module);

      this.logger.debug(`Scanning module '${module.name}'`);
      const imports: TModule[] = [];
      for (const mod of this.reflectImports(module)) {
        if ('forwardRef' in mod) imports.push(mod.forwardRef());
        else {
          graph.addDependency(module, mod);
          imports.push(mod);
        }
      }

      const instance = new Module(module);
      modules.set(module, instance);
      const dependencies = imports.map(m => scanModule(m));
      dependencies.forEach(d => instance.addImport(d));
      instance.loadDependencies();

      this.logger.debug(`Module '${module.name}' scanned`);

      return instance;
    };

    scanModule(module);
    const initOrder = graph.getInitOrder();
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
