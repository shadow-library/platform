import assert from 'node:assert';

import { Reflector } from '@shadow-library/common';

import { INTERNAL_OPERATION_METADATA } from '@lib/constants';

export type EnableIfCondition = boolean | (() => boolean);

export function EnableIf(condition: EnableIfCondition): ClassDecorator & MethodDecorator {
  return (target: object, _propertyKey?: string | symbol, descriptor?: TypedPropertyDescriptor<any>): void => {
    const object = descriptor ? descriptor.value : target;
    assert(object, 'EnableIf decorator can only be applied to class or method');
    Reflector.updateMetadata(INTERNAL_OPERATION_METADATA, { enableIf: condition }, object);
  };
}
