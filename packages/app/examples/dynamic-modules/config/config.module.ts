/**
 * Importing npm packages
 */
import { DynamicModule, Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { ConfigService } from './config.service';

/**
 * Defining types
 */

export interface ConfigModuleOptions {
  folder: string;
}

/**
 * Declaring the constants
 */

@Module({})
export class ConfigModule {
  static register(options: ConfigModuleOptions): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ token: 'CONFIG_OPTIONS', useValue: options }, ConfigService],
      exports: [ConfigService],
    };
  }
}
