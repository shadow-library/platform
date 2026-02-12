/**
 * Importing npm packages
 */
import { DynamicModule, FactoryProvider, Module, Provider } from '@shadow-library/app';

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
    const optionsProvider: FactoryProvider = { token: DATABASE_MODULE_OPTIONS, useFactory: options.useFactory };
    if (options.inject) optionsProvider.inject = options.inject;

    const providers: Provider[] = [optionsProvider, DatabaseService];
    const module: DynamicModule = { module: DatabaseModule, providers, exports: [DatabaseService] };
    if (options.imports) module.imports = options.imports;

    return module;
  }
}
