/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export type JSONSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null';

export interface JSONBasicSchema<T> {
  /** Basic schema properties */
  $id?: string;
  $ref?: string;
  type?: JSONSchemaType | JSONSchemaType[];

  /** Metadata and annotations */
  title?: string;
  description?: string;
  enum?: T[];
  default?: T;
  examples?: T[];

  /** Other possible fields */
  const?: T;
  definitions?: Record<string, JSONSchema>;
  [key: string]: unknown;
}

export interface JSONObjectSchema<IsField extends boolean = false> extends JSONBasicSchema<object> {
  type: 'object';
  properties?: Record<string, JSONSchema>;
  required?: IsField extends true ? boolean : string[];
  maxProperties?: number;
  minProperties?: number;
  additionalProperties?: boolean | JSONSchema;
  patternProperties?: Record<string, JSONSchema>;
  dependencies?: Record<string, JSONSchema | string[]>;
}

export interface JSONArraySchema extends JSONBasicSchema<any[]> {
  type: 'array';
  items?: JSONSchema | JSONSchema[];
  additionalItems?: boolean | JSONSchema;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
}

export interface JSONStringSchema extends JSONBasicSchema<string> {
  type: 'string';
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
}

export interface JSONNumberSchema extends JSONBasicSchema<number> {
  type: 'number';
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
}

export interface JSONConditionalSchema extends JSONBasicSchema<unknown> {
  allOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  not?: JSONSchema;

  if?: JSONSchema;
  then?: JSONSchema;
  else?: JSONSchema;
}

export type JSONSchema<IsField extends boolean = false> =
  | JSONBasicSchema<any>
  | JSONObjectSchema<IsField>
  | JSONArraySchema
  | JSONStringSchema
  | JSONNumberSchema
  | JSONConditionalSchema;
