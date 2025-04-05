/* eslint-disable @typescript-eslint/no-invalid-void-type, @typescript-eslint/no-wrapper-object-types */
/**
 * Importing npm packages
 */
import merge from 'deepmerge';
import { Class } from 'type-fest';

/**
 * Importing user defined packages
 */
import { DESIGN_TYPE_METADATA, FIELD_OPTIONS_METADATA, FIELD_TYPE_METADATA, Integer, SCHEMA_FIELDS_METADATA } from '@lib/constants';
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
export function Field(returnTypeFn: (returns?: void) => Class<Number | Integer>, options?: NumberFieldSchema): PropertyDecorator;
export function Field(returnTypeFn: (returns?: void) => Class<Boolean>, options?: BooleanFieldSchema): PropertyDecorator;
export function Field(returnTypeFn: (returns?: void) => Class<any>, options?: ObjectFieldSchema): PropertyDecorator;
export function Field(returnTypeFn: (returns?: void) => Class<any>[], options?: ArrayFieldSchema): PropertyDecorator;
export function Field(typeOrOptions?: ReturnTypeFunc | FieldSchema, fieldOptions?: FieldSchema): PropertyDecorator {
  const isTypeFn = typeof typeOrOptions === 'function';
  const options = (isTypeFn ? fieldOptions : typeOrOptions) ?? {};

  return (target, propertyKey) => {
    if (typeof propertyKey === 'symbol') throw new Error(`Cannot apply @Field() to symbol ${propertyKey.toString()}`);
    const reflectedType = Reflect.getMetadata(DESIGN_TYPE_METADATA, target, propertyKey);
    const getType = isTypeFn ? typeOrOptions : () => reflectedType;
    Reflect.defineMetadata(FIELD_TYPE_METADATA, getType, target, propertyKey);

    const fields: string[] = Reflect.getMetadata(SCHEMA_FIELDS_METADATA, target) ?? [];
    Reflect.defineMetadata(SCHEMA_FIELDS_METADATA, fields.concat([propertyKey]), target);

    const oldOptions = Reflect.getMetadata(FIELD_OPTIONS_METADATA, target, propertyKey) ?? {};
    const newOptions = merge.all([{}, oldOptions, options]);
    Reflect.defineMetadata(FIELD_OPTIONS_METADATA, newOptions, target, propertyKey);
  };
}
