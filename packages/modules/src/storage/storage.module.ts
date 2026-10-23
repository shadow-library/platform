import { DynamicModule, Module } from '@shadow-library/app';

import { createDynamicModule } from '../internal.utils';
import { STORAGE_MODULE_OPTIONS } from './storage.constants';
import { StorageService } from './storage.service';
import { type StorageModuleAsyncOptions, type StorageModuleOptions } from './storage.types';

@Module()
export class StorageModule {
  static forRoot(options: StorageModuleOptions = {}): DynamicModule {
    return this.forRootAsync({ useFactory: () => options });
  }

  static forRootAsync(options: StorageModuleAsyncOptions): DynamicModule {
    return createDynamicModule(StorageModule, STORAGE_MODULE_OPTIONS, options, [StorageService]);
  }
}
