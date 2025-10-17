/**
 * Importing npm packages
 */
import { Class } from 'type-fest';

/**
 * Importing user defined packages
 */
import { InjectionToken, Provider } from './provider.interface';
import { ForwardReference } from '../utils';
import { DynamicModule } from './dynamic-module.interface';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export type Import = Class<unknown> | ForwardReference<Class<unknown>> | DynamicModule;

export interface ModuleMetadata {
  /**
   * List of imported modules that export the providers which are required in this module.
   */
  imports?: Import[];

  /**
   * List of controllers defined in this module which have to be instantiated.
   */
  controllers?: Class<unknown>[];

  /**
   * List of providers that will be instantiated by the Shadow injector and that may be shared
   * at least across this module.
   */
  providers?: Provider[];

  /**
   * List of the subset of providers that are provided by this module and should be available
   * in other modules which import this module.
   */
  exports?: InjectionToken[];
}
