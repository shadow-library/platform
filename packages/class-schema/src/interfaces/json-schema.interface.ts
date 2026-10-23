import { SetRequired } from 'type-fest';

export type JSONSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null';

export interface JSONSchema {
  $id?: string;
  $ref?: string;
  type?: JSONSchemaType | JSONSchemaType[];
  definitions?: Record<string, JSONSchema>;

  title?: string;
  description?: string;
  const?: any;
  enum?: any[];
  default?: any;
  examples?: any[];

  properties?: Record<string, JSONSchema>;
  required?: string[];
  maxProperties?: number;
  minProperties?: number;
  additionalProperties?: boolean | JSONSchema;
  patternProperties?: Record<string, JSONSchema>;
  dependencies?: Record<string, string[]>;

  items?: JSONSchema;
  additionalItems?: boolean | JSONSchema;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;

  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;

  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;

  allOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  not?: JSONSchema;
  if?: JSONSchema;
  then?: JSONSchema;
  else?: JSONSchema;
  discriminator?: {
    propertyName: string;
    mapping?: Record<string, string>;
  };

  [key: string]: any;
}

export type ParsedSchema = SetRequired<JSONSchema, '$id' | 'type'> & { definitions?: Record<string, ParsedSchema> };
