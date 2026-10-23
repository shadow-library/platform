import { Class } from 'type-fest';
import { Reflector } from '@shadow-library/common';

import { getCounterId, METADATA_KEYS } from '@lib/constants';
import { JSONSchema } from '@lib/interfaces';

export interface SchemaOptions {
  $id?: string;

  title?: string;

  description?: string;

  maxProperties?: number;

  minProperties?: number;

  /** Classes that values of properties whose key matches each regex pattern must conform to */
  patternProperties?: Record<string, Class<unknown>>;

  /** `false` by default; a class validates unknown properties against its schema */
  additionalProperties?: boolean | Class<unknown>;

  if?: JSONSchema;
  then?: JSONSchema;
  else?: JSONSchema;
}

export function Schema(options: SchemaOptions = {}): ClassDecorator {
  const { additionalProperties, patternProperties, ...objectProperties } = options;
  const schema: JSONSchema = { ...objectProperties, type: 'object', additionalProperties: false };

  const metadata: Record<string, any> = {};
  if (additionalProperties !== undefined) metadata.additionalProperties = additionalProperties;
  if (patternProperties !== undefined) metadata.patternProperties = patternProperties;

  return target => {
    if (!schema.$id) schema.$id = `class-schema:${target.name}-${getCounterId()}`;
    Reflector.updateMetadata(METADATA_KEYS.SCHEMA_OPTIONS, schema, target);
    if (Object.keys(metadata).length) Reflector.updateMetadata(METADATA_KEYS.SCHEMA_EXTRA_PROPERTIES, metadata, target);
  };
}
