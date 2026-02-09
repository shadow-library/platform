/**
 * Importing npm packages
 */
import { DynamicModule, FactoryProvider, Module, Provider } from '@shadow-library/app';
import { Config } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { DATABASE_MODULE_OPTIONS } from './database.constants';
import { DatabaseService } from './database.service';
import { type DatabaseModuleAsyncOptions, type DatabaseModuleOptions } from './database.types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module()
export class DatabaseModule {
  static forRoot(options: DatabaseModuleOptions): DynamicModule {
    return this.forRootAsync({ useFactory: () => options });
  }

  static forRootAsync(options: DatabaseModuleAsyncOptions): DynamicModule {
    const optionsProvider: FactoryProvider = {
      token: DATABASE_MODULE_OPTIONS,
      useFactory: (...args: unknown[]) => {
        const resolvedOptions = options.useFactory(...args);
        if (resolvedOptions instanceof Promise) return resolvedOptions.then(opts => this.setDefaultOptions(opts));
        return this.setDefaultOptions(resolvedOptions as DatabaseModuleOptions);
      },
    };
    if (options.inject) optionsProvider.inject = options.inject;

    const providers: Provider[] = [optionsProvider, DatabaseService];
    const module: DynamicModule = { module: DatabaseModule, providers, exports: [DatabaseService] };
    if (options.imports) module.imports = options.imports;

    return module;
  }

  private static setDefaultOptions(options: DatabaseModuleOptions): DatabaseModuleOptions {
    if (options.postgres?.type === 'bun-sql') {
      Config.load('database.postgres.max-connections', { validateType: 'number' });
      const maxConnections = Config.get('database.postgres.max-connections');
      if (maxConnections) options.postgres.connection = { max: maxConnections, ...options.postgres.connection };
    }

    return options;
  }
}
