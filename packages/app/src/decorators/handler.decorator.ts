/**
 * Importing npm packages
 */
import assert from 'node:assert';

import { Reflector, UpdateMetadataOptions } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { HANDLER_METADATA } from '../constants';

/**
 * Defining types
 */

/* eslint-disable-next-line @typescript-eslint/no-empty-object-type */
export interface HandlerMetadata extends Record<string | symbol, any> {}

/**
 * Declaring the constants
 */

export function Handler(metadata: HandlerMetadata = {}, options?: UpdateMetadataOptions): ClassDecorator & MethodDecorator {
  return (target: object, _propertyKey?: string | symbol, descriptor?: TypedPropertyDescriptor<any>): void => {
    const object = descriptor ? descriptor.value : target;
    assert(object, 'Handler decorator can only be applied to class or method');
    Reflector.updateMetadata(HANDLER_METADATA, metadata, object, undefined, options);
  };
}
