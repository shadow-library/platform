import { Class, Promisable } from 'type-fest';
import { DynamicModule, FactoryProvider, ModuleMetadata } from '@shadow-library/app';

export interface AsyncModuleOptions<TOptions> extends Pick<ModuleMetadata, 'imports'>, Pick<FactoryProvider, 'inject'> {
  useFactory: (...args: any[]) => Promisable<TOptions>;
}

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
