/**
 * Importing npm packages
 */
import { Integer } from 'type-fest';
import { Handler } from '@shadow-library/app';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export function Version<T extends number>(version: Integer<T>): ClassDecorator & MethodDecorator {
  return Handler({ version });
}
