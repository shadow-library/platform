/**
 * Importing npm packages
 */
import { Class } from 'type-fest';
import merge from 'deepmerge';

/**
 * Importing user defined packages
 */
import { JSONArraySchema, JSONBasicSchema, JSONNumberSchema, JSONObjectSchema, JSONSchema, JSONStringSchema } from '@lib/types';
import { DESIGN_TYPE_METADATA, FIELD_OPTIONS_METADATA, FIELD_TYPE_METADATA } from '@lib/constants';

/**
 * Defining types
 */

export type FieldType = Class<any> | Class<any>[];

export type ReturnTypeFunc = (returns?: void) => FieldType;

export type FieldOptions = Partial<JSONSchema>;

/**
 * Declaring the constants
 */

export function Field(options?: FieldOptions): PropertyDecorator;
export function Field(returnTypeFn: (returns?: void) => Class<String>, options?: Partial<JSONStringSchema>): PropertyDecorator;
export function Field(returnTypeFn: (returns?: void) => Class<Number>, options?: Partial<JSONNumberSchema>): PropertyDecorator;
export function Field(returnTypeFn: (returns?: void) => Class<Boolean>, options?: Partial<JSONBasicSchema>): PropertyDecorator;
export function Field(returnTypeFn: (returns?: void) => Class<any>, options?: Partial<JSONObjectSchema>): PropertyDecorator;
export function Field(returnTypeFn: (returns?: void) => Class<any>[], options?: Partial<JSONArraySchema>): PropertyDecorator;
export function Field(typeOrOptions?: ReturnTypeFunc | FieldOptions, fieldOptions?: FieldOptions): PropertyDecorator {
  const isTypeFn = typeof typeOrOptions === 'function';
  const options = isTypeFn ? fieldOptions : typeOrOptions;

  return (target, propertyKey) => {
    const type = isTypeFn ? typeOrOptions() : Reflect.getMetadata(DESIGN_TYPE_METADATA, target, propertyKey);
    Reflect.defineMetadata(FIELD_TYPE_METADATA, type, target, propertyKey);

    if (!options) return;
    const oldOptions = Reflect.getMetadata(FIELD_OPTIONS_METADATA, target, propertyKey) ?? {};
    const newOptions = merge.all([{}, oldOptions, options]);
    Reflect.defineMetadata(FIELD_OPTIONS_METADATA, newOptions, target, propertyKey);
  };
}
