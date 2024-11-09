/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { SCHEMA_OPTIONS_METADATA } from '@lib/constants';
import { JSONObjectSchema } from '@lib/interfaces';

/**
 * Defining types
 */

export type SchemaOptions = Partial<JSONObjectSchema>;

/**
 * Declaring the constants
 */
let counter = 0;

export function Schema(options: SchemaOptions = {}): ClassDecorator {
  options.type = 'object';

  return target => {
    if (!options.$id) options.$id = `class-schema:${target.name}-${counter++}`;
    Reflect.defineMetadata(SCHEMA_OPTIONS_METADATA, options, target);
  };
}
