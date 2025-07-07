/**
 * Importing npm packages
 */
import { Reflector } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { SENSITIVE_FIELDS_METADATA } from '../constants';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export function Sensitive(): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    Reflector.appendMetadata(SENSITIVE_FIELDS_METADATA, propertyKey, target.constructor);
  };
}
