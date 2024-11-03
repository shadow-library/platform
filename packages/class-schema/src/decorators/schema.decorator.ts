/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { JSONObjectSchema } from '@lib/types';
import { SCHEMA_OPTIONS_METADATA } from '@lib/constants';

/**
 * Defining types
 */

export type SchemaOptions = Partial<JSONObjectSchema>;

/**
 * Declaring the constants
 */
let counter = 0;

export function Schema(options: SchemaOptions = {}): ClassDecorator {
  return target => {
    if (!options.$id) options.$id = `class-schema://${target.name}-${counter++}`;
    Reflect.defineMetadata(SCHEMA_OPTIONS_METADATA, options, target);
  };
}
