/**
 * Importing npm packages
 */
import { Class } from 'type-fest';

/**
 * Importing user defined packages
 */
import { JSONSchema } from './types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export class ClassSchema {
  private readonly schemas = new Map<Class<unknown>, JSONSchema>();

  constructor(private readonly cacheSchema: boolean = true) {}
}
