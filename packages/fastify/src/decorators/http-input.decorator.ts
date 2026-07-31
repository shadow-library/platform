/**
 * Importing npm packages
 */
import assert from 'node:assert';

import { Handler } from '@shadow-library/app';
import { JSONSchema, SchemaClass } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */
import { HTTP_CONTROLLER_INPUTS, PARAMTYPES_METADATA } from '../constants';

/**
 * Defining types
 */

export enum RouteInputType {
  BODY = 'body',
  PARAMS = 'params',
  QUERY = 'query',
  HEADERS = 'headers',
  COOKIES = 'cookies',
  RAW_BODY = 'rawBody',
  REQUEST = 'request',
  RESPONSE = 'response',
}

export type RouteInputSchemas = Partial<Record<'body' | 'params' | 'query', JSONSchema | SchemaClass>>;

/**
 * Declaring the constants
 */

export function HttpInput(type: RouteInputType, schema?: JSONSchema): ParameterDecorator {
  return (target, propertyKey, index) => {
    assert(propertyKey, 'Cannot apply decorator to a constructor parameter');

    const inputs = Reflect.getMetadata(HTTP_CONTROLLER_INPUTS, target, propertyKey) ?? [];
    Reflect.defineMetadata(HTTP_CONTROLLER_INPUTS, inputs, target, propertyKey);
    inputs[index] = type;

    if (!schema) {
      const paramTypes = Reflect.getMetadata(PARAMTYPES_METADATA, target, propertyKey);
      schema = paramTypes[index];
    }

    const descriptor = Reflect.getOwnPropertyDescriptor(target, propertyKey);
    assert(descriptor, 'Cannot apply decorator to a non-method');
    Handler({ schemas: { [type]: schema } })(target, propertyKey, descriptor);
  };
}

export const Body = (schema?: JSONSchema): ParameterDecorator => HttpInput(RouteInputType.BODY, schema);

export const Params = (schema?: JSONSchema): ParameterDecorator => HttpInput(RouteInputType.PARAMS, schema);

export const Query = (schema?: JSONSchema): ParameterDecorator => HttpInput(RouteInputType.QUERY, schema);

export const Headers = (): ParameterDecorator => HttpInput(RouteInputType.HEADERS);

/** Injects the untouched request body buffer and flags the route so the buffer is captured during parsing. */
export function RawBody(): ParameterDecorator {
  return (target, propertyKey, index) => {
    assert(propertyKey, 'Cannot apply @RawBody to a constructor parameter');
    HttpInput(RouteInputType.RAW_BODY)(target, propertyKey, index);
    const descriptor = Reflect.getOwnPropertyDescriptor(target, propertyKey);
    assert(descriptor, 'Cannot apply @RawBody to a non-method');
    Handler({ rawBody: true })(target, propertyKey, descriptor);
  };
}

/**
 * Injects the parsed request cookies and flags the route to enable cookie parsing.
 * Requires the optional `@fastify/cookie` peer dependency — the module loads it lazily only when a route uses `@Cookie`.
 */
export function Cookie(): ParameterDecorator {
  return (target, propertyKey, index) => {
    assert(propertyKey, 'Cannot apply @Cookie to a constructor parameter');
    HttpInput(RouteInputType.COOKIES)(target, propertyKey, index);
    const descriptor = Reflect.getOwnPropertyDescriptor(target, propertyKey);
    assert(descriptor, 'Cannot apply @Cookie to a non-method');
    Handler({ cookies: true })(target, propertyKey, descriptor);
  };
}

export const Request = (): ParameterDecorator => HttpInput(RouteInputType.REQUEST);
export const Req = Request;

export const Response = (): ParameterDecorator => HttpInput(RouteInputType.RESPONSE);
export const Res = Response;
