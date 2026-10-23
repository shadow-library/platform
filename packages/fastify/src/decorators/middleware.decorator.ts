import assert from 'node:assert';

import { Controller } from '@shadow-library/app';

import { HTTP_CONTROLLER_TYPE } from '../constants';

export type MiddlewareType = 'onRequest' | 'preParsing' | 'preValidation' | 'preHandler' | 'preSerialization' | 'onSend' | 'onResponse' | 'onError';

export interface MiddlewareOptions {
  /** Fastify lifecycle hook the middleware runs in (https://fastify.dev/docs/latest/Reference/Lifecycle). Defaults to `preHandler`. */
  type: MiddlewareType;

  /** Execution order within the hook; the higher weight runs first. Defaults to `0`. */
  weight: number;
}

export interface MiddlewareMetadata extends MiddlewareOptions {
  [HTTP_CONTROLLER_TYPE]: 'middleware';
  generates: boolean;
}

const propertyKeys = ['generate', 'use'];

export function Middleware(options: Partial<MiddlewareOptions> = {}): ClassDecorator {
  if (!options.type) options.type = 'preHandler';
  if (!options.weight) options.weight = 0;

  return target => {
    const key = propertyKeys.find(key => key in target.prototype);
    assert(key, `Cannot apply @Middleware to a class without a 'generate()' or 'use()' method`);
    Controller({ ...options, [HTTP_CONTROLLER_TYPE]: 'middleware', generates: key === 'generate' })(target);
  };
}
