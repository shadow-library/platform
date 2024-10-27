/**
 * Importing npm packages
 */
import { Class } from 'type-fest';

/**
 * Importing user defined packages
 */
import { JSONSchema, JSONSchemaType } from '@lib/types';
import { DESIGN_TYPE_METADATA, SCHEMA_METADATA } from '@lib/constants';

/**
 * Defining types
 */

export type FieldType = Class<any> | [Class<any>];

export type ReturnTypeFunc = (returns?: void) => FieldType;

export type FieldOptions = Partial<JSONSchema>;

/**
 * Declaring the constants
 */

export function Field(options?: FieldOptions): PropertyDecorator;
export function Field(returnTypeFn?: ReturnTypeFunc, options?: FieldOptions): PropertyDecorator;
export function Field(typeOrOptions?: ReturnTypeFunc | FieldOptions, fieldOptions?: FieldOptions): PropertyDecorator {
  const isTypeFn = typeof typeOrOptions === 'function';
  const options = isTypeFn ? fieldOptions : typeOrOptions;

  return (target, propertyKey) => {
    const type = isTypeFn ? typeOrOptions() : Reflect.getMetadata(DESIGN_TYPE_METADATA, target, propertyKey);

    const schema = options ?? {};
    schema.type = Array.isArray(type) ? 'array' : getFieldType(type);
    if (schema.type === 'array') schema.items = { type: getFieldType(type[0]) };

    Reflect.defineMetadata(SCHEMA_METADATA, schema, target, propertyKey);
  };
}

function getFieldType(type: Class<unknown>): JSONSchemaType {
  switch (type) {
    case String:
      return 'string';

    case Number:
      return 'number';

    case Boolean:
      return 'boolean';

    case Array:
      return 'array';

    default:
      return 'object';
  }
}
