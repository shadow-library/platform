import { Class, Promisable } from 'type-fest';
import { DynamicModule, FactoryProvider, ModuleMetadata } from '@shadow-library/app';

/** Carries each completed Postgres query's duration in milliseconds (a bare number) from `DatabaseService` to the per-request metrics of `HttpCoreModule` */
export const QUERY_CHANNEL = '@shadow-library/modules/database:query';

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
