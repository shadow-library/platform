/**
 * Importing npm packages
 */
import { Class } from 'type-fest';

/**
 * Importing user defined packages
 */
import { SCHEMA_EXTRA_PROPERTIES_METADATA, SCHEMA_OPTIONS_METADATA } from '@lib/constants';
import { JSONSchema } from '@lib/interfaces';

/**
 * Defining types
 */

export interface SchemaOptions {
  /** ID of the schema */
  $id?: string;

  /** Title of the schema */
  title?: string;

  /** Description of the schema */
  description?: string;

  /** Maximum number of properties in the object */
  maxProperties?: number;

  /** Minimum number of properties in the object */
  minProperties?: number;

  /** Properties having key in a particular pattern and the value of the type */
  patternProperties?: Record<string, Class<unknown>>;

  /** Additional Properties of the object */
  additionalProperties?: boolean | Class<unknown>;
}

/**
 * Declaring the constants
 */
let counter = 0;

export function Schema(options: SchemaOptions = {}): ClassDecorator {
  const { additionalProperties, patternProperties, ...objectProperties } = options;
  const schema: JSONSchema = { ...objectProperties, type: 'object' };

  const metadata: Record<string, any> = {};
  if (additionalProperties) metadata.additionalProperties = additionalProperties;
  if (patternProperties) metadata.patternProperties = patternProperties;

  return target => {
    if (!schema.$id) schema.$id = `class-schema:${target.name}-${counter++}`;
    Reflect.defineMetadata(SCHEMA_OPTIONS_METADATA, schema, target);
    if (Object.keys(metadata).length) Reflect.defineMetadata(SCHEMA_EXTRA_PROPERTIES_METADATA, metadata, target);
  };
}
