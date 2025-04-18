/* eslint-disable @typescript-eslint/no-invalid-void-type, @typescript-eslint/no-wrapper-object-types */
/**
 * Importing npm packages
 */
import { Reflector } from '@shadow-library/common';
import { Class } from 'type-fest';

/**
 * Importing user defined packages
 */
import { Integer, METADATA_KEYS } from '@lib/constants';
import { ArrayFieldSchema, BooleanFieldSchema, FieldSchema, NumberFieldSchema, ObjectFieldSchema, StringFieldSchema } from '@lib/interfaces';

/**
 * Defining types
 */

export type ReturnTypeFunc = (returns?: void) => Class<any> | Class<any>[];

/**
 * Declaring the constants
 */

export function Field(options?: FieldSchema): PropertyDecorator;
export function Field(returnTypeFn: (returns?: void) => Class<String>, options?: StringFieldSchema): PropertyDecorator;
export function Field(returnTypeFn: (returns?: void) => Class<Boolean>, options?: BooleanFieldSchema): PropertyDecorator;
export function Field(returnTypeFn: (returns?: void) => Class<Number>, options?: NumberFieldSchema): PropertyDecorator;
export function Field(returnTypeFn: (returns?: void) => Class<any>, options?: ObjectFieldSchema): PropertyDecorator;
export function Field(returnTypeFn: (returns?: void) => Class<any>[], options?: ArrayFieldSchema): PropertyDecorator;
export function Field(returnTypeFn: (returns?: void) => Class<Integer>, options?: NumberFieldSchema): PropertyDecorator; // eslint-disable-line @typescript-eslint/unified-signatures
export function Field(typeOrOptions?: ReturnTypeFunc | FieldSchema, fieldOptions?: FieldSchema): PropertyDecorator {
  const isTypeFn = typeof typeOrOptions === 'function';
  const options = (isTypeFn ? fieldOptions : typeOrOptions) ?? {};

  return (target, propertyKey) => {
    if (typeof propertyKey === 'symbol') throw new Error(`Cannot apply @Field() to symbol ${propertyKey.toString()}`);
    const reflectedType = Reflect.getMetadata(METADATA_KEYS.DESIGN_TYPE, target, propertyKey);
    const getType = isTypeFn ? typeOrOptions : () => reflectedType;
    Reflect.defineMetadata(METADATA_KEYS.FIELD_TYPE, getType, target, propertyKey);

    const fields: string[] = Reflect.getMetadata(METADATA_KEYS.SCHEMA_FIELDS, target) ?? [];
    Reflect.defineMetadata(METADATA_KEYS.SCHEMA_FIELDS, fields.concat([propertyKey]), target);
    Reflector.updateMetadata(METADATA_KEYS.FIELD_OPTIONS, options, target, propertyKey);
  };
}
