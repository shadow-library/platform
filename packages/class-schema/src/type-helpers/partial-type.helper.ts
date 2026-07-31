/**
 * Importing npm packages
 */
import { Class } from 'type-fest';

/**
 * Importing user defined packages
 */
import { cloneClassSchema } from './mapped-types.utils';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export function PartialType<T>(Class: Class<T>): Class<Partial<T>> {
  return cloneClassSchema(Class, { optional: true }) as Class<Partial<T>>;
}
