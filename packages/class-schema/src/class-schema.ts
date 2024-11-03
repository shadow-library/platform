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
const schemas = new Map<Class<unknown>, JSONSchema>();

export function getSchema(identifier: Class<unknown>): JSONSchema {
  if (schemas.has(identifier)) return schemas.get(identifier)!;
  return {};
}
