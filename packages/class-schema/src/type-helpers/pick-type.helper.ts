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

export function PickType<T, K extends keyof T>(Class: Class<T>, keys: readonly K[]): Class<Pick<T, K>> {
  const filter = (key: string) => keys.includes(key as K);
  return cloneClassSchema(Class, {}, filter) as Class<Pick<T, K>>;
}
