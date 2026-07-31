/**
 * Importing npm packages
 */
import { Class, Promisable } from 'type-fest';
import { DynamicModule, FactoryProvider, ModuleMetadata } from '@shadow-library/app';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export interface AsyncModuleOptions<TOptions> extends Pick<ModuleMetadata, 'imports'>, Pick<FactoryProvider, 'inject'> {
  /** Factory that builds the module options; values resolved from the `inject` tokens arrive as arguments */
  useFactory: (...args: any[]) => Promisable<TOptions>;
}

/**
 * Declaring the constants
 */

/** Builds the `forRootAsync` dynamic module shared by all configurable modules: an options provider plus the module's services, all exported */
export function createDynamicModule<TOptions extends object>(
  module: Class<unknown>,
  token: symbol,
  options: AsyncModuleOptions<TOptions>,
  services: Class<unknown>[],
): DynamicModule {
  const optionsProvider: FactoryProvider = { token, useFactory: options.useFactory };
  if (options.inject) optionsProvider.inject = options.inject;

  const dynamicModule: DynamicModule = { module, providers: [optionsProvider, ...services], exports: services };
  if (options.imports) dynamicModule.imports = options.imports;

  return dynamicModule;
}
