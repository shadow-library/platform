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

/* eslint-disable-next-line @typescript-eslint/no-extraneous-class */
export class Integer {}

export const METADATA_KEYS = {
  DESIGN_TYPE: 'design:type',

  FIELD_TYPE: Symbol('field-type'),
  FIELD_OPTIONS: Symbol('field-options'),

  SCHEMA_OPTIONS: Symbol('schema-options'),
  SCHEMA_FIELDS: Symbol('schema-fields'),
  SCHEMA_EXTRA_PROPERTIES: Symbol('schema-object'),
  COMPOSED_CLASS: Symbol('composed-class'),
} as const satisfies Record<string, string | symbol>;
