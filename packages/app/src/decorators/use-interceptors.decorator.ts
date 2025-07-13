/**
 * Importing npm packages
 */
import assert from 'node:assert';

import { Reflector } from '@shadow-library/common';
import { Class } from 'type-fest';

/**
 * Importing user defined packages
 */
import { INTERCEPTOR_METADATA } from '../constants';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export function UseInterceptors(...interceptors: Class<unknown>[]): MethodDecorator {
  return (_target: object, _propertyKey: string | symbol, descriptor: TypedPropertyDescriptor<any>): void => {
    assert(typeof descriptor.value === 'function', 'UseInterceptors decorator can only be applied to method');
    assert(interceptors.length > 0, 'UseInterceptors decorator requires at least one interceptor class');
    for (let index = interceptors.length - 1; index >= 0; index--) {
      const interceptor = interceptors[index];
      Reflector.appendMetadata(INTERCEPTOR_METADATA, interceptor, descriptor.value);
    }
  };
}
