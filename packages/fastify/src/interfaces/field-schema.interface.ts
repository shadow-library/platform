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
 * Message returned to the client when a field fails validation. A plain string covers every failure mode of the field,
 * including a missing value, while the object form keys messages by JSON Schema keyword with `_` as the catch all.
 */
export type FieldErrorMessage = string | (Record<string, string> & { _?: string });

/**
 * Declaring the constants
 */

/**
 * Contributed from this package rather than from `@shadow-library/class-schema` so that the schema generator stays a
 * pure JSON Schema concern; the key is carried through untouched and interpreted here when formatting request errors.
 */
declare module '@shadow-library/class-schema' {
  /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
  interface BaseFieldSchema<T> {
    /** Message returned to the client when this field fails validation; `{placeholder}` resolves against the failing rule's params */
    errorMessage?: FieldErrorMessage;
  }
}
