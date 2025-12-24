/**
 * Importing npm packages
 */
import assert from 'node:assert';

import { Reflector } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { INTERNAL_OPERATION_METADATA } from '@lib/constants';

/**
 * Defining types
 */

export type EnableIfCondition = boolean | (() => boolean);

/**
 * Declaring the constants
 */

export function EnableIf(condition: EnableIfCondition): ClassDecorator & MethodDecorator {
  return (target: object, _propertyKey?: string | symbol, descriptor?: TypedPropertyDescriptor<any>): void => {
    const object = descriptor ? descriptor.value : target;
    assert(object, 'EnableIf decorator can only be applied to class or method');
    Reflector.updateMetadata(INTERNAL_OPERATION_METADATA, { enableIf: condition }, object);
  };
}
