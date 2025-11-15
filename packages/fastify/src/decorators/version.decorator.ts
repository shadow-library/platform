/**
 * Importing npm packages
 */
import { Route } from '@shadow-library/app';
import { Integer } from 'type-fest';

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
  return Route({ version });
}
