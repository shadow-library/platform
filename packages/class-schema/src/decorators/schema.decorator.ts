/**
 * Importing npm packages
 */
import { Reflector } from '@shadow-library/common';
import { Class } from 'type-fest';

/**
 * Importing user defined packages
 */
import { METADATA_KEYS } from '@lib/constants';
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

  /** Conditional schema - if */
  if?: JSONSchema;
  then?: JSONSchema;
  else?: JSONSchema;
}

/**
 * Declaring the constants
 */
let counter = 0;

export function Schema(options: SchemaOptions = {}): ClassDecorator {
  const { additionalProperties, patternProperties, ...objectProperties } = options;
  const schema: JSONSchema = { ...objectProperties, type: 'object' };

  const metadata: Record<string, any> = {};
  if (additionalProperties !== undefined) metadata.additionalProperties = additionalProperties;
  if (patternProperties !== undefined) metadata.patternProperties = patternProperties;

  return target => {
    if (!schema.$id) schema.$id = `class-schema:${target.name}-${counter++}`;
    Reflector.updateMetadata(METADATA_KEYS.SCHEMA_OPTIONS, schema, target);
    if (Object.keys(metadata).length) Reflector.updateMetadata(METADATA_KEYS.SCHEMA_EXTRA_PROPERTIES, metadata, target);
  };
}
