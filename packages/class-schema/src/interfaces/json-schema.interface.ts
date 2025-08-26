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

export interface JSONSchema {
  /** Basic schema properties */
  $id?: string;
  $ref?: string;
  type?: JSONSchemaType | JSONSchemaType[];
  definitions?: Record<string, JSONSchema>;

  /** Metadata and annotations */
  title?: string;
  description?: string;
  const?: any;
  enum?: any[];
  default?: any;
  examples?: any[];

  /** Object properties */
  properties?: Record<string, JSONSchema>;
  required?: string[];
  maxProperties?: number;
  minProperties?: number;
  additionalProperties?: boolean | JSONSchema;
  patternProperties?: Record<string, JSONSchema>;
  dependencies?: Record<string, string[]>;

  /** Array properties */
  items?: JSONSchema;
  additionalItems?: boolean | JSONSchema;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;

  /** String properties */
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;

  /** Number properties */
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;

  /** Conditional properties */
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

  /** Other possible fields */
  [key: string]: unknown;
}
