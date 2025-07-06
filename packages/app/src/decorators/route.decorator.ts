/**
 * Importing npm packages
 */
import assert from 'node:assert';

import merge from 'deepmerge';

/**
 * Importing user defined packages
 */
import { ROUTE_METADATA } from '../constants';

/**
 * Defining types
 */

/* eslint-disable-next-line @typescript-eslint/no-empty-object-type */
export interface RouteMetadata extends Record<string | symbol, any> {}

/**
 * Declaring the constants
 */

export function Route(metadata: RouteMetadata = {}): ClassDecorator & MethodDecorator {
  return (target: object, _propertyKey?: string | symbol, descriptor?: TypedPropertyDescriptor<any>): void => {
    const object = descriptor ? descriptor.value : target;
    assert(object, 'Route decorator can only be applied to class or method');

    const oldMetadata = Reflect.getMetadata(ROUTE_METADATA, object) ?? {};
    const newMetadata = merge(oldMetadata, metadata);
    Reflect.defineMetadata(ROUTE_METADATA, newMetadata, object);
  };
}
