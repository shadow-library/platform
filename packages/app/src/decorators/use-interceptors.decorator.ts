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

export function UseInterceptors(...interceptors: Class<unknown>[]): ClassDecorator & MethodDecorator {
  return (target: object, _propertyKey?: string | symbol, descriptor?: TypedPropertyDescriptor<any>): void => {
    const object = descriptor ? descriptor.value : target;
    assert(object, 'UseInterceptors decorator can only be applied to class or method');
    assert(interceptors.length > 0, 'UseInterceptors decorator requires at least one interceptor class');
    for (let index = interceptors.length - 1; index >= 0; index--) {
      const interceptor = interceptors[index];
      Reflector.appendMetadata(INTERCEPTOR_METADATA, interceptor, object);
    }
  };
}
