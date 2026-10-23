import { Class } from 'type-fest';

import { ForwardReference } from '../utils';
import { Provider, ProviderToken } from './provider.interface';

export type Import = Class<unknown> | ForwardReference<Class<unknown>> | DynamicModule;

export interface ModuleMetadata {
  /** Modules whose exported providers this module needs. */
  imports?: Import[];

  controllers?: Class<unknown>[];

  providers?: Provider[];

  /** Subset of `providers` that importing modules can inject. */
  exports?: ProviderToken[];
}

export interface DynamicModule extends ModuleMetadata {
  module: Class<unknown>;
}
