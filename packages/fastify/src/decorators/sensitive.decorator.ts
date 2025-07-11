/**
 * Importing npm packages
 */
import { FieldMetadata } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export function Sensitive(): PropertyDecorator {
  return (target, propertyKey) => {
    const decorator = FieldMetadata({ 'x-fastify': { sensitive: true } });
    decorator(target, propertyKey);
  };
}
