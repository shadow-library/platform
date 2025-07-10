/**
 * Importing npm packages
 */
import assert from 'node:assert';

import { Reflector } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { METADATA_KEYS } from '@lib/constants';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export function FieldMetadata(options: Record<string, any>): PropertyDecorator {
  return (target, propertyKey) => {
    assert(typeof propertyKey === 'string', `Cannot apply @Field() to symbol ${propertyKey.toString()}`);
    Reflector.updateMetadata(METADATA_KEYS.FIELD_OPTIONS, options, target, propertyKey);
  };
}
