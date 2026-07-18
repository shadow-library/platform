/**
 * Importing npm packages
 */

import { JsonObject } from 'type-fest';
import { Handler } from '@shadow-library/app';
import { JSONSchema, SchemaClass } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export interface DynamicRender<T extends JsonObject> {
  template: string;
  data: T;
}

/**
 * Declaring the constants
 */
export const HttpStatus = (status: number): MethodDecorator => Handler({ status });

export const Header = (name: string, value: string | (() => string)): MethodDecorator => Handler({ headers: { [name]: value } });

export const Redirect = (redirect: string, status = 301): MethodDecorator => Handler({ redirect, status });

export const Render = (render?: string): MethodDecorator => Handler({ render: render ?? true });

export function RespondFor(statusCode: number, schema: SchemaClass | JSONSchema): MethodDecorator {
  return Handler({ schemas: { response: { [statusCode]: schema } } });
}
