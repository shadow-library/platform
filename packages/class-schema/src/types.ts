/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export type JSONSchemaType = 'string' | 'number' | 'boolean' | 'array' | 'object';

export interface JSONSchema {
  /** Basic schema properties */
  $schema?: string;
  $id?: string;
  $ref?: string;
  type?: JSONSchemaType | JSONSchemaType[];

  /** Object-related properties */
  properties?: Record<string, JSONSchema>;
  required?: string[];
  additionalProperties?: boolean | JSONSchema;
  patternProperties?: Record<string, JSONSchema>;
  dependencies?: Record<string, JSONSchema | string[]>;

  /** Array-related properties */
  items?: JSONSchema | JSONSchema[];
  additionalItems?: boolean | JSONSchema;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;

  /** String-related properties */
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  enum?: any[];

  /** Number-related properties */
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;

  /** Conditional subschemas */
  allOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  not?: JSONSchema;

  /** Metadata and annotations */
  title?: string;
  description?: string;
  default?: any;
  examples?: any[];

  /** Other possible fields */
  const?: any;
  definitions?: Record<string, JSONSchema>;
}
