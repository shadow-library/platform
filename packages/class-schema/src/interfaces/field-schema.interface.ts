export interface BaseFieldSchema<T> {
  enum?: T[];

  examples?: T[];

  /** Whether this field may be omitted; fields are required unless this is true */
  optional?: boolean;

  /** Makes this field required only when the named sibling field is present, instead of always */
  requiredIf?: string;

  description?: string;

  const?: T;

  /** Adds `null` to the accepted types */
  nullable?: boolean;

  default?: T;
}

export interface ArrayFieldSchema extends BaseFieldSchema<any[]> {
  minItems?: number;

  maxItems?: number;

  uniqueItems?: boolean;
}

export interface StringFieldSchema extends BaseFieldSchema<string> {
  minLength?: number;

  maxLength?: number;

  pattern?: string;

  format?: string;
}

export interface NumberFieldSchema extends BaseFieldSchema<number> {
  minimum?: number;

  maximum?: number;

  exclusiveMinimum?: number;

  exclusiveMaximum?: number;

  multipleOf?: number;
}

export interface ObjectFieldSchema extends BaseFieldSchema<object> {
  additionalProperties?: boolean;

  properties?: Record<string, FieldSchema>;

  patternProperties?: Record<string, FieldSchema>;
}

export type EnumFieldSchema = Omit<BaseFieldSchema<string | number>, 'const' | 'enum' | 'examples'>;

export type BooleanFieldSchema = BaseFieldSchema<boolean>;

export type FieldSchema = ObjectFieldSchema | ArrayFieldSchema | StringFieldSchema | NumberFieldSchema | BooleanFieldSchema;

export type AnyFieldSchema = ObjectFieldSchema & ArrayFieldSchema & StringFieldSchema & NumberFieldSchema & BooleanFieldSchema;
