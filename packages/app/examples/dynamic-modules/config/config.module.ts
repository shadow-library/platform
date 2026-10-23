import { DynamicModule, Module } from '@shadow-library/app';

import { ConfigService } from './config.service';

export interface ConfigModuleOptions {
  folder: string;
}

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
