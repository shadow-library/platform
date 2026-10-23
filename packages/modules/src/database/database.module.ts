import { DynamicModule, Module } from '@shadow-library/app';

import { createDynamicModule } from '../internal.utils';
import { DATABASE_MODULE_OPTIONS } from './database.constants';
import { DatabaseService } from './database.service';
import { type DatabaseModuleAsyncOptions, type DatabaseModuleOptions } from './database.types';

@Module()
export class DatabaseModule {
  static forRoot(options: DatabaseModuleOptions): DynamicModule {
    return this.forRootAsync({ useFactory: () => options });
  }

  static forRootAsync(options: DatabaseModuleAsyncOptions): DynamicModule {
    return createDynamicModule(DatabaseModule, DATABASE_MODULE_OPTIONS, options, [DatabaseService]);
  }
}
