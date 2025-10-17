/**
 * Importing npm packages
 */
import { Class } from 'type-fest';

/**
 * Importing user defined packages
 */
import { ModuleMetadata } from './module-metadata.interface';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export interface DynamicModule extends ModuleMetadata {
  /**
   * A module reference
   */
  module: Class<unknown>;
}
