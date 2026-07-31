/**
 * Importing npm packages
 */
import { Reflector } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { OPTIONAL_DEPS_METADATA } from '../constants';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export function Optional(): ParameterDecorator {
  return (target, _key, index) => Reflector.appendMetadata(OPTIONAL_DEPS_METADATA, index, target);
}
