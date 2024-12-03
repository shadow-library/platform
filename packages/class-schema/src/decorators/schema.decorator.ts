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

/**
 * Declaring the constants
 */
let counter = 0;

export function Schema(options: Partial<JSONObjectSchema> = {}): ClassDecorator {
  options.type = 'object';

  return target => {
    if (!options.$id) options.$id = `class-schema:${target.name}-${counter++}`;
    Reflect.defineMetadata(SCHEMA_OPTIONS_METADATA, options, target);
  };
}
