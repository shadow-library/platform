/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export interface BaseFieldSchema<T> {
  /** Allowed values */
  enum?: T[];

  /** Example values */
  examples?: T[];

  /** Whether this field is optional, false by default */
  optional?: boolean;

  /** Determines this field is required if the fields mentioned in the value is present */
  requiredIf?: string;

  /** Description about this field */
  description?: string;

  /** Constant value of the field */
  const?: T;

  /** Whether null is allowed */
  nullable?: boolean;

  /** Default value of the field */
  default?: T;
}

export interface ArrayFieldSchema extends BaseFieldSchema<any[]> {
  /** Minimum number of items in the array */
  minItems?: number;

  /** Maximum number of items in the array */
  maxItems?: number;

  /** Whether all items in the array should be unique */
  uniqueItems?: boolean;
}

export interface StringFieldSchema extends BaseFieldSchema<string> {
  /** Minimum length of the string */
  minLength?: number;

  /** Maximum length of the string */
  maxLength?: number;

  /** Regular expression pattern to match the string */
  pattern?: string;

  /** Format of the string, e.g., date, email, etc. */
  format?: string;
}

export interface NumberFieldSchema extends BaseFieldSchema<number> {
  /** Minimum value of the number */
  minimum?: number;

  /** Maximum value of the number */
  maximum?: number;

  /** Minimum value of the number, exclusive */
  exclusiveMinimum?: number;

  /** Maximum value of the number, exclusive */
  exclusiveMaximum?: number;

  /** Value should be multiple of */
  multipleOf?: number;
}

export type BooleanFieldSchema = BaseFieldSchema<boolean>;

export type ObjectFieldSchema = BaseFieldSchema<object>;

export type FieldSchema = ObjectFieldSchema | ArrayFieldSchema | StringFieldSchema | NumberFieldSchema | BooleanFieldSchema;

export type AnyFieldSchema = ObjectFieldSchema & ArrayFieldSchema & StringFieldSchema & NumberFieldSchema & BooleanFieldSchema;
