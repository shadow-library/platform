/**
 * Importing npm packages
 */
import { DynamicModule, Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { createDynamicModule } from '../internal.utils';
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
    return createDynamicModule(DatabaseModule, DATABASE_MODULE_OPTIONS, options, [DatabaseService]);
  }
}
