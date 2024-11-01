/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

type SchemaWithOutType<T> = Omit<T, 'type'>;

export type JSONSchemaType = 'string' | 'number' | 'boolean' | 'array' | 'object';

export interface JSONBasicSchema {
  /** Basic schema properties */
  $schema?: string;
  $id?: string;
  $ref?: string;
  type?: JSONSchemaType | JSONSchemaType[];

  /** Metadata and annotations */
  title?: string;
  description?: string;
  default?: any;
  examples?: any[];

  /** Other possible fields */
  const?: any;
  definitions?: Record<string, JSONSchema>;
}

export interface JSONObjectSchema extends JSONBasicSchema {
  type: 'object';
  properties?: Record<string, JSONSchema>;
  required?: string[];
  additionalProperties?: boolean | JSONSchema;
  patternProperties?: Record<string, JSONSchema>;
  dependencies?: Record<string, JSONSchema | string[]>;
}

export interface JSONArraySchema extends JSONBasicSchema {
  type: 'array';
  items?: JSONSchema | JSONSchema[];
  additionalItems?: boolean | JSONSchema;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
}

export interface JSONStringSchema extends JSONBasicSchema {
  type: 'string';
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  enum?: any[];
}

export interface JSONNumberSchema extends JSONBasicSchema {
  type: 'number';
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
}

export interface JSONConditionalSchema extends JSONBasicSchema {
  allOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  not?: JSONSchema;
}

export interface JSONSchema
  extends SchemaWithOutType<JSONBasicSchema>,
    SchemaWithOutType<JSONObjectSchema>,
    SchemaWithOutType<JSONArraySchema>,
    SchemaWithOutType<JSONStringSchema>,
    SchemaWithOutType<JSONNumberSchema>,
    SchemaWithOutType<JSONConditionalSchema> {}
